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

The sketch constraint solver supports *19 constraint types*, solved via a 4-stage cascade solver:

#table(
  columns: (1fr, 1fr, 1fr, 1fr),
  table.header([*Geometric*], [*Dimensional*], [*Relational*], [*Advanced*]),
  [Coincident], [Horizontal Distance], [Equal Length], [Concentric],
  [Horizontal], [Vertical Distance], [Symmetric], [EqualRadius],
  [Vertical], [Angle], [Tangent], [PointOnLine],
  [Perpendicular], [Radius], [Midpoint], [PointOnCircle],
  [Parallel], [Diameter], [], [],
)

=== 4-Stage Cascade Solver

The solver uses a cascading strategy for maximum robustness — each stage acts as a fallback:

#table(
  columns: (auto, auto, 1fr),
  table.header([*Stage*], [*Algorithm*], [*Characteristics*]),
  [1], [DogLeg Trust Region], [Default solver; excellent convergence for well-conditioned systems],
  [2], [Levenberg-Marquardt], [Damped least-squares; handles near-singular Jacobians],
  [3], [BFGS Quasi-Newton], [Gradient-based; good for large constraint sets],
  [4], [Newton-Raphson], [Direct solve with line search; final fallback],
)

Solver parameters:

- *Maximum iterations per stage*: 50
- *Convergence tolerance*: 1×10⁻¹⁰
- *Jacobian*: Sparse matrix via `nalgebra-sparse`
- *Cascade trigger*: stage fails → next stage inherits current state
- *Total tests*: 30 (constraint-solver crate)

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
  [Union], [\< 50 ms (10K faces)], [Merge two solids into a single body],
  [Subtract], [\< 50 ms (10K faces)], [Remove one solid from another (cuts, holes)],
  [Intersect], [\< 50 ms (10K faces)], [Retain only the overlapping volume],
)

=== Tessellation

B-Rep surfaces are tessellated to triangle meshes for rendering:

- *Parallel execution* via Rayon `par_iter` across faces
- *Adaptive refinement* based on surface curvature
- Target: *\< 100 ms for 100K faces*
- Output: Vertex positions, normals, and UV coordinates

== OpenCASCADE Fallback

When Truck lacks coverage (complex surface intersections, full IGES support), the system falls to `opencascade-rs` 0.2 via C++ FFI:

#warning-box(title: "Limitation")[
  OpenCASCADE is *not WASM-compatible*. It is used only in desktop and cloud deployment modes. The WASM web build relies exclusively on Truck.
]

== Sketch Operations System

The cad-kernel includes a comprehensive *sketch operations system* inspired by Blender's CAD_Sketcher addon, implementing all 14 Blender/CAD patterns:

=== Sketch Entities

Seven entity types are supported in 2D sketches:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Entity*], [*Description*], [*Constraint Support*]),
  [Point], [2D point in sketch plane], [Coincident, Fixed, PointOnLine, PointOnCircle],
  [Line], [Infinite or bounded line segment], [Horizontal, Vertical, Parallel, Perpendicular, Tangent],
  [Circle], [Circle defined by center + radius], [Concentric, EqualRadius, Tangent],
  [Arc], [Circular arc (center, start angle, end angle)], [Tangent, Concentric, EqualRadius],
  [Ellipse], [Ellipse with major/minor axes], [Concentric],
  [Spline], [Cubic Bézier spline with control points], [Tangent, PointOnLine],
  [Construction], [Reference geometry (not extruded)], [All constraint types],
)

=== Sketch Tools (StatefulTool Pattern)

The tool system uses a *Blender-inspired StatefulTool* lifecycle with `ToolStateMachine`:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Tool*], [*States*], [*Description*]),
  [`LineTool`], [Idle → First Point → Drawing], [Draw line segments with snap-to-grid/entity],
  [`CircleTool`], [Idle → Center → Radius], [Draw circles by center + radius point],
  [`ArcTool`], [Idle → Center → Start → End], [Draw arcs by center + start/end angles],
  [`RectangleTool`], [Idle → Corner1 → Corner2], [Draw axis-aligned rectangles (4 lines + constraints)],
  [`SplineTool`], [Idle → Points → Complete], [Draw cubic Bézier splines with control handles],
  [`PointTool`], [Idle → Placing], [Place construction/reference points],
  [`TrimTool`], [Idle → Selecting], [Trim entities at intersection points],
)

=== Snap Engine

The snap engine (`snap.rs`, 569 lines) supports 7 snap types for precision drawing:

- *Grid* — snap to configurable grid spacing
- *Endpoint* — snap to entity endpoints
- *Midpoint* — snap to entity midpoints
- *Center* — snap to circle/arc centers
- *Intersection* — snap to entity intersection points
- *Perpendicular* — snap perpendicular to entities
- *Tangent* — snap tangent to curves

The `PickingColorMap` provides GPU-accelerated entity picking by assigning unique colors to sketch entities.

=== Advanced Operations (sketch_ops.rs)

The `sketch_ops.rs` module (1,238 lines, 13 tests) implements advanced sketch operations:

- *Trim* — trim entities at intersections (line-line, line-circle, circle-circle)
- *Bevel* — create chamfer/fillet at entity intersections
- *Offset* — parallel offset of sketch profiles
- *Entity Walker* — traverse connected entity chains for profile detection
- *Bézier Utilities* — cubic Bézier evaluation, splitting, arc length
- *Intersection Engine* — compute entity-entity intersection points
- *Mesh Conversion* — convert sketch profiles to triangle meshes for preview

=== Snapshot System

The `snapshot.rs` module provides sketch state management:

- *SketchSnapshot* — serializable snapshot of complete sketch state
- *ToolSnapshotManager* — manages tool state across undo/redo boundaries
- *ClipboardBuffer* — copy/paste sketch entities with constraint preservation
