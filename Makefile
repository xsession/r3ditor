# ═══════════════════════════════════════════════════════════════════
# r3ditor — Makefile
# ═══════════════════════════════════════════════════════════════════

.PHONY: help dev build test lint clean install-deps frontend \
        installer-windows installer-linux release-local docs

SHELL := /bin/bash

# ─── Help ────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m  %-22s\033[0m %s\n", $$1, $$2}'

# ─── Development ────────────────────────────────────────
install-deps: ## Install all dependencies (Rust + Node)
	cd apps/desktop && npm ci
	cargo fetch

dev: ## Run in development mode (Tauri + Vite HMR)
	cd apps/desktop/src-tauri && cargo tauri dev

build: ## Build the application (debug)
	cd apps/desktop && npm run build
	cargo build -p r3ditor-desktop

build-release: ## Build the application (release)
	cd apps/desktop && npm run build
	cargo build -p r3ditor-desktop --release

frontend: ## Build only the frontend
	cd apps/desktop && npm run build

# ─── Testing ────────────────────────────────────────────
test: ## Run all Rust tests
	cargo test --workspace

test-cad: ## Run CAD kernel tests only
	cargo test -p cad-kernel

test-cam: ## Run CAM engine tests only
	cargo test -p cam-engine

lint: ## Lint Rust + TypeScript
	cargo clippy --workspace -- -D warnings
	cd apps/desktop && npm run lint

# ─── Installers ─────────────────────────────────────────
installer-linux: ## Build Linux installers (deb, AppImage, RPM)
	bash scripts/build-installer.sh

installer-windows: ## Build Windows installer (NSIS)
	powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1

release-local: ## Build release artifacts for current platform
	cd apps/desktop/src-tauri && cargo tauri build

# ─── Documentation ──────────────────────────────────────
docs: ## Compile Typst documentation to PDF
	typst compile docs/main.typ docs/r3ditor-documentation.pdf

docs-watch: ## Watch and recompile docs on changes
	typst watch docs/main.typ docs/r3ditor-documentation.pdf

# ─── Bench ──────────────────────────────────────────────
bench: ## Run benchmarks
	cargo bench -p r3ditor-bench

# ─── Cleanup ────────────────────────────────────────────
clean: ## Clean all build artifacts
	cargo clean
	rm -rf apps/desktop/dist
	rm -rf apps/desktop/node_modules
	rm -rf dist/

clean-rust: ## Clean only Rust artifacts
	cargo clean
