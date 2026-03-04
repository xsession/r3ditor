# r3ditor

**Open-source 3D CAD/CAM editor** for manufacturing — built in Rust with wgpu, egui, Tauri, and React.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Rust](https://img.shields.io/badge/rust-1.82%2B-orange)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

## ✨ Features

- **Parametric CAD Kernel** — B-Rep/NURBS modeling via Truck, with full feature tree, sketch constraints, history (undo/redo)
- **CAM Engine** — CNC toolpath generation (roughing, finishing, drilling), sheet metal nesting, G-code post-processing (Fanuc, Haas, Mazak, LinuxCNC, Grbl, Marlin, Klipper)
- **DFM Analysis** — Real-time design-for-manufacturing checks with severity scoring
- **Physics-Based Estimation** — Kienzle cutting force, Taylor tool life, Loewen-Shaw thermal, Altintas chatter stability, laser/plasma/waterjet speed models
- **PBR Renderer** — wgpu-powered Cook-Torrance BRDF with ACES tone mapping, selection outlines, DFM heatmap, toolpath visualization
- **2D Constraint Solver** — Newton-Raphson solver with 15+ constraint types
- **Plugin System** — WASM-sandboxed plugins via Wasmtime (DFM, material, post-processor, toolpath)
- **Desktop App** — Tauri 2 with React/TypeScript/Tailwind frontend, Three.js 3D viewport
- **Cloud Backend** — Axum REST API, PostgreSQL, Redis streams, Docker Compose

## 🏗 Architecture

```
packages/
├── shared-types       # Foundation types (materials, geometry, estimation)
├── cad-kernel         # B-Rep/NURBS kernel (Truck-based)
├── constraint-solver  # 2D Newton-Raphson + 3D assembly solver
├── cam-engine         # Toolpaths, G-code, nesting, cost estimation
├── dfm-analyzer       # DFM checks and scoring
├── renderer           # wgpu PBR renderer
├── editor-shell       # ECS orchestrator (Input→Solve→Rebuild→Render)
├── plugin-runtime     # Wasmtime WASM plugin host
├── api-gateway        # Axum REST API
├── worker-analysis    # DFM worker (Redis consumer)
├── worker-cad         # CAD geometry worker
├── worker-cam         # CAM manufacturing worker
├── wasm-meshkit       # Browser WASM mesh toolkit
└── bench              # Criterion benchmarks

apps/
└── desktop/           # Tauri 2 desktop application
    ├── src/           # React + TypeScript + Tailwind
    └── src-tauri/     # Rust Tauri backend

shaders/               # WGSL GPU shaders (PBR, grid, outline, DFM, toolpath)
migrations/            # PostgreSQL schema
docker/                # Dockerfiles for services
```

## 🚀 Quick Start

### Prerequisites

- **Rust 1.82+** (via rustup)
- **Node.js 20+** (for frontend)
- **Docker & Docker Compose** (for backend services)

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
cargo test --workspace
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
