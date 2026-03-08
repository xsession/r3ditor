#import "../template.typ": *

= Architecture Overview

== System Topology

The r3ditor system is organized as a *Rust workspace* containing 15 crates, a React frontend, and supporting infrastructure. The architecture follows a layered design with clear dependency boundaries enforced by the Cargo workspace.

#align(center)[
  #image("../assets/crate-dependency-graph.svg", width: 100%)
]

== Crate Organization

The workspace is organized into four dependency layers:

=== Layer 1 — Foundation

#crate-ref("shared-types") serves as the foundation crate, defining all cross-cutting data types, API contracts, and domain enumerations. Every other crate depends on it.

#table(
  columns: (auto, 1fr, auto),
  table.header([*Module*], [*Contents*], [*Key Types*]),
  [`api.rs`], [REST API request/response types], [`UploadResponse`, `JobStatus`, `QuoteResult`],
  [`geometry.rs`], [3D geometry primitives], [`Point3`, `Vector3`, `BoundingBox`, `Mesh`],
  [`materials.rs`], [Material catalogs (17 sheet + 6 CNC)], [`SheetMaterial`, `CncMaterial`, `PhysicalProperties`],
  [`dfm.rs`], [Design-for-manufacturing types], [`DfmFinding`, `Severity`, `DfmScore`],
  [`manufacturing.rs`], [Manufacturing process definitions], [`CuttingMethod`, `BendingMethod`, `CncOperation`],
  [`estimation.rs`], [Cost estimation models], [`SheetEstimate`, `CncEstimate`, `QuoteLineItem`],
  [`units.rs`], [Physical unit conversions], [`Length`, `Force`, `Temperature`, `Pressure`],
  [`platform.rs`], [Platform adapter interfaces], [`PlatformAdapter`, `ShopifyConfig`],
)

=== Layer 2 — Core Engines

These crates implement the domain-specific computation:

#grid(
  columns: (1fr, 1fr),
  column-gutter: 16pt,
  row-gutter: 12pt,
  [
    #crate-ref("cad-kernel") \
    Truck-based B-Rep kernel with NURBS surfaces, boolean operations, parametric feature tree (20 feature types), and history-based undo/redo. Includes a full *sketch system* with 7 entity types, trim/bevel/offset operations, StatefulTool machine, snap engine, and picking color map. 13 modules, 10,269 lines, 125 tests.
  ],
  [
    #crate-ref("cam-engine") \
    CNC physics (6 models), sheet metal cutting (4 methods), bending (3 formulas), toolpath generation, nesting optimization, and G-code post-processing for *8 machine types* (Fanuc, Haas, Mazak, LinuxCNC, Grbl, Marlin, Klipper, Heidenhain). 6 files, 1,555 lines, 64 tests.
  ],
  [
    #crate-ref("constraint-solver") \
    2D sketch constraint solver with *19 constraint types* and 3D assembly constraint solver. Uses a *4-stage cascade solver* (DogLeg → Levenberg-Marquardt → BFGS → Newton-Raphson) with sparse Jacobian matrices via `nalgebra-sparse`. 4 files, 1,915 lines, 30 tests.
  ],
  [
    #crate-ref("dfm-analyzer") \
    Design-for-manufacturability analysis with rule-based checks, severity scoring (0–100), and actionable feedback. Pluggable rule system for custom industry checks. 3 files, 561 lines, 27 tests.
  ],
  [
    #crate-ref("renderer") \
    Three.js-based rendering infrastructure providing scene management, camera controller (orbit/pan/zoom), and mesh display. Currently 553 lines of foundational code — advanced GPU pipeline planned for future phases.
  ],
)

=== Layer 3 — Integration

#grid(
  columns: (1fr, 1fr, 1fr),
  column-gutter: 12pt,
  [
    #crate-ref("editor-shell") \
    Orchestrator that wires all engines together via the `World` struct. Manages 22 `EditorCommand` variants, 21 tool types (7 sketch tools with `StatefulTool` lifecycle), sketch mode, `ToolSnapshotManager`, `ClipboardBuffer`, and the Tauri IPC bridge. 6 files, 1,301 lines, 22 tests.
  ],
  [
    #crate-ref("plugin-runtime") \
    wasmtime 28 plugin host with manifest parsing, capability-based security, registry management, and hot-reload support for 7 plugin categories.
  ],
  [
    #crate-ref("wasm-meshkit") \
    WASM-compiled mesh toolkit exposing STL parsing, mesh simplification (edge collapse), and geometry queries to browser environments via `wasm-bindgen`.
  ],
)

=== Layer 4 — Applications

#grid(
  columns: (1fr, 1fr),
  column-gutter: 16pt,
  row-gutter: 12pt,
  [
    #crate-ref("api-gateway") — Axum 0.7 REST API with JWT auth, file upload, job management via Redis streams, material queries, and quote generation. Includes SSE for real-time job status.
  ],
  [
    #crate-ref("worker-analysis") / #crate-ref("worker-cad") / #crate-ref("worker-cam") — Redis stream consumers for DFM analysis, geometry import, and toolpath/nesting computation respectively.
  ],
  [
    *Desktop App* (`apps/desktop`) — Tauri 2.2 shell with *37 IPC commands* (`commands.rs`, 692 lines), React 18.3 + TypeScript 5.6 frontend (1,062-line Zustand store), and native file system access.
  ],
  [
    #crate-ref("bench") — Criterion benchmark suite covering tessellation, constraint solving, CNC estimation, nesting, and DFM analysis with CI performance gates.
  ],
)

== ECS Frame Schedule

The editor operates on a *4-stage frame schedule*, targeting a 16.67 ms budget (60 FPS):

#align(center)[
  #image("../assets/ecs-frame-schedule.svg", width: 100%)
]

#table(
  columns: (auto, auto, 1fr, auto),
  table.header([*Stage*], [*Budget*], [*Responsibilities*], [*Threading*]),
  [① Input], [~2 ms], [Poll keyboard, mouse, touch events; update camera; enqueue commands], [Single thread],
  [② Constraint], [~3 ms], [Solve 2D sketch constraints via 4-stage cascade (DogLeg → LM → BFGS → NR); update dimension values], [Single thread],
  [③ Geometry], [~5 ms], [Evaluate B-Rep features; boolean ops; tessellation; upload mesh buffers], [Rayon parallel],
  [④ Render], [~6 ms], [Update scene graph; batch draw calls; run 11-pass pipeline; present frame], [GPU-bound],
)

#info-box(title: "Key Design Decision")[
  Stages run *sequentially within a frame* to ensure deterministic behavior. Only the Geometry stage uses Rayon data parallelism internally, as B-Rep tessellation is embarrassingly parallel across faces.
]

== Data Flow

The data flows through the system in a well-defined pipeline:

+ *User Input* → captured by React frontend → dispatched via Tauri IPC (`invoke`) → `EditorCommand` queue
+ *Commands* → processed by editor shell (`World` struct) → modify `FeatureTree`, `ConstraintSet`, and `SketchState`
+ *Constraint Solver* → resolves sketch constraints via 4-stage cascade → updates parametric dimensions
+ *CAD Kernel* → replays feature tree → evaluates B-Rep geometry → produces `BRepModel`
+ *Tessellation* → converts NURBS surfaces → triangle mesh (parallel via Rayon)
+ *Frontend Sync* → mesh data → Tauri events → Three.js scene update
+ *Render* → Three.js renders 3D viewport in React webview
+ *DFM Analysis* → runs on demand → returns severity findings
+ *CAM Engine* → generates toolpaths → produces G-code via 8 post-processors
