<# 
.SYNOPSIS
    r3ditor — Windows Installer Build Script
.DESCRIPTION
    Builds the r3ditor desktop application and generates an NSIS installer
    for Windows distribution. Requires Rust, Node.js, and the Tauri CLI.
.EXAMPLE
    .\scripts\build-installer.ps1
    .\scripts\build-installer.ps1 -Release
    .\scripts\build-installer.ps1 -SkipFrontend
#>

param(
    [switch]$Release,
    [switch]$SkipFrontend,
    [switch]$SkipRustCheck,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ProjectRoot) { $ProjectRoot = (Get-Location).Path }

# ─── Colors ──────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  ▸ $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║       r3ditor — Windows Installer Builder        ║" -ForegroundColor Blue
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# ─── Prerequisites ───────────────────────────────────────
Write-Step "Checking prerequisites..."

if (-not $SkipRustCheck) {
    $rustc = Get-Command rustc -ErrorAction SilentlyContinue
    if (-not $rustc) {
        Write-Fail "Rust is not installed. Install from https://rustup.rs/"
        exit 1
    }
    Write-Ok "Rust: $(rustc --version)"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Fail "Node.js is not installed. Install from https://nodejs.org/"
    exit 1
}
Write-Ok "Node.js: $(node --version)"

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    Write-Fail "npm is not installed."
    exit 1
}
Write-Ok "npm: $(npm --version)"

# Check for Tauri CLI
$tauriCli = cargo install --list 2>$null | Select-String "tauri-cli"
if (-not $tauriCli) {
    Write-Step "Installing Tauri CLI..."
    cargo install tauri-cli --version "^2.0" --locked
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to install Tauri CLI"
        exit 1
    }
    Write-Ok "Tauri CLI installed"
} else {
    Write-Ok "Tauri CLI found"
}

# ─── Frontend Build ─────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Step "Installing frontend dependencies..."
    Push-Location "$ProjectRoot\apps\desktop"
    
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm ci failed"
        Pop-Location
        exit 1
    }
    Write-Ok "Frontend dependencies installed"

    Write-Step "Building frontend..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Frontend build failed"
        Pop-Location
        exit 1
    }
    Write-Ok "Frontend built → apps/desktop/dist/"
    Pop-Location
} else {
    Write-Warn "Skipping frontend build (--SkipFrontend)"
}

# ─── Tauri Build ────────────────────────────────────────
Write-Step "Building Tauri application..."

Push-Location "$ProjectRoot\apps\desktop\src-tauri"

$buildArgs = @("tauri", "build")
if ($Verbose) { $buildArgs += "--verbose" }

cargo @buildArgs
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Tauri build failed"
    Pop-Location
    exit 1
}
Pop-Location

# ─── Locate Outputs ────────────────────────────────────
Write-Host ""
Write-Step "Locating build artifacts..."

$nsisDir = "$ProjectRoot\target\release\bundle\nsis"
$msiDir  = "$ProjectRoot\target\release\bundle\msi"

$artifacts = @()

if (Test-Path $nsisDir) {
    $nsis = Get-ChildItem "$nsisDir\*.exe" -ErrorAction SilentlyContinue
    foreach ($f in $nsis) {
        $artifacts += $f.FullName
        Write-Ok "NSIS: $($f.Name)  ($([math]::Round($f.Length / 1MB, 1)) MB)"
    }
}

if (Test-Path $msiDir) {
    $msi = Get-ChildItem "$msiDir\*.msi" -ErrorAction SilentlyContinue
    foreach ($f in $msi) {
        $artifacts += $f.FullName
        Write-Ok "MSI: $($f.Name)  ($([math]::Round($f.Length / 1MB, 1)) MB)"
    }
}

if ($artifacts.Count -eq 0) {
    Write-Warn "No installer artifacts found. Check the build output above."
} else {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║    Build Complete — $($artifacts.Count) artifact(s) generated        ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green

    # Copy to a dist folder for easy access
    $distDir = "$ProjectRoot\dist"
    if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
    foreach ($a in $artifacts) {
        Copy-Item $a -Destination $distDir -Force
        Write-Ok "Copied → dist\$(Split-Path $a -Leaf)"
    }
}

Write-Host ""
