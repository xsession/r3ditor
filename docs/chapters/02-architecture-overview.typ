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
    Truck-based B-Rep kernel with NURBS surfaces, boolean operations, parametric feature tree, and history-based undo/redo. Depends on `truck-*` 0.6, `glam`, `nalgebra`, and `rayon`.
  ],
  [
    #crate-ref("cam-engine") \
    CNC physics (6 models), sheet metal cutting (4 methods), bending (3 formulas), toolpath generation, nesting optimization, and G-code post-processing for 7 machine types.
  ],
  [
    #crate-ref("constraint-solver") \
    2D sketch constraint solver (15 constraint types) and 3D assembly constraint solver. Uses Newton-Raphson iteration with sparse Jacobian matrices via `nalgebra-sparse`.
  ],
  [
    #crate-ref("dfm-analyzer") \
    Design-for-manufacturability analysis with rule-based checks, severity scoring (0–100), and actionable feedback. Pluggable rule system for custom industry checks.
  ],
  [
    #crate-ref("renderer") \
    wgpu 28 render engine with 11-pass pipeline, 8 visual modes, PBR Cook-Torrance BRDF, camera controller (orbit/pan/zoom), and 5 WGSL shader modules.
  ],
)

=== Layer 3 — Integration

#grid(
  columns: (1fr, 1fr, 1fr),
  column-gutter: 12pt,
  [
    #crate-ref("editor-shell") \
    ECS orchestrator that wires all engines together with a 4-stage frame schedule. Manages input, commands, and the UI integration layer.
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
    *Desktop App* (`apps/desktop`) — Tauri 2.2 shell with 11 IPC commands, React/TypeScript frontend, and native file system access.
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
  [② Constraint], [~3 ms], [Solve 2D sketch constraints; update dimension values; Newton-Raphson iterate], [Single thread],
  [③ Geometry], [~5 ms], [Evaluate B-Rep features; boolean ops; tessellation; upload mesh buffers], [Rayon parallel],
  [④ Render], [~6 ms], [Update scene graph; batch draw calls; run 11-pass pipeline; present frame], [GPU-bound],
)

#info-box(title: "Key Design Decision")[
  Stages run *sequentially within a frame* to ensure deterministic behavior. Only the Geometry stage uses Rayon data parallelism internally, as B-Rep tessellation is embarrassingly parallel across faces.
]

== Data Flow

The data flows through the system in a well-defined pipeline:

+ *User Input* → captured by `winit` event loop → dispatched to `EditorCommand` queue
+ *Commands* → processed by editor shell → modify `FeatureTree` and `ConstraintSet`
+ *Constraint Solver* → resolves sketch constraints → updates parametric dimensions
+ *CAD Kernel* → replays feature tree → evaluates B-Rep geometry → produces `BRepModel`
+ *Tessellation* → converts NURBS surfaces → triangle mesh (parallel via Rayon)
+ *GPU Upload* → mesh data → vertex/index buffers via wgpu
+ *Render Pipeline* → 11-pass rendering → frame present to display
+ *DFM Analysis* → runs in background → updates severity overlay
+ *CAM Engine* → generates toolpaths → produces G-code on demand
