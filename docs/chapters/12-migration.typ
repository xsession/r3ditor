#import "../template.typ": *

= Migration Path

== Overview

R3ditor follows a *five-phase migration strategy* to transition from a legacy DFM analysis suite to a fully integrated CAD/CAM/Editor platform. Each phase is self-contained and delivers production-ready functionality.

#align(center)[
  #image("../assets/migration-roadmap.svg", width: 100%)
]

== Phase 1: Foundation Sprint (Weeks 1–4)

#success-box(title: "Phase Complete")[
  All foundation milestones delivered. Cargo workspace with 15 crates, Tauri shell, CI pipeline, and database migrations operational.
]

*Goal:* Establish the Rust workspace, build system, CI/CD pipeline, and core data structures.

#table(
  columns: (auto, 1fr, auto),
  table.header([*Milestone*], [*Deliverables*], [*Week*]),
  [M1.1], [Cargo workspace with 15 crate stubs; `cargo check` passes], [1],
  [M1.2], [ECS world (`hecs`) with basic entity/component model], [1],
  [M1.3], [wgpu 28 renderer: window creation, clear color, triangle demo], [2],
  [M1.4], [React + Vite frontend scaffold with Tailwind; Tauri shell boots], [2],
  [M1.5], [CI pipeline: `cargo clippy`, `cargo test`, `cargo fmt --check`], [3],
  [M1.6], [Docker Compose with PostgreSQL + Redis + MinIO; health check endpoint], [3],
  [M1.7], [Database migrations (SQLx); seed data for materials catalog], [4],
  [M1.8], [Integration test harness; code coverage reporting], [4],
)

*Exit Criteria:* `cargo build --workspace` succeeds; Tauri app launches with blank viewport; API responds to `/health`.

== Phase 2: Geometry Engine (Weeks 5–10)

#success-box(title: "Phase Complete")[
  CAD kernel operational with 20 feature types, 4-stage constraint solver (19 types), full sketch system with 7 entity types, STL/STEP import/export, and undo/redo history. 125 kernel tests, 30 solver tests passing.
]

*Goal:* Implement the dual B-Rep kernel, parametric features, constraint solver, and mesh import/export.

#table(
  columns: (auto, 1fr, auto),
  table.header([*Milestone*], [*Deliverables*], [*Week*]),
  [M2.1], [Truck B-Rep integration: create box, cylinder, sphere primitives], [5],
  [M2.2], [Boolean operations (union, subtract, intersect) via Truck], [6],
  [M2.3], [Parametric feature stack: 20 feature types (extrude, revolve, fillet, chamfer, hole, loft, sweep, shell, draft, thread, linear/circular pattern, mirror, import STL)], [7],
  [M2.4], [4-stage cascade constraint solver: DogLeg → LM → BFGS → NR with 19 constraint types], [8],
  [M2.5], [STL/OBJ import via `wasm-meshkit`; binary + ASCII detection], [8],
  [M2.6], [STEP import/export via `truck-stepio`], [9],
  [M2.7], [Undo/redo history with delta snapshots], [9],
  [M2.8], [GPU tessellation pipeline; adaptive LOD], [10],
)

*Exit Criteria:* Can model a bracket with holes, fillets, and chamfers; STEP round-trip preserves topology.

== Phase 3: Manufacturing Intelligence (Weeks 11–16)

#success-box(title: "Phase Complete")[
  CAM engine with 8 post-processors (Fanuc, Haas, Mazak, Heidenhain, Grbl, LinuxCNC, Marlin, Klipper), DFM analyzer (27 tests), nesting engine, and cost estimation pipeline. 64 CAM tests passing.
]

*Goal:* Implement DFM analysis, cost estimation, toolpath generation, and sheet metal operations.

#table(
  columns: (auto, 1fr, auto),
  table.header([*Milestone*], [*Deliverables*], [*Week*]),
  [M3.1], [DFM rule engine: thin walls, draft angles, undercuts, sharp edges], [11],
  [M3.2], [Material catalog with 17 metals + 6 plastics; physical properties], [11],
  [M3.3], [Cost estimation: Kienzle cutting force, Taylor tool life], [12],
  [M3.4], [Sheet metal: bend allowance (K-factor), flat pattern unfolding], [13],
  [M3.5], [Laser/plasma/waterjet cutting simulation with kerf compensation], [13],
  [M3.6], [Nesting engine: bottom-left fill + parallel rotation search], [14],
  [M3.7], [Toolpath generation: roughing, finishing, contouring], [15],
  [M3.8], [G-code post-processors: Fanuc, Haas, Mazak, Heidenhain, Grbl, LinuxCNC, Marlin, Klipper], [16],
)

*Exit Criteria:* Upload STL → auto-DFM → cost quote → nested layout → G-code download workflow complete.

== Phase 4: Desktop & Plugins (Weeks 17–22)

#info-box(title: "Phase In Progress")[
  Tauri desktop app functional with 37 IPC commands, React frontend with Zustand store (1,062 lines, 319 tests), Three.js viewport, and complete sketch tool system (7 tools, StatefulTool pattern). Plugin runtime operational (wasmtime 28, 7 tests). Remaining: view modes, auto-updater, packaging.
]

*Goal:* Polish the desktop application, implement the plugin system, and release the first public beta.

#table(
  columns: (auto, 1fr, auto),
  table.header([*Milestone*], [*Deliverables*], [*Week*]),
  [M4.1], [egui viewport: 3D navigation (orbit, pan, zoom), selection, gizmos], [17],
  [M4.2], [React panels: feature tree, properties, material picker, timeline], [18],
  [M4.3], [8 view modes: Shaded, Wireframe, X-Ray, DFM Heatmap, etc.], [19],
  [M4.4], [WASM plugin runtime (wasmtime 28); plugin manifest + security], [20],
  [M4.5], [3 example plugins: material lib, DFM rule pack, post-processor], [20],
  [M4.6], [Keyboard shortcuts, command palette, preferences system], [21],
  [M4.7], [Auto-updater (Tauri); MSI/DMG/DEB packaging], [21],
  [M4.8], [Public beta release; documentation site; feedback channel], [22],
)

*Exit Criteria:* Desktop app installable on Windows/macOS/Linux; plugin SDK published; beta testers onboarded.

== Phase 5: Cloud & Marketplace (Weeks 23–30)

*Goal:* Deploy the cloud backend, launch the plugin marketplace, and enable e-commerce integrations.

#table(
  columns: (auto, 1fr, auto),
  table.header([*Milestone*], [*Deliverables*], [*Week*]),
  [M5.1], [Cloud API: JWT auth, file upload, job queue, SSE streaming], [23],
  [M5.2], [Worker fleet: CAD, Analysis, CAM workers with Redis Streams], [24],
  [M5.3], [Kubernetes Helm chart; horizontal auto-scaling], [25],
  [M5.4], [Shopify + WooCommerce platform adapters], [26],
  [M5.5], [Plugin marketplace: submit, review, install, update lifecycle], [27],
  [M5.6], [Collaboration: project sharing, team workspaces, audit log], [28],
  [M5.7], [Performance hardening: benchmark baselines, regression CI gate], [29],
  [M5.8], [GA release; SLA commitments; on-call rotation established], [30],
)

*Exit Criteria:* Cloud API at \<100ms p99; Shopify integration live; GA release published.

== Risk Mitigation

#table(
  columns: (auto, auto, 1fr, 1fr),
  table.header([*Risk*], [*Severity*], [*Mitigation*], [*Contingency*]),
  [Truck B-Rep limitations], [High], [Early prototype of complex models; identify gaps by Week 6], [Fall back to OpenCascade FFI for unsupported operations],
  [wgpu driver bugs], [Medium], [Test on AMD/NVIDIA/Intel/Apple; use `wgpu` validation layer], [Software rasterizer fallback for CI; reduce shader complexity],
  [WASM plugin performance], [Medium], [Benchmark wasmtime AOT vs. interpreted; set memory limits], [Native plugin API for performance-critical extensions],
  [STEP parser coverage], [Medium], [Test against NIST STEP validation suite (100+ files)], [OpenCascade STEP reader as fallback import path],
  [Cloud scaling costs], [Low], [Auto-scaling with floor/ceiling limits; spot instances for workers], [Async job queue with configurable concurrency caps],
)

#info-box(title: "Migration from Legacy Systems")[
  Organizations migrating from existing DFM tools can use the *Bridge Mode*: import legacy material databases, DFM rule sets, and machine profiles via CSV/JSON bulk import endpoints. A migration wizard guides users through mapping legacy fields to r3ditor's data model.
]
