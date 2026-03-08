# r3ditor

**Open-source 3D CAD/CAM editor** for manufacturing — built in Rust with wgpu, egui, Tauri, and React.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Rust](https://img.shields.io/badge/rust-1.93%2B-orange)
![Tests](https://img.shields.io/badge/tests-614%20passing-brightgreen)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

## ✨ Features

- **Parametric CAD Kernel** — B-Rep/NURBS modeling via Truck, 20 parametric feature kinds, full feature tree, history (undo/redo), topological naming (5-priority cascade)
- **Sketch System** — 7 entity types, 19 constraint types, entity walker, path discovery, sketch-to-mesh conversion
- **Sketch Operations** — Trim, bevel/fillet, offset path, intersection computation, cubic Bézier conversion
- **Stateful Tool Framework** — Blender/CAD_Sketcher-inspired modal tools (LineTool, CircleTool, ArcTool, RectangleTool) with continuous draw, numeric input, and state machine lifecycle
- **Snap Engine** — 7 snap types (endpoint, midpoint, center, intersection, nearest, grid, axis alignment) + GPU picking color map with spiral search
- **Snapshot & Clipboard** — In-tool undo (up to 50 snapshots), copy/paste with dependency resolution and UUID remapping
- **2D Constraint Solver** — 4-stage cascade: DogLeg → Levenberg-Marquardt → BFGS → Newton-Raphson, 19 constraint types
- **3D Assembly Solver** — Mate, Align, Offset, Angle, Fixed constraints
- **CAM Engine** — CNC toolpath generation (roughing, finishing, drilling), sheet metal nesting, G-code post-processing (8 post-processors: Fanuc, Haas, Mazak, Siemens, LinuxCNC, Grbl, Marlin, Klipper)
- **DFM Analysis** — Real-time design-for-manufacturing checks with severity scoring
- **Physics-Based Estimation** — Kienzle cutting force, Taylor tool life, Loewen-Shaw thermal, Altintas chatter stability, laser/plasma/waterjet speed models
- **Renderer** — wgpu-based camera, scene, and viewport infrastructure; Three.js 3D viewport in desktop app
- **Plugin System** — WASM-sandboxed plugins via Wasmtime (DFM, material, post-processor, toolpath)
- **Desktop App** — Tauri 2 with React 18.3/TypeScript 5.6/Tailwind/Zustand 5.0 frontend, Three.js 0.170 3D viewport, 37 Tauri IPC commands
- **Cloud Backend** — Axum REST API, PostgreSQL, Redis streams, Docker Compose

## 🏗 Architecture

```
packages/
├── shared-types       # Foundation types (materials, geometry, estimation) — 1,130 lines
├── cad-kernel         # B-Rep/NURBS kernel + sketch ops + snap + tools + snapshot — 10,269 lines, 125 tests
├── constraint-solver  # 2D (DogLeg→LM→BFGS→NR) + 3D assembly solver — 1,915 lines, 30 tests
├── cam-engine         # Toolpaths, G-code (8 posts), nesting, sheet metal — 1,555 lines, 64 tests
├── dfm-analyzer       # DFM checks and scoring — 561 lines, 27 tests
├── renderer           # wgpu camera + scene + viewport — 553 lines
├── editor-shell       # ECS orchestrator, 22 commands, 21 tools — 1,301 lines, 22 tests
├── plugin-runtime     # Wasmtime WASM plugin host — 463 lines, 7 tests
├── api-gateway        # Axum REST API
├── worker-analysis    # DFM worker (Redis consumer)
├── worker-cad         # CAD geometry worker
├── worker-cam         # CAM manufacturing worker
├── wasm-meshkit       # Browser WASM mesh toolkit — 531 lines, 20 tests
└── bench              # Criterion benchmarks

apps/
└── desktop/           # Tauri 2 desktop application
    ├── src/           # React 18.3 + TypeScript 5.6 + Zustand 5.0 + Three.js 0.170
    │   ├── api/       # 37 Tauri command wrappers (328 lines)
    │   └── store/     # Fusion 360-style Zustand store (1,062 lines)
    └── src-tauri/     # Rust Tauri backend (37 IPC command handlers)

shaders/               # WGSL GPU shaders (PBR, grid, outline, DFM, toolpath)
migrations/            # PostgreSQL schema
docker/                # Dockerfiles for services
```

## 🚀 Quick Start

### Prerequisites

- **Rust 1.93+** (via rustup, edition 2021)
- **Node.js 20+** (for frontend)
- **Docker & Docker Compose** (for backend services, optional for desktop-only mode)

### Desktop App (Development)

```bash
# Clone
git clone https://github.com/your-org/r3ditor.git
cd r3ditor

# Install frontend dependencies
cd apps/desktop
npm install
cd ../..

# Run desktop app in dev mode
cd apps/desktop/src-tauri
cargo tauri dev
```

### Backend Services

```bash
# Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# Run database migrations
psql -h localhost -U r3ditor -d r3ditor -f migrations/001_initial.sql

# Start API gateway
cargo run --package api-gateway

# Start workers (in separate terminals)
cargo run --package worker-analysis
cargo run --package worker-cad
cargo run --package worker-cam
```

### Full Stack (Docker)

```bash
docker compose up --build
```

### Run Tests

```bash
# Rust tests (295 passing)
cargo test --workspace

# Frontend tests (319 passing)
cd apps/desktop && npx vitest run
```

### Build Desktop App

```bash
# Debug build (no installer bundle)
cd apps/desktop && npx tauri build --debug --no-bundle
# Output: target\debug\r3ditor-desktop.exe (~14.8 MB)
```

### Run Benchmarks

```bash
cargo bench --package r3ditor-bench
```

## 📊 Materials Database

### Sheet Metals (17 materials)
DC01, DX51D+Z275, S355MC, AISI 304 2B, AISI 316L, Aluminum 5754-H22/6082-T6/1050-H24, Copper C11000, Brass CuZn37, Titanium Grade 2, Corten A, Hardox 400, DC04 Deep Draw, Spring Steel CK75, Mu-Metal, Hastelloy C-276

### CNC Materials (6 materials)
Aluminum 6061-T6/7075-T6, Steel 1045/4140, Stainless 316L, Titanium Ti-6Al-4V

Each material includes full physical properties: density, yield/tensile strength, elongation, thermal conductivity, specific cutting force, machinability, and more.

## 🧮 Physics Models

| Model | Purpose |
|-------|---------|
| **Kienzle** | Cutting force: F = kc₁.₁ × b × h^(1-mc) |
| **Taylor** | Tool life: VT^n = C |
| **Loewen-Shaw** | Cutting temperature |
| **Altintas** | Chatter stability lobes |
| **Surface Roughness** | Ra from feed/radius geometry |
| **Laser/Plasma/Waterjet** | Cutting speed models per material thickness |
| **Press Brake** | Tonnage, bend allowance, springback correction |

## 📝 License

AGPL-3.0 — see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
