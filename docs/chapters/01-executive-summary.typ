#import "../template.typ": *

= Executive Summary

== Vision

r3ditor is a *full-featured open-source 3D CAD/CAM editor* built from the ground up in Rust, targeting professional-grade manufacturing workflows. It transforms an existing DFM Quote Suite — a browser-based upload → analyze → quote pipeline — into an integrated design-to-manufacture platform.

#info-box(title: "Mission Statement")[
  Deliver an enterprise-grade parametric 3D modeling tool with integrated CNC/sheet-metal manufacturing capabilities, GPU-accelerated rendering, and cross-platform deployment — all powered by a pure-Rust crate ecosystem.
]

== Key Capabilities

  #grid(
    columns: (1fr, 1fr),
    column-gutter: 16pt,
    row-gutter: 12pt,
    [
      === Pure-Rust CAD Kernel
      Built on the *Truck* B-Rep ecosystem with NURBS surface modeling, 20 parametric feature kinds, boolean operations, topological naming (5-priority cascade), and full transaction-based undo/redo history.
    ],
    [
      === Sketch System (Blender-Inspired)
      7 entity types, 19 constraint types, 4-stage cascade solver (DogLeg→LM→BFGS→NR), stateful tool framework with continuous draw, snap engine (7 types), GPU picking color map, sketch snapshots, and clipboard with dependency resolution.
    ],
    [
      === Integrated Manufacturing
      CNC toolpath generation with physics models (Kienzle, Taylor, Loewen-Shaw, Altintas), sheet metal cutting (laser/plasma/waterjet), bending with springback prediction, 8 G-code post-processors, and 2D nesting optimization.
    ],
    [
      === Cross-Platform Deployment
      Native desktop via *Tauri 2.2* with React 18.3/TypeScript 5.6/Three.js 0.170 frontend, 37 Tauri IPC commands, Zustand 5.0 state management. Cloud mode via Axum API + Docker/Kubernetes.
    ],
  )#v(0.5cm)

== Architecture at a Glance

#align(center)[
  #image("../assets/architecture-overview.svg", width: 100%)
]

== Project Metrics

  #grid(
    columns: (1fr, 1fr, 1fr, 1fr, 1fr),
    column-gutter: 10pt,
    metric-card("Rust Crates", "15"),
    metric-card("Rust Tests", "295"),
    metric-card("Frontend Tests", "319"),
    metric-card("Materials", "23"),
    metric-card("Post-Processors", "8"),
  )

  #v(0.3cm)

  #grid(
    columns: (1fr, 1fr, 1fr, 1fr, 1fr),
    column-gutter: 10pt,
    metric-card("Constraint Types", "19"),
    metric-card("Feature Types", "20"),
    metric-card("Tauri Commands", "37"),
    metric-card("Editor Commands", "22"),
    metric-card("Tool Types", "21"),
  )== Design Principles

The architecture is guided by eight core principles:

#table(
  columns: (auto, 1fr),
  table.header(
    [*Principle*], [*Description*],
  ),
  table.cell(fill: r3ditor-light)[*Zero-Copy GPU Path*], [Geometry flows from B-Rep evaluation → tessellation → GPU buffer with minimal intermediate allocation.],
  table.cell(fill: r3ditor-light)[*Rayon Everywhere*], [Data-parallel operations (tessellation, nesting, DFM checks) use Rayon's work-stealing thread pool.],
  table.cell(fill: r3ditor-light)[*ECS-Inspired Schedule*], [4-stage frame loop (Input → Constraint → Geometry → Render) ensures deterministic execution order.],
  table.cell(fill: r3ditor-light)[*Type-Safe Boundaries*], [`shared-types` crate defines all API contracts, preventing deserialization mismatches across 15 crates.],
  table.cell(fill: r3ditor-light)[*Plugin Sandbox*], [WASM plugins run in wasmtime with capability-based security — untrusted code cannot access the filesystem.],
  table.cell(fill: r3ditor-light)[*Offline-First*], [Desktop mode works fully offline; cloud features are additive enhancements, not requirements.],
  table.cell(fill: r3ditor-light)[*Incremental Migration*], [Each phase adds capability while preserving the existing working system.],
  table.cell(fill: r3ditor-light)[*Manufacturing Truth*], [Physics-based models (Kienzle, Taylor) ensure cost estimates reflect real-world machining conditions.],
)
