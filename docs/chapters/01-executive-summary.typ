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
    Built on the *Truck* B-Rep ecosystem with NURBS surface modeling, boolean operations, parametric feature trees, and full undo/redo history. OpenCASCADE serves as a fallback for complex STEP I/O.
  ],
  [
    === GPU-Accelerated Rendering
    *wgpu 28* powers an 11-pass render pipeline with PBR Cook-Torrance shading, shadow maps, SSAO, bloom, and FXAA — targeting *60 FPS at 2M triangles* across Vulkan, Metal, DX12, and WebGPU.
  ],
  [
    === Integrated Manufacturing
    CNC toolpath generation with 6 physics models (Kienzle, Taylor, Loewen-Shaw, Altintas), sheet metal cutting (laser/plasma/waterjet), bending with springback prediction, and nesting optimization.
  ],
  [
    === Cross-Platform Deployment
    Native desktop via *Tauri 2.2* (Windows/Mac/Linux), browser via *WASM + WebGPU*, and cloud via *Kubernetes* — all sharing the same Rust crate ecosystem. Compile once, deploy everywhere.
  ],
)

#v(0.5cm)

== Architecture at a Glance

#align(center)[
  #image("../assets/architecture-overview.svg", width: 100%)
]

== Project Metrics

#grid(
  columns: (1fr, 1fr, 1fr, 1fr, 1fr),
  column-gutter: 10pt,
  metric-card("Rust Crates", "15"),
  metric-card("WGSL Shaders", "5"),
  metric-card("Materials", "23"),
  metric-card("Post-Processors", "7"),
  metric-card("Plugin Types", "7"),
)

#v(0.3cm)

#grid(
  columns: (1fr, 1fr, 1fr, 1fr, 1fr),
  column-gutter: 10pt,
  metric-card("Constraint Types", "15"),
  metric-card("Feature Types", "11"),
  metric-card("Render Passes", "11"),
  metric-card("Visual Modes", "8"),
  metric-card("View Shortcuts", "12"),
)

== Design Principles

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
