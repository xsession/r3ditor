<#
.SYNOPSIS
    r3ditor - Build script for the CAD/CAM desktop editor.

.DESCRIPTION
    Builds the React/Three.js frontend (Vite) and the Rust backend (Tauri 2 workspace)
    into a single Tauri desktop application.

.PARAMETER Mode
    Build mode: "debug" (fast compile, opt-level=1) or "release" (LTO, stripped, opt-level=3).
    Default: "debug"

.PARAMETER SkipFrontend
    Skip the frontend build (reuse existing apps/desktop/dist/).

.PARAMETER SkipBackend
    Skip the Rust workspace build.

.PARAMETER Clean
    Clean all build artifacts before building.

.PARAMETER Run
    Launch the application after a successful build.

.PARAMETER Dev
    Start in development mode (Vite HMR + Tauri hot-reload).
    Ignores -Mode, -SkipFrontend, -SkipBackend flags.

.PARAMETER Test
    Run all workspace tests instead of building.

.PARAMETER Lint
    Run clippy + eslint instead of building.

.PARAMETER Installer
    Build a distributable installer via `cargo tauri build`.

.EXAMPLE
    .\build.ps1                       # Debug build (fast)
    .\build.ps1 -Mode release         # Release build (optimized)
    .\build.ps1 -Mode release -Run    # Release build + auto-launch
    .\build.ps1 -Dev                  # Vite HMR + Tauri hot-reload
    .\build.ps1 -SkipFrontend         # Rebuild only the Rust backend
    .\build.ps1 -Clean                # Full clean + debug build
    .\build.ps1 -Test                 # Run all workspace tests
    .\build.ps1 -Lint                 # Run clippy + eslint
    .\build.ps1 -Installer            # Build distributable installer
#>

param(
    [ValidateSet("debug", "release")]
    [string]$Mode = "debug",

    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$Clean,
    [switch]$Run,
    [switch]$Dev,
    [switch]$Test,
    [switch]$Lint,
    [switch]$Installer
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# --- Ensure Rust toolchain is on PATH --------------------------------
$RustBin = Join-Path $env:USERPROFILE ".rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"
if (Test-Path $RustBin) {
    if ($env:Path -notlike "*$RustBin*") {
        $env:Path = "$RustBin;$env:Path"
    }
}

# --- Paths -----------------------------------------------------------
$Root         = $PSScriptRoot
$DesktopApp   = Join-Path $Root "apps\desktop"
$TauriDir     = Join-Path $DesktopApp "src-tauri"
$FrontendDist = Join-Path $DesktopApp "dist"

$IsRelease    = ($Mode -eq "release")
$CargoProfile = if ($IsRelease) { "release" } else { "debug" }
$OutputDir    = Join-Path $Root "target\$CargoProfile"
$ExeName      = "r3ditor-desktop.exe"
$ExePath      = Join-Path $OutputDir $ExeName

# --- Helpers ----------------------------------------------------------
function Write-Step($icon, $msg) {
    Write-Host ""
    Write-Host "  [$icon] " -NoNewline -ForegroundColor Cyan
    Write-Host $msg -ForegroundColor White
    Write-Host ("  " + ("-" * 50)) -ForegroundColor DarkGray
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Err($msg) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
}

function Write-Info($msg) {
    Write-Host "     -> $msg" -ForegroundColor DarkGray
}

function Get-ElapsedStr($sw) {
    $e = $sw.Elapsed
    if ($e.TotalSeconds -lt 60) { return "{0:N1}s" -f $e.TotalSeconds }
    return "{0}m {1:N0}s" -f [math]::Floor($e.TotalMinutes), ($e.TotalSeconds % 60)
}

function Stop-ExistingProcess {
    $procs = Get-Process -Name "r3ditor-desktop" -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Info "Stopping running r3ditor-desktop instance(s)..."
        $procs | Stop-Process -Force
        Start-Sleep -Milliseconds 500
    }
}

# --- Read version from workspace Cargo.toml --------------------------
$cargoToml = Join-Path $Root "Cargo.toml"
$version = "unknown"
foreach ($line in (Get-Content $cargoToml)) {
    if ($line -match '^version\s*=\s*"([^"]+)"') {
        $version = $Matches[1]
        break
    }
}

# --- Banner -----------------------------------------------------------
Write-Host ""
Write-Host "  r3ditor Builder" -ForegroundColor Cyan
Write-Host "  ================================" -ForegroundColor DarkGray
Write-Host "  Version : $version" -ForegroundColor Gray
$modeColor = if ($IsRelease) { "Yellow" } else { "Green" }
Write-Host "  Mode    : $($Mode.ToUpper())" -ForegroundColor $modeColor
Write-Host "  ================================" -ForegroundColor DarkGray

$totalSw = [System.Diagnostics.Stopwatch]::StartNew()

# === DEV MODE =========================================================
if ($Dev) {
    Write-Step "DEV" "Starting development mode (Vite HMR + Tauri hot-reload)"

    Push-Location $DesktopApp
    try {
        if (-not (Test-Path (Join-Path $DesktopApp "node_modules"))) {
            Write-Info "Installing npm dependencies..."
            & npm ci --silent
            if ($LASTEXITCODE -ne 0) { Write-Err "npm ci failed"; exit 1 }
        }

        Stop-ExistingProcess
        Write-Info "Running: npx tauri dev"
        Write-Host ""
        & npx tauri dev
    } finally {
        Pop-Location
    }
    exit 0
}

# === TEST MODE ========================================================
if ($Test) {
    Write-Step "TEST" "Running workspace tests"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    Push-Location $Root
    try {
        Write-Info "cargo test --workspace"
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & cargo test --workspace 2>&1 | ForEach-Object {
            $line = "$_".Trim()
            if ($line -match "test result|running \d+ test|FAILED|error\[E") {
                Write-Info $line
            }
        }
        $testExit = $LASTEXITCODE
        $ErrorActionPreference = $prevPref

        if ($testExit -ne 0) { Write-Err "Tests failed (exit $testExit)"; exit 1 }
    } finally {
        Pop-Location
    }

    $sw.Stop()
    Write-Ok "All tests passed ($(Get-ElapsedStr $sw))"
    exit 0
}

# === LINT MODE ========================================================
if ($Lint) {
    Write-Step "LINT" "Running clippy + eslint"
    $lintFailed = $false

    # Rust clippy
    Write-Info "cargo clippy --workspace -- -D warnings"
    Push-Location $Root
    try {
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & cargo clippy --workspace -- -D warnings 2>&1 | ForEach-Object {
            $line = "$_".Trim()
            if ($line -match "warning:|error\[E|Finished") {
                Write-Info $line
            }
        }
        if ($LASTEXITCODE -ne 0) { $lintFailed = $true; Write-Err "Clippy failed" }
        $ErrorActionPreference = $prevPref
    } finally {
        Pop-Location
    }

    # TypeScript eslint
    Write-Info "npm run lint (apps/desktop)"
    Push-Location $DesktopApp
    try {
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & npm run lint 2>&1 | ForEach-Object { Write-Info "$_".Trim() }
        if ($LASTEXITCODE -ne 0) { $lintFailed = $true; Write-Err "ESLint failed" }
        $ErrorActionPreference = $prevPref
    } finally {
        Pop-Location
    }

    if ($lintFailed) { exit 1 }
    Write-Ok "All linting passed"
    exit 0
}

# === INSTALLER MODE ===================================================
if ($Installer) {
    Write-Step "INSTALLER" "Building distributable installer via cargo tauri build"

    Push-Location $DesktopApp
    try {
        if (-not (Test-Path (Join-Path $DesktopApp "node_modules"))) {
            Write-Info "Installing npm dependencies..."
            & npm ci --silent
            if ($LASTEXITCODE -ne 0) { Write-Err "npm ci failed"; exit 1 }
        }

        Write-Info "npm run build (frontend)"
        & npm run build
        if ($LASTEXITCODE -ne 0) { Write-Err "Frontend build failed"; exit 1 }

        Write-Info "npx tauri build"
        & npx tauri build
        if ($LASTEXITCODE -ne 0) { Write-Err "Tauri build failed"; exit 1 }
    } finally {
        Pop-Location
    }

    Write-Ok "Installer built - check apps/desktop/src-tauri/target/release/bundle/"
    exit 0
}

# === CLEAN ============================================================
if ($Clean) {
    Write-Step "CLEAN" "Cleaning build artifacts"

    if (Test-Path $FrontendDist) {
        Remove-Item $FrontendDist -Recurse -Force
        Write-Info "Removed apps/desktop/dist"
    }

    Push-Location $Root
    try {
        & cargo clean 2>$null
        Write-Info "Ran cargo clean"
    } finally {
        Pop-Location
    }

    Write-Ok "Clean complete"
}

# === FRONTEND BUILD ===================================================
if (-not $SkipFrontend) {
    Write-Step "FRONTEND" "Building frontend (Vite + React + Three.js)"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    Push-Location $DesktopApp
    try {
        # Ensure node_modules exist
        if (-not (Test-Path (Join-Path $DesktopApp "node_modules"))) {
            Write-Info "Installing npm dependencies..."
            & npm ci --silent
            if ($LASTEXITCODE -ne 0) { Write-Err "npm ci failed"; exit 1 }
        }

        # Type-check
        Write-Info "Type-checking TypeScript..."
        & npx tsc -p tsconfig.app.json --noEmit
        if ($LASTEXITCODE -ne 0) { Write-Err "TypeScript errors found"; exit 1 }

        # Build
        Write-Info "Bundling with Vite..."
        & npx vite build
        if ($LASTEXITCODE -ne 0) { Write-Err "Vite build failed"; exit 1 }
    } finally {
        Pop-Location
    }

    $sw.Stop()
    $distFiles = Get-ChildItem $FrontendDist -Recurse -File
    $distSize = ($distFiles | Measure-Object -Property Length -Sum).Sum
    $distSizeKB = [math]::Round($distSize / 1KB)
    $fileCount = $distFiles.Count
    $elapsed = Get-ElapsedStr $sw
    Write-Ok "Frontend built ($elapsed, $fileCount files, $($distSizeKB) KB)"
} else {
    Write-Step "SKIP" "Skipping frontend build (using existing dist/)"
    if (-not (Test-Path $FrontendDist)) {
        Write-Err "apps/desktop/dist not found! Remove -SkipFrontend or build frontend first."
        exit 1
    }
    $distFiles = Get-ChildItem $FrontendDist -Recurse -File
    $distSizeKB = [math]::Round(($distFiles | Measure-Object -Property Length -Sum).Sum / 1KB)
    $fileCount = $distFiles.Count
    Write-Info "Existing dist/: $fileCount files, $($distSizeKB) KB"
}

# === BACKEND BUILD ====================================================
if (-not $SkipBackend) {
    $modeLabel = $Mode.ToUpper()
    Write-Step "RUST" "Building Rust workspace ($modeLabel - 15 crates + Tauri)"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    Stop-ExistingProcess

    Push-Location $Root
    try {
        $cargoArgs = @("build", "-p", "r3ditor-desktop")
        if ($IsRelease) {
            $cargoArgs += "--release"
            Write-Info "Release mode: LTO=fat, strip, codegen-units=1 (takes several minutes)"
        } else {
            Write-Info "Debug mode: opt-level=1, deps at opt-level=2"
        }

        # Cargo writes progress to stderr; temporarily lower error preference
        $env:CARGO_TERM_COLOR = "never"
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & cargo @cargoArgs 2>&1 | ForEach-Object {
            $line = "$_".Trim()
            if ($line -match "Compiling r3ditor|Compiling editor|Compiling cad|Compiling cam|Compiling shared|Finished|error\[E|warning:") {
                Write-Info $line
            }
        }
        $cargoExit = $LASTEXITCODE
        $ErrorActionPreference = $prevPref

        if ($cargoExit -ne 0) {
            Write-Err "Cargo build failed (exit $cargoExit)"
            exit 1
        }

        # Verify binary exists
        if (-not (Test-Path $ExePath)) {
            Write-Err "Build failed - binary not found at $ExePath"
            exit 1
        }
    } finally {
        Pop-Location
    }

    $sw.Stop()
    $exeSizeMB = [math]::Round((Get-Item $ExePath).Length / 1MB, 1)
    $elapsed = Get-ElapsedStr $sw
    Write-Ok "Backend built ($elapsed, $($exeSizeMB) MB)"
} else {
    Write-Step "SKIP" "Skipping backend build"
    if (-not (Test-Path $ExePath)) {
        Write-Err "Binary not found at $ExePath! Remove -SkipBackend or build backend first."
        exit 1
    }
}

# === SUMMARY ==========================================================
$totalSw.Stop()
$finalSize = [math]::Round((Get-Item $ExePath).Length / 1MB, 1)

Write-Host ""
Write-Host "  ================================" -ForegroundColor DarkGray
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
Write-Host "  --------------------------------" -ForegroundColor DarkGray
Write-Host "  Binary : $ExePath" -ForegroundColor Gray
Write-Host "  Size   : $($finalSize) MB" -ForegroundColor Gray
$totalElapsed = Get-ElapsedStr $totalSw
Write-Host "  Time   : $totalElapsed" -ForegroundColor Gray
Write-Host "  ================================" -ForegroundColor DarkGray
Write-Host ""

# === AUTO-RUN =========================================================
if ($Run) {
    Write-Step "RUN" "Launching r3ditor"

    Stop-ExistingProcess

    Write-Info "Starting $ExePath"
    Write-Host ""
    & $ExePath
}
