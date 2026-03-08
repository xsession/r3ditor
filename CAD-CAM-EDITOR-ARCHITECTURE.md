# r3ditor CAD/CAM Editor — Architecture Document

> **Open-Source, High-Performance, Multicore Rust CAD/CAM Editor**
>
> Living architecture document — reflects the **actual implemented state** of the codebase
> as of the latest build. Planned/future features are clearly marked with 🔮.
>
> Last updated: June 2025 · r3ditor v0.2.0 · Rust 1.93 · Edition 2021

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Project Stack](#2-current-project-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Architecture — ECS + B-Rep Hybrid](#4-core-architecture--ecs--b-rep-hybrid)
5. [CAD Kernel Layer](#5-cad-kernel-layer)
6. [Sketch System & Blender/CAD_Sketcher Patterns](#6-sketch-system--blendercad_sketcher-patterns)
7. [CAM / Manufacturing Layer](#7-cam--manufacturing-layer)
8. [Constraint Solver](#8-constraint-solver)
9. [Rendering Engine](#9-rendering-engine)
10. [User Interface / UX Layer](#10-user-interface--ux-layer)
11. [Desktop Application (Tauri Bridge)](#11-desktop-application-tauri-bridge)
12. [File Format & Data Exchange](#12-file-format--data-exchange)
13. [Plugin / Extension Architecture](#13-plugin--extension-architecture)
14. [Deployment Topology](#14-deployment-topology)
15. [Crate / Package Dependency Map](#15-crate--package-dependency-map)
16. [Technology Matrix](#16-technology-matrix)
17. [Test Coverage](#17-test-coverage)
18. [Performance Targets](#18-performance-targets)
19. [Implementation Status & Roadmap](#19-implementation-status--roadmap)
20. [Appendix A — Workspace Crate Inventory](#appendix-a--workspace-crate-inventory)
21. [Appendix B — Cargo Workspace Dependencies](#appendix-b--cargo-workspace-dependencies)

---

## 1. Executive Summary

r3ditor is an **open-source 3D CAD/CAM editor** built entirely in Rust with a React/TypeScript/Three.js frontend via Tauri 2. The project currently consists of **15 Rust workspace crates** and a **Tauri 2 desktop application** with ~20,460 lines of Rust and ~1,390+ lines of TypeScript in the core store/API layer.

### Design Principles

| # | Principle | Implementation |
|---|-----------|---------------|
| 1 | **Rust-first, zero-cost abstractions** | All kernel, solver, and engine code in Rust 2021 edition |
| 2 | **B-Rep + Mesh dual representation** | Truck-based NURBS/B-Rep for accuracy, TriMesh for GPU & CAM |
| 3 | **Multicore by default** | Rayon data parallelism + Tokio async I/O |
| 4 | **Modular crate ecosystem** | 15 independent crates — every subsystem is replaceable |
| 5 | **Blender/CAD_Sketcher-inspired UX** | Stateful tool framework, GPU picking, snap engine, snapshot undo |
| 6 | **Fusion 360-style frontend** | React + Zustand store modeling workspaces, timeline, browser tree |
| 7 | **Desktop-first via Tauri 2** | 37 Tauri IPC commands bridging Rust ↔ React |
| 8 | **DFM + Manufacturing integrated** | CAM toolpaths, G-code, nesting, and DFM analysis as first-class features |

### Key Metrics

| Metric | Value |
|--------|-------|
| Rust workspace crates | 15 |
| Total Rust source lines | ~20,460 |
| Rust tests passing | 295 |
| Frontend tests passing | 319 |
| Tauri IPC commands | 37 |
| Feature kinds (CAD kernel) | 20 |
| Sketch constraint types | 19 |
| Sketch entity types | 7 |
| CNC post-processors | 8 (Fanuc, Haas, Mazak, Siemens, LinuxCNC, Grbl, Marlin, Klipper) |
| Materials catalog | 17 sheet + 6 CNC |
| Desktop binary size | ~14.8 MB |

---

## 2. Current Project Stack

### 2.1 What We Have Today (Implemented)

```
┌─────────────────────────────────────────────────────────────────┐
│                      r3ditor v0.2.0 (Current)                   │
├─────────────────────────────────────────────────────────────────┤
│  Desktop Shell    │ Tauri 2.2 native window                     │
│  Frontend         │ React 18.3 + TypeScript 5.6 + Zustand 5.0  │
│  3D Viewport      │ Three.js 0.170 + @react-three/fiber 8.17   │
│  Build            │ Vite 6.4 + Tailwind 3.4                    │
│  CAD Kernel       │ Rust + Truck (B-Rep/NURBS) + 20 features   │
│  Sketch System    │ 7 entity types, 19 constraints, 4 tools    │
│  Sketch Ops       │ Trim, bevel, offset, path walker, bezier   │
│  Snap Engine      │ 7 snap types + GPU picking color map       │
│  Tool Framework   │ Stateful tool system (Blender-inspired)    │
│  Snapshot/Undo    │ Sketch snapshots + clipboard + copy/paste  │
│  Constraint Solver│ 2D Newton-Raphson (DogLeg→LM→BFGS→NR)     │
│  3D Assembly      │ Mate, Align, Offset, Angle, Fixed          │
│  CAM Engine       │ CNC toolpaths + G-code + nesting + sheet   │
│  DFM Analysis     │ Configurable checks + severity scoring     │
│  Plugin Runtime   │ Wasmtime WASM sandboxed execution          │
│  WASM Meshkit     │ Browser STL parse + simplify + LOD         │
│  Renderer         │ wgpu-based camera + scene + viewport       │
│  Editor Shell     │ ECS world + 22 commands + 21 tools         │
│  Shared Types     │ Geometry, materials, estimation, DFM types │
│  API Gateway      │ Axum 0.7 REST + SSE + Swagger              │
│  Workers          │ Redis stream consumers (CAD, CAM, Analysis)│
│  Database         │ PostgreSQL 16 (sqlx 0.7, migrations)       │
│  Object Storage   │ MinIO / S3 (aws-sdk-s3)                    │
│  Containers       │ Docker multi-stage + docker-compose        │
│  Observability    │ Prometheus + Grafana                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Workspace Structure (15 Crates)

```
packages/
├── shared-types/          # Foundation types (materials, geometry, estimation)
│   └── 9 source files, 1,130 lines, 0 tests
├── cad-kernel/            # B-Rep/NURBS kernel + sketch ops + snap + tools + snapshot
│   └── 13 source files, 10,269 lines, 125 tests
├── constraint-solver/     # 2D sketch + 3D assembly constraint solving
│   └── 4 source files, 1,915 lines, 30 tests
├── cam-engine/            # Toolpaths, G-code, nesting, sheet metal
│   └── 6 source files, 1,555 lines, 64 tests
├── dfm-analyzer/          # DFM checks and scoring
│   └── 3 source files, 561 lines, 27 tests
├── renderer/              # wgpu camera + scene + viewport
│   └── 6 source files, 553 lines, 0 tests
├── editor-shell/          # ECS orchestrator + commands + tool system
│   └── 6 source files, 1,301 lines, 22 tests
├── plugin-runtime/        # Wasmtime WASM plugin host
│   └── 4 source files, 463 lines, 7 tests
├── api-gateway/           # Axum REST API
├── worker-analysis/       # DFM worker (Redis consumer)
├── worker-cad/            # CAD geometry worker
├── worker-cam/            # CAM manufacturing worker
├── wasm-meshkit/          # Browser WASM mesh toolkit
│   └── 4 source files, 531 lines, 20 tests
└── bench/                 # Criterion benchmarks

apps/
├── desktop/               # Tauri 2 desktop application
│   ├── src/               # React + TypeScript + Zustand + Three.js
│   │   ├── api/tauri.ts   # 37 Tauri command wrappers (328 lines)
│   │   └── store/         # Zustand store (1,062 lines) + serializer + tests
│   └── src-tauri/         # Rust Tauri backend
│       ├── commands.rs    # 37 Tauri command handlers (692 lines)
│       └── main.rs        # Tauri builder + plugin registration
└── e2e-tester/            # End-to-end test runner
```

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           r3ditor v0.2.0                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────┐                   │
│  │  Tauri Shell │  │  React + Three.js│  │  Web (WASM)  │                   │
│  │  (Desktop)   │  │  (Frontend UI)   │  │  (Browser)   │                   │
│  └──────┬───────┘  └──────┬───────────┘  └───────┬──────┘                   │
│         │   37 IPC         │ Zustand store        │                         │
│         │   commands       │ + Tauri invoke()     │                         │
│  ┌──────┴──────────────────┴──────────────────────┴──────────────────┐      │
│  │                     EDITOR SHELL (ECS Orchestrator)               │      │
│  │     World: entities, sketches, snap, clipboard, snapshots         │      │
│  │     22 EditorCommand variants  ·  21 Tool types                   │      │
│  │     ┌──────────────────────────────────────────────────────┐      │      │
│  │     │  Pipeline: [Input] → [Solve] → [Rebuild] → [Render] │      │      │
│  │     └──────────────────────────────────────────────────────┘      │      │
│  └──────┬────────────────┬─────────────────┬──────────────────┬──────┘      │
│         │                │                 │                  │              │
│  ┌──────┴────────┐ ┌─────┴──────┐ ┌───────┴───────┐ ┌───────┴───────┐     │
│  │  CAD Kernel   │ │ CAM Engine │ │ DFM Analyzer  │ │  Renderer     │     │
│  │  ──────────── │ │ ────────── │ │ ──────────── │ │ ──────────    │     │
│  │ • B-Rep/NURBS │ │ • Toolpaths│ │ • Wall thick │ │ • wgpu        │     │
│  │ • 20 features │ │ • G-code   │ │ • Draft angle│ │ • Camera      │     │
│  │ • Sketch ops  │ │ • Nesting  │ │ • Undercuts  │ │ • Scene       │     │
│  │ • Snap engine │ │ • Sheet    │ │ • DFM scoring│ │ • Viewport    │     │
│  │ • Tool system │ │ • 8 posts  │ │              │ │               │     │
│  │ • Snapshot    │ │            │ │              │ │               │     │
│  │ • TNS naming  │ │            │ │              │ │               │     │
│  │ • History/Undo│ │            │ │              │ │               │     │
│  └───────┬───────┘ └─────┬──────┘ └──────┬───────┘ └───────┬───────┘     │
│          │               │               │                  │              │
│  ┌───────┴───────────────┴───────────────┴──────────────────┴───────┐     │
│  │               constraint-solver  +  shared-types                  │     │
│  │     2D sketch (NR→LM→BFGS) + 3D assembly (iterative)            │     │
│  └───────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │    plugin-runtime (Wasmtime WASM)  ·  wasm-meshkit (Browser)   │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Core Architecture — ECS + B-Rep Hybrid

### 4.1 ECS Data Model (editor-shell)

The `World` struct in `editor-shell/src/ecs.rs` is the central state container:

```rust
pub struct World {
    // Entity storage
    pub entities: Vec<EditorEntity>,
    pub history: HistoryManager,

    // Sketch system (Blender/CAD_Sketcher integration)
    pub sketches: HashMap<Uuid, Sketch>,
    pub active_sketch: Option<Uuid>,
    pub sketch_snapshots: ToolSnapshotManager,
    pub clipboard: ClipboardBuffer,

    // Snap system
    pub snap_config: SnapConfig,
    pub picking_map: PickingColorMap,
}
```

Each `EditorEntity` contains:

```rust
pub struct EditorEntity {
    pub id: Uuid,
    pub name: String,
    pub brep: Option<BRepBody>,
    pub mesh: Option<TriMesh>,
    pub dirty: bool,
    pub feature_tree: Vec<Feature>,
    pub transform: Transform3D,
    pub appearance: Appearance,
    pub visible: bool,
    pub locked: bool,
}
```

World sketch methods: `create_sketch()`, `get_sketch()`, `get_sketch_mut()`, `active_sketch()`, `active_sketch_mut()`, `set_active_sketch()`, `remove_sketch()`, `list_sketches()`.

### 4.2 Command System (22 Variants)

All state mutations go through `EditorCommand` in `editor-shell/src/commands.rs`:

| Command | Category | Description |
|---------|----------|-------------|
| `CreateBox` | Primitive | Create box with dimensions |
| `CreateCylinder` | Primitive | Create cylinder with radius + height |
| `ApplyFeature` | Modeling | Apply any of 20 feature kinds |
| `DeleteEntity` | Editing | Remove entity from world |
| `Undo` / `Redo` | History | Transaction-based undo/redo |
| `ImportFile` | I/O | Import STEP/STL/OBJ |
| `ExportFile` | I/O | Export to various formats |
| `CreateSketch` | Sketch | Create new sketch on plane |
| `DeleteSketch` | Sketch | Remove sketch |
| `SetActiveSketch` | Sketch | Set active sketch for editing |
| `AddSketchEntity` | Sketch | Add line/circle/arc/point/etc. |
| `RemoveSketchEntity` | Sketch | Remove entity from sketch |
| `AddSketchConstraint` | Sketch | Add constraint to sketch |
| `RemoveSketchConstraint` | Sketch | Remove constraint |
| `TrimSegment` | Sketch Ops | Trim segment at click point |
| `BevelAtPoint` | Sketch Ops | Bevel/fillet at junction |
| `OffsetPath` | Sketch Ops | Offset connected path |
| `TakeSnapshot` | Snapshot | Save sketch state for tool undo |
| `RestoreSnapshot` | Snapshot | Restore previous sketch state |
| `CopyEntities` | Clipboard | Copy selection with dependencies |
| `PasteEntities` | Clipboard | Paste with ID remapping + offset |

### 4.3 Tool System (21 Tools)

The `EditorApp` in `editor-shell/src/app.rs` manages an active `Tool` enum:

```
General:  Select, Move, Rotate, Scale, Sketch, Extrude, Revolve,
          Fillet, Chamfer, Boolean, Measure, Section
Sketch:   SketchLine, SketchCircle, SketchArc, SketchRectangle,
          SketchTrim, SketchOffset, SketchBevel
```

Sketch tools are backed by the `ToolStateMachine` from `cad-kernel/src/tools.rs`, which implements the full Blender-inspired stateful operator lifecycle:

- `activate_sketch_tool()` → creates tool + state machine
- `send_tool_input()` → feeds mouse/keyboard events through state machine
- `cancel_sketch_tool()` → cancels and rolls back
- `compute_snap()` → runs snap engine for current cursor position
- `sketch_tool_status()` → returns current state name + preview entities

### 4.4 System Schedule (per frame)

```
Frame N:
  ┌─ Stage 1: INPUT ─────────────────────────────────────┐
  │  • Mouse/keyboard → pick/select/transform             │
  │  • Tool input → state machine progression              │
  │  • Snap computation → visual feedback                  │
  │  • Command execution → push to undo history            │
  └────────────────────────────────────────────────────────┘
                         ↓
  ┌─ Stage 2: SOLVE (parallel via Rayon) ─────────────────┐
  │  • 2D constraint solver (NR → LM → BFGS → NR)         │
  │  • 3D assembly constraint solver                       │
  │  • Feature tree rebuild (if params changed)            │
  └────────────────────────────────────────────────────────┘
                         ↓
  ┌─ Stage 3: REBUILD (parallel via Rayon) ───────────────┐
  │  • Feature execution (20 kinds)                        │
  │  • B-Rep boolean operations                            │
  │  • Tessellation (NURBS → triangles)                    │
  │  • DFM analysis (if geometry changed)                  │
  └────────────────────────────────────────────────────────┘
                         ↓
  ┌─ Stage 4: RENDER ─────────────────────────────────────┐
  │  • Three.js scene update (via React state)             │
  │  • Selection highlights + snap indicators              │
  │  • Gizmo / handle overlay                              │
  │  • UI (React components)                               │
  └────────────────────────────────────────────────────────┘
```

---

## 5. CAD Kernel Layer

The `cad-kernel` crate is the largest (10,269 lines, 125 tests) and contains the core parametric modeling engine plus the sketch operation subsystems.

### 5.1 Module Structure

| Module | Lines | Tests | Purpose |
|--------|------:|------:|---------|
| `operations.rs` | 2,050 | 60 | Feature execution engine — all 20 feature kinds |
| `sketch_ops.rs` | 1,238 | 13 | Entity walker, trim, bevel, offset, bezier, intersections |
| `tessellation.rs` | 1,291 | 11 | Mesh generation, quality metrics, smoothing, STL export |
| `sketch.rs` | 882 | 4 | 2D sketch entities (7 types) + constraints (19 types) |
| `brep.rs` | 869 | 4 | B-Rep body with full topological model |
| `tools.rs` | 770 | 6 | Stateful tool framework + 4 built-in tools |
| `document.rs` | 679 | 5 | Document model, EventBus, DependencyGraph |
| `snap.rs` | 569 | 6 | Snap engine (7 snap types) + GPU PickingColorMap |
| `naming.rs` | 534 | 5 | Topological Naming Service (5-priority cascade) |
| `snapshot.rs` | 519 | 4 | SketchSnapshot, ToolSnapshotManager, ClipboardBuffer |
| `features.rs` | 484 | 3 | Feature system (20 FeatureKinds) + attributes |
| `history.rs` | 297 | 4 | Transaction-based undo/redo (OCAF pattern) |
| `lib.rs` | 77 | 0 | Module declarations + 30+ public re-exports |

### 5.2 B-Rep / NURBS Kernel (Truck-Based)

The kernel uses the **Truck** crate family for B-Rep topology and NURBS geometry:

```toml
truck-geotrait = "0.6"   # ParametricCurve, ParametricSurface traits
truck-topology = "0.6"   # Vertex, Edge, Wire, Face, Shell, Solid
truck-modeling = "0.6"    # Extrude, revolve, sweep, loft
truck-shapeops = "0.6"   # Boolean operations (union, cut, intersect)
truck-meshalgo = "0.6"   # Tessellation from B-Rep
truck-polymesh = "0.6"   # Polygon mesh data + algorithms
truck-stepio   = "0.6"   # STEP file read/write
```

### 5.3 Feature System (20 Kinds)

The `operations.rs` module (2,050 lines, 60 tests) implements all 20 feature kinds:

| Feature | Description |
|---------|-------------|
| `Extrude` | Sweep closed 2D profile along direction (blind/symmetric/to-face/through-all) |
| `Revolve` | Sweep profile around axis by angle |
| `Fillet` | Rolling-ball fillet on selected edges |
| `Chamfer` | Distance or distance+angle chamfer on edges |
| `BooleanUnion` | Union of two solids |
| `BooleanCut` | Subtraction of tool from target |
| `BooleanIntersect` | Intersection of two solids |
| `Shell` | Hollow solid by removing faces and offsetting |
| `LinearPattern` | Repeat feature along direction |
| `CircularPattern` | Repeat feature around axis |
| `Mirror` | Mirror feature across plane |
| `Pipe` | Sweep profile along 3D path |
| `Loft` | Create solid between two or more profiles |
| `SheetMetalBend` | Bend with K-factor calculation |
| `Hole` | Simple/counterbore/countersink/tapped holes |
| `Draft` | Add draft angle to faces |
| `Datum` (Plane/Axis/Point) | Reference geometry |
| `Import` | Import external geometry |

### 5.4 Topological Naming Service

`naming.rs` (534 lines, 5 tests) implements a 5-priority cascade for persistent references that survive model rebuilds:

1. **Exact match** by creation provenance (feature ID + creation type)
2. **Filter by creation type** (ExtrudeSide, ExtrudeCap, BooleanFace, etc.)
3. **Geometric signature matching** (surface type, centroid, normal, area)
4. **Adjacency graph matching** (neighboring faces/edges)
5. **Report unresolved** to user with re-link dialog

### 5.5 Tessellation

`tessellation.rs` (1,291 lines, 11 tests) provides:

- Configurable chordal/angular deviation
- Mesh quality analysis (`MeshQualityReport` — aspect ratio, min/max angle, skewness)
- Laplacian + Taubin mesh smoothing (`SmoothingConfig`)
- STL export (binary format)

### 5.6 History / Undo System

`history.rs` (297 lines, 4 tests) — Transaction-based undo/redo inspired by OCAF:

- `HistoryManager::begin_transaction()` / `commit()` / `rollback()`
- Full state snapshots per transaction
- Undo stack with configurable depth

### 5.7 Document Model

`document.rs` (679 lines, 5 tests) provides:

- `Document` — persistent document state with metadata
- `EventBus` — publish/subscribe event system for inter-module communication
- `DependencyGraph` — tracks feature dependencies for incremental rebuild

---

## 6. Sketch System & Blender/CAD_Sketcher Patterns

This section documents the four modules added to `cad-kernel` that implement patterns extracted from Blender and CAD_Sketcher (see `BLENDER-CAD-SKETCHER-PATTERNS.md` for the original research).

### 6.1 Sketch Entities & Constraints (`sketch.rs`)

**7 Entity Types:**

| Entity | Parameters | DOF |
|--------|-----------|-----|
| Point | x, y | 2 |
| LineSegment | start(x,y), end(x,y) | 4 |
| Circle | center(x,y), radius | 3 |
| Arc | center(x,y), radius, start_angle, end_angle | 5 |
| Rectangle | origin(x,y), width, height | 4 |
| Ellipse | center, semi_major, semi_minor, rotation | 5 |
| Spline | control_points, degree | 2N |

**19 Constraint Types:**

| Constraint | Description |
|------------|-------------|
| Coincident | Point-on-point or point-on-curve |
| Horizontal / Vertical | Line parallel to axis |
| Parallel / Perpendicular | Between two lines |
| Tangent | Line-arc, arc-arc tangency |
| Equal | Equal length or radius |
| Symmetric | Mirror about line |
| Concentric | Same center |
| Midpoint | Point at midpoint of segment |
| Distance | Point-point, point-line, line-line distance |
| Angle | Angle between two lines |
| Radius / Diameter | Circle/arc size |
| Fix | Lock entity in place |
| Collinear | Points on same line |
| Ratio | Proportional distance |

### 6.2 Sketch Operations (`sketch_ops.rs` — 1,238 lines, 13 tests)

Implements the CAD_Sketcher entity walker, trim, bevel, offset, intersection, bezier, and mesh conversion algorithms.

#### Entity Walker & Path Finding

- `connection_points(entity)` — returns topological endpoints per entity type
- `EntityWalker` — builds adjacency map via shared connection points
- `find_paths(sketch)` — recursive path discovery, returns `Vec<SketchPath>`
- `main_path(paths)` — finds the longest/closed path (for offset, conversion)

#### Intersections

- `intersect_entities(a, b)` — computes intersection points for:
  - Line-line (parametric intersection + t-range check)
  - Line-circle (quadratic formula, 0/1/2 solutions)
  - Line-arc (same as line-circle + angle range filter)
  - Circle-circle (radical line method)

#### Trim (`trim_segment`)

Algorithm: find all intersections with the target segment → sort by distance from click position → find bracketing pair → split segment → copy applicable constraints → remap references → clean up.

Returns `TrimResult` with the new segment IDs.

#### Bevel (`bevel_at_point`)

Algorithm: find 2 connected segments at point → compute parallel offsets → intersect offsets to find arc center → project center onto segments for tangent points → create arc → add tangent constraints.

Returns `BevelResult` with the new arc entity ID.

#### Offset (`offset_path`)

Algorithm: use EntityWalker to find connected path → compute parallel offset for each segment → intersect consecutive offsets for new junction points → create offset entities.

Returns `OffsetResult` with the new entity IDs.

#### Bezier Conversion

- `to_bezier(entity)` — converts sketch entities to `CubicBezierSegment` sequences
- `tessellate_bezier(segments, resolution)` — subdivides for display
- Uses the optimal arc-to-cubic formula: `q = (4/3) × tan(π / (2n))`

#### Sketch-to-Mesh

- `sketch_profile_to_mesh(sketch)` — triangulates closed profiles via ear-clipping
- Returns `TriMesh` suitable for GPU display

### 6.3 Stateful Tool Framework (`tools.rs` — 770 lines, 6 tests)

Implements the Blender `StatefulOperator` pattern as a Rust trait + state machine.

#### Core Trait

```rust
pub trait StatefulTool: Send + Sync {
    fn name(&self) -> &'static str;
    fn states(&self) -> &[ToolStateDef];
    fn handle_input(&mut self, state: usize, input: &ToolInput) -> ToolModalResult;
    fn create_entity(&mut self, sketch: &mut Sketch, state: usize) -> Option<Uuid>;
    fn finish(&mut self, sketch: &mut Sketch) -> Result<(), String>;
    fn cancel(&mut self, sketch: &mut Sketch);
    fn supports_continuous_draw(&self) -> bool;
}
```

#### Tool Input / Result Enums

- `ToolInput`: MouseMove, Click, Release, EntityHover, NumericInput, Tab, Escape, Enter, Undo
- `ToolModalResult`: Running, NextState, Finished, Cancelled, ContinuousDraw
- `ToolStateValue`: Entity, Coordinate, Number, None

#### Built-In Tools

| Tool | States | Continuous Draw | Description |
|------|--------|:---------------:|-------------|
| `LineTool` | 2 (start, end) | ✅ | Draw line segments; chains endpoints |
| `CircleTool` | 2 (center, radius) | ❌ | Draw circles by center + radius point |
| `ArcTool` | 3 (center, start, end) | ❌ | Draw arcs by center + start + end angle |
| `RectangleTool` | 2 (corner, corner) | ❌ | Draw rectangles from two corners |

#### ToolStateMachine

Full modal lifecycle: `invoke()` → `prefill()` → modal loop (`handle_input()` → `advance_state()`) → `finish()` or `cancel()`. Supports continuous draw (chain drawing) for polyline-like workflows.

#### Numeric Input

`NumericInputState` provides per-axis text buffers — Tab cycles between X/Y substates, Enter confirms, Escape cancels.

### 6.4 Snap Engine (`snap.rs` — 569 lines, 6 tests)

Implements the Blender snap system with 7 snap types and GPU color-buffer entity picking.

#### Snap Types (Priority Order)

| Priority | Type | Radius | Description |
|----------|------|--------|-------------|
| 1 | Endpoint | 8 px | Snap to entity endpoints |
| 2 | Midpoint | 8 px | Snap to segment midpoints |
| 3 | Center | 8 px | Snap to circle/arc centers |
| 4 | Intersection | 8 px | Snap to entity intersections |
| 5 | Nearest | 6 px | Snap to nearest point on curve |
| 6 | Grid | 4 px | Snap to grid intersections |
| 7 | AxisAlignment | 3 px | Snap to axis-aligned positions |

```rust
pub struct SnapEngine;

impl SnapEngine {
    pub fn find_snap(
        sketch: &Sketch,
        cursor: Point2D,
        config: &SnapConfig,
    ) -> Option<SnapResult>;
}
```

Algorithm: collect candidates from all enabled snap types → sort by priority then distance → return best match.

#### GPU Picking Color Map

```rust
pub struct PickingColorMap {
    entity_to_color: HashMap<Uuid, [u8; 3]>,
    color_to_entity: HashMap<[u8; 3], Uuid>,
}
```

- `register(entity_id)` — assigns unique RGB color
- `resolve(color)` — maps color back to entity ID
- `resolve_spiral(colors, center, size)` — Blender-style `PICK_SIZE=10` fuzzy search

### 6.5 Snapshot / Clipboard (`snapshot.rs` — 519 lines, 4 tests)

#### Sketch Snapshots

`SketchSnapshot` captures full sketch state (entities + constraints + ordering + metadata) with:
- `from_sketch()` / `restore_to_sketch()` — round-trip
- `to_json()` / `from_json()` — JSON serialization
- `to_bytes()` / `from_bytes()` — binary serialization

#### Tool Snapshot Manager

```rust
pub struct ToolSnapshotManager {
    stack: Vec<SketchSnapshot>,   // max depth: 50
}
```

- `push_snapshot()` — save current sketch state
- `pop_and_restore()` — restore previous state (in-tool Ctrl+Z)
- `pop_snapshot()` — pop without restoring
- `peek()` — inspect top of stack

#### Clipboard with Dependency Resolution

```rust
pub struct ClipboardBuffer;
```

- `from_selection(sketch, selected_ids)` — resolves dependencies (entity → points, constraints → entities)
- `paste_into(sketch, offset)` — remaps all UUIDs to avoid collisions, applies position offset
- Returns list of newly created entity IDs

---

## 7. CAM / Manufacturing Layer

The `cam-engine` crate (1,555 lines, 64 tests) provides CNC toolpath generation, G-code post-processing, 2D nesting, and sheet metal cutting/bending estimation.

### 7.1 Module Structure

| Module | Lines | Tests | Purpose |
|--------|------:|------:|---------|
| `toolpath.rs` | 628 | 26 | Roughing, finishing, drilling toolpath generation |
| `gcode.rs` | 320 | 17 | G-code generation + 8 post-processors |
| `nesting.rs` | 276 | 18 | 2D rectangular + true-shape nesting |
| `sheet.rs` | 176 | 2 | Sheet metal (laser/plasma/waterjet, bend) |
| `cnc.rs` | 141 | 1 | CNC physics models (Kienzle, Taylor, etc.) |

### 7.2 Physics Models (Implemented)

| Model | Formula | Application |
|-------|---------|-------------|
| **Kienzle** | $F_c = k_{c1.1} \cdot b \cdot h^{1-m_c}$ | Cutting force prediction |
| **Taylor** | $V \cdot T^n = C$ | Tool life prediction |
| **Loewen-Shaw** | $\theta = \frac{0.754 \cdot \mu \cdot V \cdot F_c}{k \cdot \sqrt{l_c}}$ | Thermal analysis |
| **Altintas** | $a_{lim} = \frac{-1}{2 K_f \cdot Re[G(j\omega_c)]}$ | Chatter stability |
| **Surface Roughness** | $R_a = \frac{f^2}{32 \cdot r_{nose}}$ | Ra prediction |
| **Fiber Laser** | $v = \frac{P}{t^{1.6}} \cdot k_{mat}$ | Laser cutting speed |
| **Plasma** | $v = \frac{I}{t^{0.8}} \cdot k_{mat}$ | Plasma cutting speed |
| **Waterjet** | $v = \frac{P}{t^{1.2} \cdot H_{BHN}} \cdot k_{mat}$ | Waterjet cutting speed |
| **Press Brake** | $T = \frac{C \cdot L \cdot t^2 \cdot \sigma_u}{W \cdot 1000}$ | Bending tonnage |
| **Bend Allowance** | $BA = (\frac{\pi}{180}) \cdot \theta \cdot (r + k \cdot t)$ | Flat pattern |
| **Springback** | $\alpha_{actual} = \alpha_{target} + \frac{\sigma_y \cdot t}{2 \cdot E \cdot r}$ | Bend correction |

### 7.3 G-Code Post-Processors (8 Built-In)

Fanuc, Haas, Mazak, Siemens, LinuxCNC, Grbl, Marlin, Klipper

Custom post-processors can be added as WASM plugins via the `PostProcessor` trait.

### 7.4 Materials Catalog

**17 Sheet Materials** with full physical properties: DC01, DX51D+Z275, S355MC, AISI 304 2B, AISI 316L, Aluminum 5754-H22/6082-T6/1050-H24, Copper C11000, Brass CuZn37, Titanium Grade 2, Corten A, Hardox 400, DC04 Deep Draw, Spring Steel CK75, Mu-Metal, Hastelloy C-276.

**6 CNC Materials**: Aluminum 6061-T6, 7075-T6; Steel 1045, 4140; Stainless 316L; Titanium Ti-6Al-4V — each with specific cutting force, machinability index, and thermal properties.

---

## 8. Constraint Solver

The `constraint-solver` crate (1,915 lines, 30 tests) provides both 2D sketch and 3D assembly constraint solving.

### 8.1 2D Sketch Solver (`solver2d.rs` — 859 lines)

Four-stage cascade solver:

1. **DogLeg** trust-region method (fastest, handles most cases)
2. **Levenberg-Marquardt** fallback (robust for near-singular Jacobians)
3. **BFGS** quasi-Newton (for complex constraint graphs)
4. **Newton-Raphson** with line search (final fallback)

Supports all 19 constraint types. Includes real-time dragging (tweak) — temporarily adds a coincident constraint at mouse position.

### 8.2 3D Assembly Solver (`solver3d.rs` — 890 lines, 22 tests)

Constraint types: Mate, Align, Offset, Angle, Fixed.

Iterative position solver for rigid body assembly.

### 8.3 Solver Types (`types.rs` — 147 lines, 6 tests)

`SolveResult` enum: Ok, Inconsistent, Redundant, TooManyUnknowns, Failed.

---

## 9. Rendering Engine

The `renderer` crate (553 lines, 6 source files) provides the wgpu-based rendering infrastructure:

| Module | Lines | Purpose |
|--------|------:|---------|
| `camera.rs` | 167 | View + projection matrices, orbit controls |
| `pipeline.rs` | 127 | Render passes, pipeline state |
| `scene.rs` | 112 | Scene graph, render objects |
| `viewport.rs` | 74 | Viewport resize, aspect ratio |
| `gpu.rs` | 50 | wgpu device, queue management |

> **Note:** The desktop app currently uses **Three.js** (via React Three Fiber) for the 3D viewport rather than the native wgpu renderer. The `renderer` crate exists as foundation for a 🔮 future native viewport. The current 3D rendering path is: Tauri backend computes geometry → serializes mesh data to frontend → Three.js renders.

---

## 10. User Interface / UX Layer

### 10.1 Frontend Architecture

```
apps/desktop/src/
├── api/
│   └── tauri.ts           # 37 Tauri invoke() wrappers + TypeScript interfaces
├── store/
│   └── editorStore.ts     # Zustand store (1,062 lines) — Fusion 360-style state
├── components/            # React components
└── App.tsx                # Root application component
```

### 10.2 Zustand Store (Fusion 360-Style)

The `editorStore.ts` models a complete professional CAD UX:

**Workspaces:** Design, Assembly, Drawing (Fusion 360 workspace tabs)

**Tool Palette per Workspace:**
- Design workspace: 18 tools (sketch, extrude, revolve, fillet, chamfer, boolean, shell, pattern, mirror, pipe, loft, hole, draft, measure, section, import, export, appearance)
- Assembly workspace: 28 tools (joint types, motion links, rigid groups, interference checks, exploded views)
- Drawing workspace: 8 tools (projected/section/detail/break views, dimensions, annotations, title block)

**Kernel-Backed Sketch State (synchronized via Tauri IPC):**

```typescript
kernelSketches: SketchInfo[]
activeKernelSketchId: string | null
kernelSketchEntities: SketchEntityInfo[]
kernelSketchConstraints: ConstraintInfo[]
kernelSketchPaths: SketchPathInfo[]
snapResult: SnapResultInfo | null
kernelToolStatus: ToolStatusInfo | null
sketchSnapshotDepth: number
```

**Additional State:**
- Parametric timeline (feature tree with drag-to-reorder)
- Browser tree (22 node types for features, bodies, sketches, datums, etc.)
- Marking menus (right-click context menus)
- Section planes (live cross-section cutting)
- Box selection (window + crossing modes)
- Snap toggles (grid, endpoint, midpoint, center, intersection, axis)
- Navigation style picker (Fusion/SolidWorks/Blender/OnShape/Inventor)

### 10.3 TypeScript API Layer (`tauri.ts` — 328 lines)

All 37 Tauri IPC commands are wrapped with TypeScript interfaces:

```typescript
interface SketchInfo { id: string; name: string; entity_count: number; constraint_count: number }
interface SketchEntityInfo { id: string; entity_type: string; data: string }
interface ConstraintInfo { id: string; constraint_type: string; data: string }
interface SketchPathInfo { entities: string[]; is_cyclic: boolean }
interface SnapResultInfo { position: [number, number]; snap_type: string; source_entity?: string }
interface ToolStatusInfo { state_name: string; state_index: number; total_states: number }
```

### 10.4 Frontend Test Coverage (319 Passing)

| Test File | Cases | Description |
|-----------|------:|-------------|
| `editorStore.test.ts` | 64 | Full Zustand store coverage |
| `callicat3dModel.test.ts` | 98 | 3D model operations |
| `expressionEngine.test.ts` | 60 | Parametric expression engine |
| `autoConstraints.test.ts` | 29 | Automatic constraint inference |
| `sketchConstraints.test.ts` | 14 | Sketch constraint solver |
| `SketchAnnotations.test.ts` | 12 | Dimension annotations |
| `ViewportFeatures.test.ts` | 12 | Viewport interaction |
| `NavigationStylePicker.test.ts` | 8 | Navigation style switching |
| `callicatWorkflow.test.ts` | 8 | End-to-end workflows |
| `shortcutConflicts.test.ts` | 7 | Keyboard shortcut resolution |
| `callicatGenerateSTL.test.ts` | 5 | STL export flow |
| **Total** | **317+** | |

---

## 11. Desktop Application (Tauri Bridge)

### 11.1 Architecture

```
React Component → invoke("command_name", { args }) → Tauri IPC
    → src-tauri/commands.rs handler
    → editor-shell / cad-kernel / cam-engine
    → serialize result to JSON
    → return to React
```

### 11.2 Registered Commands (37 Total)

| Category | Commands |
|----------|----------|
| **Primitives** | `create_box`, `create_cylinder` |
| **Entities** | `list_entities`, `delete_entity` |
| **History** | `undo`, `redo` |
| **File I/O** | `import_file`, `export_stl`, `export_step` |
| **Analysis** | `analyze_dfm`, `get_mesh_data`, `get_mesh_quality` |
| **Sketch CRUD** | `create_sketch`, `delete_sketch`, `list_sketches`, `set_active_sketch`, `get_active_sketch` |
| **Sketch Entities** | `add_sketch_entity`, `remove_sketch_entity`, `list_sketch_entities`, `get_sketch_entity`, `list_entity_connections`, `get_sketch_paths` |
| **Sketch Operations** | `trim_sketch_entity`, `bevel_sketch_point`, `offset_sketch_path` |
| **Snap** | `compute_snap`, `configure_snap` |
| **Clipboard** | `copy_sketch_entities`, `paste_sketch_entities` |
| **Snapshot** | `take_sketch_snapshot`, `restore_sketch_snapshot` |
| **Tool System** | `activate_sketch_tool`, `send_tool_input` |
| **Constraints** | `add_sketch_constraint`, `remove_sketch_constraint` |
| **Path Analysis** | `get_sketch_main_path` |

### 11.3 State Management Pattern

The Tauri backend holds a `Mutex<EditorApp>` (from `editor-shell`) as shared state. Each command handler:

1. Locks the `EditorApp`
2. Dispatches an `EditorCommand` (or calls kernel methods directly for queries)
3. Serializes the result to JSON
4. Returns to the frontend

The frontend Zustand store calls Tauri `invoke()` and updates local state from the response.

### 11.4 Build

```bash
# Development
cd apps/desktop && npx tauri dev

# Release build (debug, no bundle)
cd apps/desktop && npx tauri build --debug --no-bundle

# Standalone executable
target\debug\r3ditor-desktop.exe   # ~14.8 MB
```

---

## 12. File Format & Data Exchange

### 12.1 Import/Export Matrix (Implemented)

| Format | Import | Export | Engine | Notes |
|--------|:------:|:------:|--------|-------|
| **STEP** (.step/.stp) | ✅ | ✅ | truck-stepio | AP214 |
| **STL** (.stl) | ✅ | ✅ | wasm-meshkit + tessellation.rs | ASCII + binary |
| **OBJ** (.obj) | ✅ | ✅ | Native Rust parser | With materials |
| **G-code** (.nc/.gcode) | — | ✅ | cam-engine | 8 post-processors |

### 12.2 Planned Formats 🔮

IGES, 3MF, glTF, SVG, DXF, PDF

---

## 13. Plugin / Extension Architecture

The `plugin-runtime` crate (463 lines, 7 tests) provides WASM-sandboxed plugin execution via Wasmtime.

| Module | Lines | Purpose |
|--------|------:|---------|
| `runtime.rs` | 162 | Wasmtime-based sandboxed WASM execution |
| `manifest.rs` | 145 | Plugin metadata + capability declarations |
| `registry.rs` | 141 | Plugin discovery + lifecycle management |

Plugin categories: DFM Rules, Materials, Post-Processors, File Formats. Runtime is ready; no production plugins shipped yet.

---

## 14. Deployment Topology

### 14.1 Desktop Mode (Primary — Implemented)

```
┌──────────────────────────────────────────────┐
│          TAURI 2 DESKTOP APPLICATION          │
│  ┌──────────────────────────────────────────┐ │
│  │  Rust Core (single binary, ~14.8 MB)     │ │
│  │  • cad-kernel (B-Rep + sketch + tools)   │ │
│  │  • editor-shell (ECS + commands)         │ │
│  │  • cam-engine (toolpaths + G-code)       │ │
│  │  • constraint-solver (2D + 3D)           │ │
│  │  • dfm-analyzer                          │ │
│  │  • plugin-runtime (wasmtime)             │ │
│  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │  Web Frontend (Tauri webview)            │ │
│  │  • React 18.3 + TypeScript 5.6           │ │
│  │  • Three.js 0.170 (3D viewport)          │ │
│  │  • Zustand 5.0 (state management)        │ │
│  │  • Tailwind 3.4 (styling)                │ │
│  └──────────────────────────────────────────┘ │
│  GPU: System GPU via Three.js WebGL           │
│  Storage: Local filesystem                    │
│  No internet required                         │
└──────────────────────────────────────────────┘
```

### 14.2 Cloud Mode (Infrastructure Exists)

API Gateway (Axum 0.7), 3 Redis Stream worker crates, PostgreSQL 16, Redis 7, MinIO/S3, Docker + Kubernetes, Prometheus + Grafana.

---

## 15. Crate / Package Dependency Map

```
                            ┌──────────────────┐
                            │  apps/desktop    │
                            │  (Tauri 2 shell) │
                            └──────┬───────────┘
                                   │ depends on
                    ┌──────────────┼────────────────┐
                    ▼              ▼                 ▼
          ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
          │editor-shell │ │  cad-kernel  │ │  cam-engine  │
          │(ECS + cmds) │ │(10,269 lines)│ │(1,555 lines) │
          └──────┬──────┘ └──────┬───────┘ └──────┬───────┘
                 │               │                │
        ┌────────┼───────┐      │                │
        ▼        ▼       ▼      ▼                ▼
   ┌────────┐┌───────┐┌──────────────┐    ┌──────────────┐
   │renderer││plugin-││constraint-   │    │dfm-analyzer  │
   │        ││runtime││solver        │    │(561 lines)   │
   │(553 ln)││(463ln)││(1,915 lines) │    └──────┬───────┘
   └────────┘└───────┘└──────┬───────┘           │
                             │                    │
                    ┌────────┴────────────────────┘
                    ▼
          ┌──────────────────┐
          │  shared-types    │
          │  (1,130 lines)   │
          │  geometry, mats, │
          │  estimation, dfm │
          └──────┬───────────┘
                 │
        ┌────────┼────────────┐
        ▼        ▼            ▼
   ┌────────┐ ┌─────────┐ ┌──────────┐
   │ truck-*│ │  glam   │ │  rayon   │
   │ crates │ │  (SIMD) │ │  (par)   │
   └────────┘ └─────────┘ └──────────┘

Also in workspace (independent):
  api-gateway, wasm-meshkit, bench,
  worker-analysis, worker-cad, worker-cam
```

---

## 16. Technology Matrix

### 16.1 Core Engine (Rust)

| Layer | Crate | Purpose |
|-------|-------|---------|
| Math | `glam` | SIMD vec/mat/quat |
| Math | `nalgebra` | Dense linear algebra for solvers |
| Geometry | `truck-geotrait` .. `truck-stepio` (7 crates) | B-Rep/NURBS kernel |
| GPU | `wgpu` | Cross-platform GPU |
| Windowing | `winit` | Cross-platform windows |
| UI | `egui` + `egui-wgpu` + `egui-winit` | Immediate-mode GUI |
| Parallelism | `rayon` | Data-parallel iterators |
| Async | `tokio` | Async I/O |
| Serialization | `serde` + `serde_json` | JSON serialization |
| Plugins | `wasmtime` | WASM runtime |

### 16.2 Frontend (TypeScript/React)

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 18.3 | UI framework |
| `typescript` | 5.6 | Type safety |
| `vite` | 6.4.1 | Build tool |
| `three` | 0.170 | 3D viewport |
| `@react-three/fiber` | 8.17 | React Three.js wrapper |
| `zustand` | 5.0 | State management |
| `tailwindcss` | 3.4 | Utility CSS |

### 16.3 Desktop Shell

| Technology | Version | Purpose |
|------------|---------|---------|
| `tauri` | 2.2 | Native window |
| `tauri-plugin-store` | 2.0 | Persistent settings |
| `tauri-plugin-dialog` | 2.0 | Native file dialogs |
| `tauri-plugin-fs` | 2.0 | File system access |

---

## 17. Test Coverage

### 17.1 Rust Tests (295 Passing)

| Crate | Tests | Key Coverage |
|-------|------:|-------------|
| `cad-kernel` | 125 | operations (60), sketch_ops (13), tessellation (11), tools (6), snap (6), document (5), naming (5), brep (4), sketch (4), snapshot (4), history (4), features (3) |
| `cam-engine` | 64 | toolpaths (26), G-code (17), nesting (18), sheet (2), CNC (1) |
| `constraint-solver` | 30 | solver3d (22), types (6), solver2d (2) |
| `dfm-analyzer` | 27 | analysis (10), checks (17) |
| `editor-shell` | 22 | app (13), commands (9) |
| `wasm-meshkit` | 20 | mesh ops (13), STL (1), LOD (6) |
| `plugin-runtime` | 7 | runtime (7) |
| `shared-types` | 0 | ⚠️ No tests |
| `renderer` | 0 | ⚠️ No tests |

### 17.2 Frontend Tests (319 Passing)

64 store tests + 317 component/integration tests. See Section 10.4 for full breakdown.

### 17.3 Running Tests

```bash
# All Rust tests
cargo test --workspace

# Frontend tests
cd apps/desktop && npx vitest run
```

---

## 18. Performance Targets

### 18.1 Implemented

| Operation | Target | Method |
|-----------|--------|--------|
| Constraint solve (200 equations) | < 5ms | DogLeg → LM → BFGS → NR cascade |
| Feature execution (single) | < 200ms | Incremental rebuild, cached intermediates |
| Sketch snap computation | < 1ms | Priority-sorted candidate collection |
| Tauri IPC round-trip | < 5ms | Serde JSON serialization |

### 18.2 Future 🔮

| Operation | Target | Method |
|-----------|--------|--------|
| GPU tessellation (1M pts) | < 2ms | WGSL compute shaders |
| Boolean (50K-tri solids) | < 100ms | GPU classification |
| 60 FPS rendering | 16.7ms | Deferred PBR + GPU culling |

---

## 19. Implementation Status & Roadmap

### 19.1 Completed ✅

- B-Rep/NURBS kernel (Truck) with 20 parametric features (60 tests)
- Topological Naming Service (5-cascade resolution)
- 7 sketch entity types + 19 constraints
- Sketch operations: trim, bevel, offset, path walker, intersections, bezier, mesh (13 tests)
- Stateful tool framework: LineTool, CircleTool, ArcTool, RectangleTool (6 tests)
- Snap engine: 7 snap types + GPU picking color map + spiral search (6 tests)
- Sketch snapshots + tool undo manager + clipboard with dependency resolution (4 tests)
- Transaction-based undo/redo, document model, event bus, dependency graph
- Mesh quality analysis + Laplacian/Taubin smoothing + STL export (11 tests)
- 2D constraint solver (4-stage cascade) + 3D assembly solver (30 tests)
- CNC toolpaths + 8 G-code post-processors + 2D nesting + sheet metal (64 tests)
- DFM analysis with severity scoring (27 tests)
- WASM plugin runtime (Wasmtime) + WASM mesh toolkit (27 tests)
- ECS world + 22 commands + 21 tools (22 tests)
- Tauri 2 desktop app with 37 IPC commands
- Zustand store (Fusion 360-style) with 319 frontend tests
- 17 sheet + 6 CNC materials catalog
- API gateway, Docker/K8s deployment, Prometheus/Grafana

### 19.2 Future Roadmap 🔮

| Phase | Features |
|-------|----------|
| **Native viewport** | Replace Three.js with wgpu PBR renderer |
| **GPU compute** | WGSL shaders for tessellation, BVH, booleans |
| **FEA simulation** | Stress, thermal, modal analysis |
| **Collaboration** | CRDT-based multi-user editing |
| **3D printing** | Slicing, support generation |
| **Formats** | IGES, 3MF, glTF, SVG, DXF |
| **Advanced CAM** | Adaptive clearing, material removal simulation |

---

## Appendix A — Workspace Crate Inventory

| Crate | Files | Lines | Tests |
|-------|------:|------:|------:|
| `cad-kernel` | 13 | 10,269 | 125 |
| `constraint-solver` | 4 | 1,915 | 30 |
| `cam-engine` | 6 | 1,555 | 64 |
| `editor-shell` | 6 | 1,301 | 22 |
| `shared-types` | 9 | 1,130 | 0 |
| `renderer` | 6 | 553 | 0 |
| `dfm-analyzer` | 3 | 561 | 27 |
| `wasm-meshkit` | 4 | 531 | 20 |
| `plugin-runtime` | 4 | 463 | 7 |
| `apps/desktop` (Tauri) | 2 | ~792 | 0 |
| **Rust Total** | **57+** | **~19,070** | **295** |
| **Frontend (TS)** | **3+** | **~1,390+** | **319** |
| **Grand Total** | **60+** | **~20,460+** | **614** |

---

## Appendix B — Cargo Workspace Dependencies

```toml
[workspace]
resolver = "2"
members = [
    "packages/api-gateway",
    "packages/worker-analysis",
    "packages/worker-cad",
    "packages/worker-cam",
    "packages/shared-types",
    "packages/wasm-meshkit",
    "packages/cad-kernel",
    "packages/cam-engine",
    "packages/constraint-solver",
    "packages/dfm-analyzer",
    "packages/renderer",
    "packages/editor-shell",
    "packages/plugin-runtime",
    "apps/desktop/src-tauri",
    "packages/bench",
]

[workspace.package]
version = "0.2.0"
edition = "2021"
license = "AGPL-3.0"
```

### Key Dependency Categories

| Category | Crates |
|----------|--------|
| **Geometry** | truck-geotrait, -topology, -modeling, -shapeops, -meshalgo, -polymesh, -stepio (0.6) |
| **Math** | glam (SIMD), nalgebra |
| **GPU** | wgpu, egui, egui-wgpu, egui-winit, winit |
| **Runtime** | tokio (async), rayon (parallel) |
| **Desktop** | tauri 2.2, tauri-plugin-store/dialog/fs |
| **Plugins** | wasmtime |
| **Web** | axum, sqlx, redis |
| **WASM** | wasm-bindgen, js-sys, web-sys |

---

*Document last updated: June 2025 · r3ditor v0.2.0 · License: AGPL-3.0*
