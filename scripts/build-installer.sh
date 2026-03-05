#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# r3ditor — Linux Installer Build Script
# Builds deb, AppImage, and RPM packages via Tauri 2
# ═══════════════════════════════════════════════════════════════════
#
# Usage:
#   ./scripts/build-installer.sh              # Full build
#   ./scripts/build-installer.sh --skip-frontend  # Skip npm build
#   ./scripts/build-installer.sh --verbose        # Verbose cargo output
#
# Prerequisites:
#   - Rust (stable), Node.js (≥18), npm
#   - System libs: libwebkit2gtk-4.1-dev, libgtk-3-dev,
#                  libayatana-appindicator3-dev, librsvg2-dev,
#                  libssl-dev, libsoup-3.0-dev, patchelf

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Colors ──────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

step()  { echo -e "  ${CYAN}▸${NC} $1"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; exit 1; }

SKIP_FRONTEND=false
VERBOSE=""

for arg in "$@"; do
    case "$arg" in
        --skip-frontend) SKIP_FRONTEND=true ;;
        --verbose)       VERBOSE="--verbose" ;;
        -h|--help)
            echo "Usage: $0 [--skip-frontend] [--verbose]"
            exit 0 ;;
    esac
done

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       r3ditor — Linux Installer Builder          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Prerequisites ───────────────────────────────────────
step "Checking prerequisites..."

command -v rustc >/dev/null 2>&1 || fail "Rust is not installed. Install from https://rustup.rs/"
ok "Rust: $(rustc --version)"

command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install from https://nodejs.org/"
ok "Node.js: $(node --version)"

command -v npm >/dev/null 2>&1 || fail "npm is not installed."
ok "npm: $(npm --version)"

# System library check (best-effort)
step "Checking system libraries..."
MISSING_LIBS=""
for lib in libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev; do
    if ! dpkg -s "$lib" >/dev/null 2>&1; then
        MISSING_LIBS="$MISSING_LIBS $lib"
    fi
done

if [ -n "$MISSING_LIBS" ]; then
    warn "Missing packages:$MISSING_LIBS"
    echo "  Install with: sudo apt-get install -y$MISSING_LIBS"
    echo ""
    read -p "  Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    ok "System libraries present"
fi

# Tauri CLI
if ! cargo install --list 2>/dev/null | grep -q "tauri-cli"; then
    step "Installing Tauri CLI..."
    cargo install tauri-cli --version "^2.0" --locked
    ok "Tauri CLI installed"
else
    ok "Tauri CLI found"
fi

# ─── Frontend Build ─────────────────────────────────────
if [ "$SKIP_FRONTEND" = false ]; then
    step "Installing frontend dependencies..."
    cd "$PROJECT_ROOT/apps/desktop"
    npm ci
    ok "Frontend dependencies installed"

    step "Building frontend..."
    npm run build
    ok "Frontend built → apps/desktop/dist/"
    cd "$PROJECT_ROOT"
else
    warn "Skipping frontend build (--skip-frontend)"
fi

# ─── Tauri Build ────────────────────────────────────────
step "Building Tauri application and installers..."
cd "$PROJECT_ROOT/apps/desktop/src-tauri"
cargo tauri build $VERBOSE
cd "$PROJECT_ROOT"

# ─── Locate Outputs ────────────────────────────────────
echo ""
step "Locating build artifacts..."

ARTIFACTS=0
DIST_DIR="$PROJECT_ROOT/dist"
mkdir -p "$DIST_DIR"

# DEB
for f in "$PROJECT_ROOT"/target/release/bundle/deb/*.deb 2>/dev/null; do
    [ -f "$f" ] || continue
    SIZE=$(du -h "$f" | cut -f1)
    ok "DEB: $(basename "$f")  ($SIZE)"
    cp "$f" "$DIST_DIR/"
    ARTIFACTS=$((ARTIFACTS + 1))
done

# AppImage
for f in "$PROJECT_ROOT"/target/release/bundle/appimage/*.AppImage 2>/dev/null; do
    [ -f "$f" ] || continue
    SIZE=$(du -h "$f" | cut -f1)
    ok "AppImage: $(basename "$f")  ($SIZE)"
    cp "$f" "$DIST_DIR/"
    ARTIFACTS=$((ARTIFACTS + 1))
done

# RPM
for f in "$PROJECT_ROOT"/target/release/bundle/rpm/*.rpm 2>/dev/null; do
    [ -f "$f" ] || continue
    SIZE=$(du -h "$f" | cut -f1)
    ok "RPM: $(basename "$f")  ($SIZE)"
    cp "$f" "$DIST_DIR/"
    ARTIFACTS=$((ARTIFACTS + 1))
done

if [ "$ARTIFACTS" -eq 0 ]; then
    warn "No installer artifacts found. Check the build output above."
else
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║    Build Complete — $ARTIFACTS artifact(s) → dist/          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
fi

echo ""
