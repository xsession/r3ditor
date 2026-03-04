#import "../template.typ": *

= CAD Kernel

== Dual Kernel Strategy

The r3ditor CAD kernel employs a *dual kernel strategy*: the Truck B-Rep ecosystem serves as the primary kernel (pure Rust, WASM-compatible), while OpenCASCADE provides a fallback for advanced NURBS operations and complex STEP file import/export.

#align(center)[
  #image("../assets/cad-kernel-architecture.svg", width: 100%)
]

== Primary Kernel — Truck B-Rep

The Truck ecosystem provides a complete set of pure-Rust crates for boundary representation modeling:

#table(
  columns: (auto, auto, 1fr),
  table.header([*Crate*], [*Version*], [*Purpose*]),
  [`truck-base`], [0.6], [Core traits and utility types],
  [`truck-geotrait`], [0.6], [Geometric trait definitions],
  [`truck-geometry`], [0.6], [NURBS curves and surfaces, rational B-splines],
  [`truck-topology`], [0.6], [B-Rep topology: Vertex → Edge → Wire → Face → Shell → Solid],
  [`truck-modeling`], [0.6], [High-level modeling operations (extrude, revolve, loft, sweep)],
  [`truck-shapeops`], [0.6], [Boolean operations (union, subtract, intersect)],
  [`truck-meshalgo`], [0.6], [Tessellation algorithms, mesh generation from NURBS],
  [`truck-polymesh`], [0.6], [Polygon mesh representation and manipulation],
  [`truck-stepio`], [0.6], [STEP AP214 file import and export],
  [`truck-platform`], [0.6], [GPU rendering integration],
  [`truck-rendimpl`], [0.6], [Render implementation for Truck geometry],
)

#success-box(title: "Why Truck?")[
  Truck is the only production-quality *pure-Rust* B-Rep kernel, making it compilable to WASM for browser deployment. It is MIT-licensed, actively maintained, and provides excellent Rayon integration for parallel tessellation.
]

== Parametric Feature Tree

The CAD kernel implements a *history-based parametric modeling* approach with a feature tree that records all design operations:

=== Supported Feature Types

#grid(
  columns: (1fr, 1fr, 1fr),
  column-gutter: 12pt,
  row-gutter: 8pt,
  [
    *Additive*
    - Extrude (Boss)
    - Revolve
    - Loft
    - Sweep
  ],
  [
    *Subtractive*
    - Cut (Extrude)
    - Hole (Simple / Counterbore)
    - Thread
    - Shell
  ],
  [
    *Modifiers*
    - Fillet
    - Chamfer
    - Draft
    - Pattern (Linear / Circular)
    - Mirror
  ],
)

=== Feature Tree Data Model

```rust
pub enum Feature {
    Extrude { sketch_id: Uuid, depth: f64, direction: Direction },
    Cut { sketch_id: Uuid, depth: f64 },
    Fillet { edge_ids: Vec<Uuid>, radius: f64 },
    Chamfer { edge_ids: Vec<Uuid>, distance: f64 },
    Shell { face_ids: Vec<Uuid>, thickness: f64 },
    Revolve { sketch_id: Uuid, axis: Axis, angle: f64 },
    Pattern { feature_id: Uuid, pattern_type: PatternType },
    Mirror { feature_id: Uuid, plane: Plane },
    Hole { center: Point3, diameter: f64, depth: f64 },
    Thread { hole_id: Uuid, pitch: f64, thread_type: ThreadType },
    Draft { face_ids: Vec<Uuid>, angle: f64, direction: Vector3 },
}
```

=== History & Undo/Redo

The kernel implements a *command pattern* for full undo/redo support:

- Every feature operation creates an undoable `EditorCommand`
- The undo stack stores up to *48 MB* of history (configurable)
- Redo is supported until a new operation branches the history
- Feature tree replay reconstructs the B-Rep from any point in history

#warning-box(title: "Performance Note")[
  Full feature tree replay evaluates all features from the root. For models with 50+ features, incremental evaluation is used — only features downstream of the edit are re-evaluated.
]

== Constraint Solver

=== 2D Sketch Constraints

The sketch constraint solver supports *15 constraint types*, solved via Newton-Raphson iteration with sparse Jacobian matrices:

#table(
  columns: (1fr, 1fr, 1fr),
  table.header([*Geometric*], [*Dimensional*], [*Relational*]),
  [Coincident], [Horizontal Distance], [Equal Length],
  [Horizontal], [Vertical Distance], [Symmetric],
  [Vertical], [Angle], [Tangent],
  [Perpendicular], [Radius], [Concentric],
  [Parallel], [Diameter], [Midpoint],
)

=== Solver Algorithm

The Newton-Raphson solver operates with these parameters:

- *Maximum iterations*: 50
- *Convergence tolerance*: 1×10⁻¹⁰
- *Jacobian*: Sparse matrix via `nalgebra-sparse`
- *Line search*: Backtracking with Armijo condition
- *Fallback*: Levenberg-Marquardt damping for near-singular Jacobians

=== 3D Assembly Constraints

For multi-body assemblies, the 3D constraint solver supports:

- *Mate* — coincident faces
- *Align* — parallel axes/planes
- *Offset* — fixed distance between entities
- *Angular* — fixed angle between planes
- *Gear ratio* — linked rotational constraints

== B-Rep Operations

=== Boolean Operations

Boolean operations (union, subtract, intersect) are implemented via `truck-shapeops`:

#table(
  columns: (auto, auto, 1fr),
  table.header([*Operation*], [*Target*], [*Description*]),
  [Union], [< 50 ms @ 10K faces], [Merge two solids into a single body],
  [Subtract], [< 50 ms @ 10K faces], [Remove one solid from another (cuts, holes)],
  [Intersect], [< 50 ms @ 10K faces], [Retain only the overlapping volume],
)

=== Tessellation

B-Rep surfaces are tessellated to triangle meshes for rendering:

- *Parallel execution* via Rayon `par_iter` across faces
- *Adaptive refinement* based on surface curvature
- Target: *< 100 ms for 100K faces*
- Output: Vertex positions, normals, and UV coordinates

== OpenCASCADE Fallback

When Truck lacks coverage (complex surface intersections, full IGES support), the system falls to `opencascade-rs` 0.2 via C++ FFI:

#warning-box(title: "Limitation")[
  OpenCASCADE is *not WASM-compatible*. It is used only in desktop and cloud deployment modes. The WASM web build relies exclusively on Truck.
]
