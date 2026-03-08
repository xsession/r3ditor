# r3ditor — Kernel-Grade Parametric CAD/CAM Design Document

> **Principal Architect Blueprint: Constraint Solving → B-Rep → Features → CAM**
>
> Companion to `CAD-CAM-EDITOR-ARCHITECTURE.md` — this document specifies the
> **internal mathematics, data structures, algorithms, UX state machines, failure
> modes, and performance contracts** required to make r3ditor feel like Fusion 360 /
> Onshape: fast, predictable, low-latency, stable rebuilds, robust import/export.
>
> **Hard targets**: 500 MB+ STEP, 500 MB+ STL, 60 fps sketch dragging, < 100 ms
> boolean on 50 K-tri solids, < 5 ms constraint solve for 200 equations.
>
> Generated: June 2025 · r3ditor v0.2.0 · Rust 1.93 · Edition 2021

---

## Table of Contents

1. [Coordinate Systems & Transform Stack](#1-coordinate-systems--transform-stack)
2. [Geometric Primitives (Kernel-Level)](#2-geometric-primitives-kernel-level)
3. [Tolerance, Robustness, and Topology Consistency](#3-tolerance-robustness-and-topology-consistency)
4. [Sketch System: Entities, Constraints, Dimensions](#4-sketch-system-entities-constraints-dimensions)
5. [Feature System & Parametric History](#5-feature-system--parametric-history)
6. [Solid Modeling Kernel (B-Rep) + Boolean Robustness](#6-solid-modeling-kernel-b-rep--boolean-robustness)
7. [Tessellation, Display Pipeline, and Performance](#7-tessellation-display-pipeline-and-performance)
8. [STEP Import/Export Architecture](#8-step-importexport-architecture)
9. [CAM Subsystem (2.5D + 3-axis)](#9-cam-subsystem-25d--3-axis)
10. [UX Rules: "Onshape/Fusion Feel"](#10-ux-rules-onshapefusion-feel)
11. [Test Strategy & Determinism](#11-test-strategy--determinism)
12. [Implementation Plan and Module Breakdown](#12-implementation-plan-and-module-breakdown)
13. [Deliverables: Glossary, Equations, Pseudocode, State Machines](#13-deliverables)
14. [Sketch Operations & Tool System (New Modules)](#14-sketch-operations--tool-system-new-modules)

---

# 1) Coordinate Systems & Transform Stack

## 1.1 Frames

### (A) Theory

r3ditor uses five hierarchical coordinate frames. Every geometric query (picking,
snapping, constraint evaluation) must be expressed in the correct frame; mixing
frames is the #1 source of "mystery offset" bugs.

| Frame | Origin | Up | Usage |
|-------|--------|----|-------|
| **World** | Arbitrary (0,0,0) at scene center | +Y | Final rendering, lighting, physics |
| **Part-local** | Part origin (user-settable) | Inherited | B-Rep geometry lives here |
| **Sketch-plane** | Plane origin | Plane normal is +Z_local | 2D constraint solver operates here |
| **Feature** | Input reference (e.g., face centroid) | Face normal | Extrude direction, fillet tangent |
| **Assembly-instance** | Assembly component insertion point | Inherited | Overrides part-local when instanced |

### (B) Data Structures

```rust
/// All transforms stored as SRT (Scale-Rotation-Translation).
/// Matrix form: M = T × R × S  (applied right-to-left to a column vector).
/// We store decomposed form for animation/interpolation and
/// recompose to Mat4 only for GPU upload and intersection tests.
pub struct Frame {
    /// Position in parent frame (meters internally, displayed as mm)
    pub translation: DVec3,        // f64 for kernel precision
    /// Orientation as unit quaternion — never Euler (gimbal lock)
    pub rotation: DQuat,           // f64 quaternion
    /// Non-uniform scale (default [1,1,1])
    pub scale: DVec3,
    /// Cached 4×4 matrix, recomputed on any field change
    cached_matrix: DMat4,
    /// Inverse cache
    cached_inverse: DMat4,
    /// Generation counter — incremented on every mutation
    generation: u64,
}
```

**Convention rules:**

| Rule | Choice | Rationale |
|------|--------|-----------|
| Handedness | **Right-handed** | Matches OpenGL, glTF, Truck, OpenCascade |
| Up axis | **+Y** | Three.js/R3F convention; STEP files re-orient on import |
| Internal unit | **millimeters (f64)** | CAD standard; GPU receives f32 after world→clip |
| Quaternion layout | `[x, y, z, w]` (glam convention) | Matches `glam::DQuat` |
| Composition order | Parent × Child (left-multiply) | World = Assembly × Part × Feature |

**Normalization policy:**

- Quaternions re-normalized after every 16 incremental rotations (tracked via counter).
- Scale components clamped to `[1e-9, 1e9]` — zero scale is forbidden.
- Translation components clamped to `[-1e12, 1e12]` mm.
- `cached_matrix` and `cached_inverse` are lazily recomputed when `generation`
  changes. The inverse uses the analytic SRT inverse (no generic `Mat4::inverse()`
  which is O(n³) and loses precision).

```rust
impl Frame {
    /// Analytic inverse of SRT transform:
    /// M⁻¹ = S⁻¹ × R⁻¹ × T⁻¹ = S⁻¹ × Rᵀ × (-Rᵀ × S⁻¹ × t)
    pub fn inverse(&self) -> DMat4 {
        let s_inv = DVec3::new(1.0/self.scale.x, 1.0/self.scale.y, 1.0/self.scale.z);
        let r_inv = self.rotation.conjugate();
        let t_inv = -(r_inv * (self.translation * s_inv));
        DMat4::from_scale_rotation_translation(s_inv, r_inv, t_inv)
    }
}
```

### (C) Algorithms — Transform Composition

```
world_from_vertex(assembly_inst, part, feature, local_pos):
    let M_assembly = assembly_inst.to_matrix()
    let M_part     = part.to_matrix()
    let M_feature  = feature.to_matrix()
    return M_assembly × M_part × M_feature × [local_pos, 1]
```

For sketch-plane projection, we need the *inverse* path:

```
sketch_from_world(sketch_plane, world_pos):
    let M_inv = sketch_plane.world_to_local()
    let local = M_inv × [world_pos, 1]
    return (local.x, local.y)  // z ≈ 0 if on-plane
```

### (D) UX Behavior

- Gizmo handles always display in **screen-aligned size** (constant pixel size
  regardless of zoom). Scale factor: `gizmo_size_px / (distance_to_camera × tan(fov/2))`.
- Dimension labels rendered in sketch-plane frame, then projected to screen.
- Grid snapping happens in sketch-plane 2D coordinates, *before* projecting back to 3D.

### (E) Failure Modes + Mitigations

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Float drift after 10K rotations | Accumulated quaternion denormalization | Renormalize every 16 ops; detect `|q| - 1.0| > 1e-6` |
| Singular transform | Zero scale axis | Clamp scale to `[1e-9, ∞)`; reject zero in UI |
| Frame parent cycle | Assembly references self | DAG check on every parent assignment |
| Near-zero determinant | Nearly-singular SRT composition | Warn user; fallback to previous valid transform |

### (F) Complexity/Perf Notes

- `Frame::to_matrix()`: O(1), ~20 ns (SIMD quaternion → matrix conversion).
- `Frame::inverse()`: O(1) analytic, ~15 ns; never call `DMat4::inverse()`.
- Composition chain (5 levels): ~100 ns per vertex.

---

## 1.2 Picking & Projection

### (A) Theory

Picking maps a 2D screen pixel `(px, py)` to a 3D ray, then finds the nearest
intersection with geometry.

### (B) Data Structures

```rust
pub struct Ray {
    pub origin: DVec3,
    pub direction: DVec3,  // unit length
}

pub struct PickResult {
    pub entity_id: Uuid,
    pub hit_point: DVec3,         // world space
    pub hit_normal: DVec3,        // world space, outward-facing
    pub face_id: Option<u64>,
    pub edge_id: Option<u64>,
    pub vertex_id: Option<u64>,
    pub distance: f64,            // from ray origin
    pub pick_type: PickType,
}

pub enum PickType { Face, Edge, Vertex, Nothing }
```

### (C) Algorithms

```
pick(screen_x, screen_y, camera, viewport_size):
    // 1. NDC coordinates
    ndc_x = (2 * screen_x / width) - 1
    ndc_y = 1 - (2 * screen_y / height)

    // 2. Unproject near/far
    inv_vp = inverse(projection × view)
    near = inv_vp × [ndc_x, ndc_y, 0, 1]  // clip z = 0
    far  = inv_vp × [ndc_x, ndc_y, 1, 1]  // clip z = 1

    // 3. Construct ray
    ray.origin    = near.xyz / near.w
    ray.direction = normalize(far.xyz/far.w - ray.origin)

    // 4. BVH traversal (top-level: entities, bottom-level: triangles)
    hits = bvh.intersect_sorted(ray)
    return hits[0]  // nearest
```

**Sketch-plane projection:**

```
project_to_sketch(ray, sketch_plane):
    // Ray-plane intersection: t = dot(plane.origin - ray.origin, plane.normal) / dot(ray.direction, plane.normal)
    denom = dot(ray.direction, sketch_plane.normal)
    if |denom| < 1e-12: return None  // ray parallel to plane
    t = dot(sketch_plane.origin - ray.origin, sketch_plane.normal) / denom
    if t < 0: return None  // behind camera
    world_hit = ray.origin + t * ray.direction
    return sketch_plane.world_to_local(world_hit).xy()
```

**Snap priority (highest to lowest):**

1. Vertex snap (within 8 screen pixels)
2. Edge midpoint snap (within 8 px)
3. Edge-on-curve snap (within 6 px)
4. Grid intersection snap (within 4 px)
5. Grid line snap (within 3 px)
6. Free position (no snap)

Screen-space tolerance: `tol_world = tol_px × (2 × distance × tan(fov/2)) / viewport_height`

Override: **Alt** key disables all snapping.

---

# 2) Geometric Primitives (Kernel-Level)

All kernel primitives use `f64` for computation. GPU-bound data is converted to
`f32` only at the tessellation/upload boundary.

## 2.1 2D Primitives (Sketch)

### Point2 / Vector2

```rust
#[derive(Debug, Clone, Copy)]
pub struct Point2 { pub x: f64, pub y: f64 }

#[derive(Debug, Clone, Copy)]
pub struct Vector2 { pub x: f64, pub y: f64 }
```

- DOF: 2 per point
- Evaluation: identity
- Bounding box: point itself
- Distance to point: Euclidean `√((x₁-x₂)² + (y₁-y₂)²)`

### Line2 (infinite line)

```rust
pub struct Line2 {
    pub origin: Point2,
    pub direction: Vector2,  // unit length
}
```

Representation: parametric `P(t) = origin + t × direction`, t ∈ (-∞, +∞).

Closest point to Q: `t* = dot(Q - origin, direction)`, `P(t*) = origin + t* × direction`.

Distance point-to-line: `|cross(Q - origin, direction)| / |direction|`.

### Segment2

```rust
pub struct Segment2 {
    pub start: Point2,
    pub end: Point2,
}
```

- DOF: 4 (start.x, start.y, end.x, end.y)
- Length: `|end - start|`
- Midpoint: `(start + end) / 2`
- Direction: `normalize(end - start)`
- Bounding box: `min/max` of endpoints
- Closest point: clamp `t* = dot(Q-start, dir) / dot(dir, dir)` to `[0, 1]`

### Circle2

```rust
pub struct Circle2 {
    pub center: Point2,
    pub radius: f64,
}
```

- DOF: 3 (cx, cy, r)
- Parametric: `P(θ) = center + r × [cos θ, sin θ]`, θ ∈ [0, 2π)
- Derivative: `P'(θ) = r × [-sin θ, cos θ]` (tangent, magnitude = r)
- Curvature: κ = 1/r (constant)
- Bounding box: `[cx-r, cy-r] → [cx+r, cy+r]`
- Distance to Q: `||Q - center|| - r` (signed; positive = outside)

### Arc2

```rust
pub struct Arc2 {
    pub center: Point2,
    pub radius: f64,
    pub start_angle: f64,  // radians, CCW from +X
    pub end_angle: f64,
}
```

- DOF: 5 (cx, cy, r, θ₁, θ₂)
- Parametric: same as Circle2 but θ ∈ [start_angle, end_angle]
- Start point: `center + r × [cos θ₁, sin θ₁]`
- End point: `center + r × [cos θ₂, sin θ₂]`
- Sweep: `Δθ = end_angle - start_angle` (may exceed 2π for >360° arcs)

### Ellipse2

```rust
pub struct Ellipse2 {
    pub center: Point2,
    pub semi_major: f64,    // a
    pub semi_minor: f64,    // b
    pub rotation: f64,      // angle of major axis from +X (radians)
}
```

- DOF: 5 (cx, cy, a, b, φ)
- Parametric: `P(t) = center + R(φ) × [a cos t, b sin t]`
- Curvature: `κ(t) = ab / (a² sin²t + b² cos²t)^(3/2)`

### Polyline2

```rust
pub struct Polyline2 {
    pub points: Vec<Point2>,
    pub closed: bool,
}
```

### NURBS2

```rust
pub struct Nurbs2 {
    pub degree: u32,
    pub control_points: Vec<Point2>,
    pub weights: Vec<f64>,        // rational weights (1.0 = non-rational)
    pub knots: Vec<f64>,          // knot vector, length = n + degree + 1
}
```

- Evaluation: De Boor's algorithm with rational weights.
- Derivative: Computed via difference of control points (first derivative) or
  second-order De Boor.
- Bounding box: Convex hull of control points (tight), or evaluate at regular
  parameter samples (tighter).
- Closest point: Newton iteration on `dot(P(t) - Q, P'(t)) = 0`, with Bézier
  subdivision for global bracketing.

## 2.2 3D Primitives

### Analytic Surfaces

| Surface | Parameters | Evaluation `S(u,v)` | Normal `n(u,v)` |
|---------|-----------|---------------------|------------------|
| **Plane** | origin, u_axis, v_axis | `origin + u × u_axis + v × v_axis` | `cross(u_axis, v_axis)` |
| **Cylinder** | axis_origin, axis_dir, radius | `axis_origin + v × axis_dir + r × [cos u, sin u]⊥` | `[cos u, sin u]⊥` |
| **Cone** | apex, axis_dir, half_angle α | `apex + v × [cos α × axis_dir + sin α × radial(u)]` | Computed from cross product of partials |
| **Sphere** | center, radius | `center + r × [cos v cos u, cos v sin u, sin v]` | `normalize(S - center)` |
| **Torus** | center, axis, R (major), r (minor) | `center + (R + r cos v) × radial(u) + r sin v × axis` | `(S - center - R × radial(u)) / r` |

### NURBS Surface

```rust
pub struct NurbsSurface {
    pub degree_u: u32,
    pub degree_v: u32,
    pub control_points: Vec<Vec<DVec3>>,  // [n_u][n_v]
    pub weights: Vec<Vec<f64>>,
    pub knots_u: Vec<f64>,
    pub knots_v: Vec<f64>,
}
```

- Evaluation: Tensor-product De Boor (evaluate in u first, then v — or vice versa).
- Partial derivatives: `∂S/∂u` and `∂S/∂v` via derivative control points.
- Normal: `n = normalize(∂S/∂u × ∂S/∂v)`.
- Curvature: First and second fundamental forms → principal curvatures κ₁, κ₂.
- Bounding box: Convex hull of control points.
- Distance to point: Newton iteration on system `[dot(S-Q, ∂S/∂u), dot(S-Q, ∂S/∂v)] = [0, 0]`.

---

# 3) Tolerance, Robustness, and Topology Consistency

## 3.1 Tolerances

### (A) Theory

A CAD kernel must maintain two *separate* tolerance regimes:

1. **Modeling tolerance** (kernel-internal): determines when two geometric entities
   are considered coincident for topological operations. This is absolute (in mm).
2. **Snap tolerance** (UI/interaction): determines when the cursor is "close enough"
   to an entity for selection. This is in screen pixels, converted to world units.

Conflating these causes either: (a) geometry that should merge doesn't (snap too
tight) or (b) geometry that shouldn't merge does (kernel tolerance too loose).

### (B) Data Structures

```rust
pub struct ToleranceConfig {
    // ── Kernel tolerances (absolute, mm) ──
    /// Vertex merge distance — vertices closer than this are identical
    pub vertex_merge: f64,           // default: 1e-6 mm (1 nanometer)
    /// Edge coincidence — edges whose endpoints are within this AND
    /// whose midpoints are within this are topologically identical
    pub edge_coincidence: f64,       // default: 1e-5 mm
    /// Surface trim tolerance — max gap between 3D edge and UV trim curve
    pub trim_tolerance: f64,         // default: 1e-4 mm
    /// Angular tolerance for tangent/parallel/perpendicular tests
    pub angular_tolerance: f64,      // default: 1e-8 radians

    // ── Relative tolerances ──
    /// Relative tolerance for length comparisons: |a-b|/max(|a|,|b|) < rel_tol
    pub relative: f64,               // default: 1e-10

    // ── UI tolerances (pixels, converted at query time) ──
    /// Selection/snap pixel radius
    pub snap_pixels: f64,            // default: 8.0 px
}
```

### (C) Algorithms — Fuzzy Comparison

```rust
/// Compare two f64 values with combined absolute + relative tolerance.
/// Returns true if they are "equal" within tolerance.
pub fn fuzzy_eq(a: f64, b: f64, abs_tol: f64, rel_tol: f64) -> bool {
    let diff = (a - b).abs();
    if diff <= abs_tol { return true; }
    let max_ab = a.abs().max(b.abs());
    diff <= rel_tol * max_ab
}

/// Compare two points (component-wise max norm).
pub fn points_coincident(a: DVec3, b: DVec3, tol: f64) -> bool {
    (a.x - b.x).abs() <= tol
    && (a.y - b.y).abs() <= tol
    && (a.z - b.z).abs() <= tol
}
```

### (D) UX Behavior

- Yellow highlight appears when cursor is within `snap_pixels` of an entity.
- Constraint inference (horizontal/vertical) uses `angular_tolerance` = 5° in
  sketch-space; user must explicitly constrain tighter angles.

### (E) Failure Modes + Mitigations

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Ghost edges (zero-length) | Two vertices merged but edge still exists | Post-operation edge length check; remove edges < `vertex_merge` |
| Topology mismatch after boolean | Near-coincident faces classified inconsistently | Re-classify with 10× wider tolerance; report ambiguity |
| Import gap (STEP sewing) | Trim tolerance too tight for imported data | Auto-detect import tolerance from file metadata; fall back to 1e-3 |
| Constraint jitter | Solver tolerance close to snap tolerance | Ensure solver tolerance (1e-10) is orders of magnitude tighter than snap (1e-2 mm) |

## 3.2 Robust Predicates

### (A) Theory

Standard floating-point `cross(A-C, B-C)` fails for nearly-collinear points. We
need robust orientation tests.

### (B) Algorithms

**2D Orientation (Shewchuk's `orient2d`):**

```
orient2d(A, B, C):
    // Returns > 0 if CCW, < 0 if CW, 0 if collinear
    det = (A.x - C.x) * (B.y - C.y) - (A.y - C.y) * (B.x - C.x)
    if |det| > error_bound:
        return sign(det)
    else:
        return orient2d_exact(A, B, C)  // adaptive precision cascade
```

We use a four-stage adaptive precision cascade:
1. Standard f64 (fast path — covers 99.9% of cases)
2. Two-sum error estimation (Dekker)
3. Expansion arithmetic (if needed)
4. Exact rational (fallback — never reached in practice)

**3D Orientation (`orient3d`):** same principle for tetrahedron sign.

**Segment intersection robustness:**

```
intersect_segments(p1, p2, p3, p4):
    d1 = orient2d(p3, p4, p1)
    d2 = orient2d(p3, p4, p2)
    d3 = orient2d(p1, p2, p3)
    d4 = orient2d(p1, p2, p4)

    if d1 * d2 < 0 AND d3 * d4 < 0:
        // Proper intersection — compute parameter
        t = d1 / (d1 - d2)
        return Some(lerp(p1, p2, t))
    elif d1 == 0: return Some(p1)  // endpoint touches
    elif d2 == 0: return Some(p2)
    // ... handle all degenerate cases
    else: return None
```

## 3.3 Healing & Validation

### (A) Theory

Imported geometry (especially STEP) is often "dirty": gaps between edges, reversed
normals, self-intersecting faces, non-manifold edges.

### (B) Algorithms

**Manifold check:**

```
is_manifold(shell):
    for each edge in shell:
        face_count = count faces referencing this edge
        if face_count != 2: return false  // non-manifold
    for each vertex in shell:
        if not is_fan_connected(vertex): return false
    return true
```

**Face normal consistency:**

```
orient_shell(shell):
    // BFS from a seed face, propagating orientation across shared edges
    visited = {}
    queue = [shell.faces[0]]
    while queue not empty:
        face = queue.pop()
        for each edge in face.outer_wire:
            neighbor = get_other_face(edge, face)
            if neighbor not in visited:
                if edge_orientation_mismatched(face, neighbor, edge):
                    flip_face_normal(neighbor)
                visited.insert(neighbor)
                queue.push(neighbor)
```

**Auto-heal pipeline (for imported STEP):**

```
heal(shell, tolerance):
    1. Merge coincident vertices (within tolerance)
    2. Sew open edges — find matching free edges and stitch
    3. Remove degenerate faces (area < tol²)
    4. Remove degenerate edges (length < tol)
    5. Orient shell normals (BFS consistency)
    6. Close small gaps by extending edge curves
    7. Re-trim UV curves to match 3D edges
    8. Validate manifoldness
    9. Report remaining issues as warnings
```

**Self-intersection detection:**

- Build BVH over face bounding boxes.
- For each non-adjacent face pair with overlapping boxes, compute face-face
  intersection curves.
- If intersection curve is non-empty AND is not along a shared edge → self-intersection.

### (E) Failure Modes

| Failure | Mitigation |
|---------|------------|
| Sewing loops forever (oscillating between merge/split) | Limit to 3 passes; report remaining gaps |
| Auto-orient picks wrong seed → inside-out model | Compute volume sign; if negative, flip all |
| Gap too large for tolerance | Report to user with visual highlighting |

---

# 4) Sketch System: Entities, Constraints, Dimensions

## 4.1 Sketch Entities (Detailed Spec)

### Entity Table

| Entity | Parameters | DOF | Constraint Attachment Points | Editable Handles |
|--------|-----------|-----|------------------------------|-----------------|
| **Point** | x, y | 2 | self | Drag point |
| **Line Segment** | start(x,y), end(x,y) | 4 | start, end, midpoint | Drag start, end, or whole line |
| **Construction Line** (infinite) | origin(x,y), direction(θ) | 3 | origin, any point on line | Drag origin, rotate direction |
| **Rectangle** | origin(x,y), width, height, angle | 5 | 4 corners, 4 midpoints, center | Drag corners, edges, center |
| **Circle** | center(x,y), radius | 3 | center, quadrant points (N/S/E/W) | Drag center, drag rim to resize |
| **Arc (center+angles)** | center(x,y), radius, θ₁, θ₂ | 5 | center, start, end, midpoint | Drag endpoints, drag mid-arc for radius |
| **Arc (3-point)** | p1, p2, p3 | 6 → solved to center-angle | start, end, through-point | Drag any point |
| **Ellipse** | center, semi_a, semi_b, rotation | 5 | center, major endpoints, minor endpoints | Drag axes endpoints |
| **Spline (control-point)** | control_points[], degree | 2n | endpoints, control points | Drag any control point |
| **Spline (fit-point)** | fit_points[] | 2n | fit points | Drag any fit point; solver re-interpolates |
| **Offset Curve** | source_ref, distance, side | 1 (distance) | Inherits source's points | Drag offset distance |
| **Mirror Instance** | source_refs[], axis_ref | 0 (derived) | Mirrored copies of source | Non-editable; edit source instead |

### Rectangle as Constraint Macro

A rectangle is syntactic sugar for 4 line segments + 8 constraints:

```
create_rectangle(origin, width, height, angle):
    p0 = origin
    p1 = p0 + rotate([width, 0], angle)
    p2 = p1 + rotate([0, height], angle)
    p3 = p0 + rotate([0, height], angle)

    // 4 lines
    L0 = add_segment(p0, p1)
    L1 = add_segment(p1, p2)
    L2 = add_segment(p2, p3)
    L3 = add_segment(p3, p0)

    // 4 coincident (corners connected)
    add_constraint(Coincident(L0.end, L1.start))
    add_constraint(Coincident(L1.end, L2.start))
    add_constraint(Coincident(L2.end, L3.start))
    add_constraint(Coincident(L3.end, L0.start))

    // 2 parallel pairs
    add_constraint(Parallel(L0, L2))
    add_constraint(Parallel(L1, L3))

    // 2 perpendicular (makes it rectangular)
    add_constraint(Perpendicular(L0, L1))
    add_constraint(Perpendicular(L2, L3))
```

### Trim/Extend Operations

**Trim:** Splits a curve at intersection points and deletes the portion between
the cursor and the nearest bounding intersections.

```
trim(curve, click_point, all_curves):
    intersections = find_all_intersections(curve, all_curves)
    sort intersections by parameter along curve
    t_click = curve.closest_parameter(click_point)
    t_before = max(t for t in intersections if t < t_click) or curve.t_start
    t_after  = min(t for t in intersections if t > t_click) or curve.t_end

    // Delete the segment [t_before, t_after] and keep the rest
    if t_before > curve.t_start:
        keep left portion [curve.t_start, t_before]
    if t_after < curve.t_end:
        keep right portion [t_after, curve.t_end]
    delete original curve
```

**Extend:** Extends a curve endpoint to the nearest intersection with another curve.

## 4.2 Constraint Types

### Geometric Constraints — Mathematical Formulation

Each constraint contributes one or more scalar equations `f(x) = 0` where `x` is
the vector of free variables (point coordinates).

| Constraint | # Equations | Residual `f(x)` | Jacobian `∂f/∂xᵢ` |
|-----------|-------------|------------------|--------------------|
| **Coincident(P₁, P₂)** | 2 | `[x₁-x₂, y₁-y₂]` | `[±1, 0, ∓1, 0; 0, ±1, 0, ∓1]` |
| **Horizontal(P₁→P₂)** | 1 | `y₁ - y₂` | `[0, 1, 0, -1]` |
| **Vertical(P₁→P₂)** | 1 | `x₁ - x₂` | `[1, 0, -1, 0]` |
| **Parallel(L₁, L₂)** | 1 | `(x₂-x₁)(y₄-y₃) - (y₂-y₁)(x₄-x₃)` | Cross-product partials |
| **Perpendicular(L₁, L₂)** | 1 | `(x₂-x₁)(x₄-x₃) + (y₂-y₁)(y₄-y₃)` | Dot-product partials |
| **Tangent(Line, Circle)** | 1 | `dist(center, line) - radius` | Chain rule through distance |
| **Tangent(Circle₁, Circle₂)** | 1 | `‖c₁-c₂‖ - (r₁+r₂)` (external) or `‖c₁-c₂‖ - |r₁-r₂|` (internal) | Position partials |
| **Collinear(P, L)** | 1 | `cross(P-L.start, L.direction)` | Cross-product partials |
| **Symmetry(P₁, P₂, Axis)** | 2 | `[midpoint(P₁,P₂) projected onto axis ≠ midpoint, P₁P₂ not ⊥ axis]` | Midpoint + orthogonality partials |
| **Midpoint(P, L)** | 2 | `[Px - (Lx₁+Lx₂)/2, Py - (Ly₁+Ly₂)/2]` | `[1,0,-½,0,-½,0; 0,1,0,-½,0,-½]` |
| **Equal Length(L₁, L₂)** | 1 | `‖L₁‖² - ‖L₂‖²` | Length-squared partials |
| **Equal Radius(C₁, C₂)** | 1 | `r₁ - r₂` | `[∂/∂r₁ = 1, ∂/∂r₂ = -1]` |
| **Fix(P, x₀, y₀)** | 2 | `[Px-x₀, Py-y₀]` | `[1,0; 0,1]` |
| **Distance(P₁, P₂, d)** | 1 | `(x₁-x₂)² + (y₁-y₂)² - d²` | `[2Δx, 2Δy, -2Δx, -2Δy]` |
| **Angle(L₁, L₂, α)** | 1 | `sin(α)⋅dot(d₁,d₂) - cos(α)⋅cross(d₁,d₂)` | Trigonometric partials |
| **Radius(C, r)** | 1 | `C.radius - r` | `[∂/∂r = 1]` |
| **Point on Circle(P, C)** | 1 | `(Px-Cx)² + (Py-Cy)² - r²` | `[2(Px-Cx), 2(Py-Cy), -2(Px-Cx), -2(Py-Cy), -2r]` |
| **Concentric(C₁, C₂)** | 2 | `[c₁x-c₂x, c₁y-c₂y]` | Same as Coincident on centers |

### Driving vs. Driven Dimensions

- **Driving** dimension: reduces DOF by 1; contributes an equation to the solver.
- **Driven** dimension: does NOT reduce DOF; displays the measured value read-only.
  The system auto-detects: if adding the dimension's equation would make the system
  over-constrained (rank increase = 0), it becomes driven.

### Ambiguity Resolution Rules

| Ambiguity | Resolution |
|-----------|------------|
| Tangent: internal vs external | Choose based on current geometry (closest to initial position) |
| Distance: which side | Maintain current side unless user drags through zero |
| Angle: 30° vs 150° vs -30° | Use unwrapped angle closest to current configuration |
| Equal length: which direction to adjust | Move the element with more remaining DOF |

## 4.3 Constraint Solver Architecture

### 4.3.1 DOF Accounting

```
Total DOF = Σ(entity DOF) - Σ(constraint equations) - 2×(fixed points)

Under-constrained: DOF > 0 → Show blue highlight, display DOF count
Fully constrained: DOF = 0 → Show green highlight
Over-constrained: DOF < 0 → Show red highlight, identify conflicting constraint set
```

### 4.3.2 Constraint Graph

**Structure:** Bipartite graph `G = (E ∪ C, edges)` where:
- `E` = set of entity nodes (each with its DOF)
- `C` = set of constraint nodes (each with its equation count)
- An edge `(e, c)` exists if constraint `c` references entity `e`

**Decomposition into clusters:**

```
decompose_to_clusters(graph):
    // Tarjan's algorithm to find connected components
    components = connected_components(graph)

    // For each component, check if it's rigid
    for comp in components:
        dof = sum(e.dof for e in comp.entities) - sum(c.equations for c in comp.constraints)
        comp.status = match dof:
            0    => FullyConstrained
            > 0  => UnderConstrained(dof)
            < 0  => OverConstrained(-dof)

    return components
```

**Incremental solving:** When a single entity is modified (drag), only its connected
component needs re-solving. Typical sketch has 2-5 clusters, so this saves 60-80%
of solve time during interactive editing.

### 4.3.3 Solving Approach — Hybrid Analytic/Numeric

**Phase 1: Analytic Reductions (fast, exact)**

```
analytic_reduce(entities, constraints):
    // Pass 1: Merge coincident points
    for each Coincident(p1, p2):
        merge p1 and p2 into a single variable

    // Pass 2: Fix horizontal/vertical to single coordinate
    for each Horizontal(p1, p2):
        link p1.y = p2.y (eliminate one variable)
    for each Vertical(p1, p2):
        link p1.x = p2.x

    // Pass 3: Identify rigid groups
    // (set of entities connected by distance + angle constraints
    //  with DOF = 0 internally → treat as a single rigid body with 3 DOF)
    rigid_groups = find_rigid_subgraphs(entities, constraints)
    for group in rigid_groups:
        replace with RigidGroup(center_x, center_y, angle)

    return reduced_system
```

**Phase 2: Numerical Solve (Levenberg-Marquardt)**

```
solve_LM(x₀, constraints, config):
    x = x₀
    λ = config.initial_damping          // 1e-3
    ν = 2.0

    for iter in 0..config.max_iterations:
        f = evaluate_residuals(x)
        if ‖f‖ < config.tolerance:
            return Converged(x, iter)

        J = compute_jacobian(x)         // Analytic Jacobian (not finite diff!)
        // Levenberg-Marquardt normal equations:
        // (JᵀJ + λ⋅diag(JᵀJ)) × Δx = -Jᵀf
        JtJ = Jᵀ × J
        Jtf = Jᵀ × f
        D = diag(JtJ).max(1e-12)       // Prevent zero diagonal
        A = JtJ + λ × diag(D)
        Δx = solve(A, -Jtf)            // Sparse LU or Cholesky

        // Trust region check
        x_new = x + Δx
        f_new = evaluate_residuals(x_new)
        gain_ratio = (‖f‖² - ‖f_new‖²) / (Δx ⋅ (λ × D × Δx - Jtf))

        if gain_ratio > 0:              // Improvement
            x = x_new
            λ = λ × max(1/3, 1 - (2⋅gain_ratio - 1)³)
            ν = 2.0
        else:                           // Reject step
            λ = λ × ν
            ν = ν × 2

    return DidNotConverge(x, config.max_iterations)
```

**Why Levenberg-Marquardt over plain Newton-Raphson:** LM handles rank-deficient
Jacobians (under-constrained sketches) gracefully by damping, whereas Newton-Raphson
produces singular `JᵀJ` and fails. The trust-region logic prevents divergence when
far from the solution (e.g., after a large drag).

**Why analytic Jacobian over finite differences:** Our current `solver2d.rs` uses
finite-difference Jacobians (`eps = 1e-8`). This is:
- 2× slower (N+1 residual evaluations vs. 1)
- Less accurate near the solution
- Upgrade path: provide exact Jacobian for each constraint type (the ∂f/∂x columns
  from the table above). The analytic Jacobian is straightforward since all our
  constraints are polynomial or trigonometric.

### 4.3.4 Dragging Behavior

```
on_drag_start(entity, handle):
    // Create a temporary "drag constraint" that pulls the handle to the cursor
    drag_constraint = Distance(handle, cursor_pos, 0.0)
    // Mark handle as the "anchor" — the solver must move it to the cursor
    solver.set_priority(drag_constraint, HIGH)
    // Choose stable reference: the entity farthest from the drag
    anchor_entity = find_farthest_fixed_entity(entity)
    if anchor_entity is None:
        // No fixed entities — fix the centroid of the sketch
        solver.add_temporary_fix(sketch.centroid)

on_drag_move(cursor_pos):
    drag_constraint.target = cursor_pos
    // Solve with reduced iteration count (max 20) for 60 fps
    result = solver.solve_incremental(max_iters=20, tolerance=1e-6)
    if !result.converged:
        // Graceful degradation: use last good positions
        // (don't jitter; show yellow "solver struggling" indicator)
        show_warning_indicator()

on_drag_end():
    // Final solve with full iteration budget
    result = solver.solve(max_iters=100, tolerance=1e-10)
    remove drag_constraint
    remove any temporary fixes
    update_display()
```

**Performance target:** `solve_incremental` for a 200-equation system completes in
< 2 ms, enabling 60 fps interactive dragging on a single CPU core.

### 4.3.5 Diagnostics & UX Feedback

| State | Visual | Action |
|-------|--------|--------|
| Under-constrained | Blue entities, DOF count badge | Suggest: "Add horizontal constraint?" |
| Fully constrained | Green entities | No action needed |
| Over-constrained | Red entities + red constraint glyphs | Highlight conflicting set; offer "Delete constraint X?" |
| Solver diverged | Yellow warning bar | "Constraint conflict detected. Undo last change?" |
| Redundant constraint | Orange glyph on redundant constraint | "This constraint is redundant and can be removed." |

**Conflict identification:**

```
find_conflicting_constraints(over_constrained_cluster):
    // Remove constraints one at a time; if removing C makes the system solvable,
    // C is part of the conflict set.
    conflicts = []
    for c in cluster.constraints:
        reduced = cluster.without(c)
        if solve(reduced).converged:
            conflicts.push(c)
    return conflicts
```

---

# 5) Feature System & Parametric History

## 5.1 Feature Graph

### (A) Theory

The feature graph is a **DAG** (directed acyclic graph) where each node represents
a modeling operation and edges represent data dependencies (inputs → outputs).
Rebuilding the model means topologically sorting the DAG and executing each feature
in order.

### (B) Data Structures

```rust
pub struct FeatureGraph {
    /// Ordered list of features (topological order)
    pub features: Vec<FeatureNode>,
    /// Dependency edges: feature_id → Vec<feature_id> (inputs)
    pub dependencies: HashMap<Uuid, Vec<Uuid>>,
    /// Rollback pointer: features[..rollback_index] are active
    pub rollback_index: usize,
    /// Per-feature cached output bodies
    pub cache: HashMap<Uuid, CachedBody>,
}

pub struct FeatureNode {
    pub id: Uuid,
    pub feature: Feature,           // from cad-kernel/features.rs
    pub status: FeatureStatus,
    pub error: Option<String>,
    /// Which topological entities this feature created/modified
    pub provenance: Vec<ProvenanceRecord>,
}

pub enum FeatureStatus {
    Valid,                           // Successfully computed
    Stale,                           // Inputs changed, needs rebuild
    Error(String),                   // Failed to compute
    Suppressed,                      // User-disabled
}

pub struct CachedBody {
    pub brep: BRepModel,
    pub mesh: Option<TriMesh>,       // Tessellation cache
    pub generation: u64,             // Invalidation counter
}
```

### (C) Algorithms — Incremental Rebuild

```
rebuild(graph, changed_feature_id):
    // 1. Mark changed feature and all descendants as Stale
    stale = transitive_closure(graph.dependencies, changed_feature_id)
    for id in stale:
        graph.features[id].status = Stale

    // 2. Topological sort of stale features
    order = topological_sort(stale, graph.dependencies)

    // 3. Execute each stale feature in order
    for id in order:
        if id > graph.rollback_index: break  // Past rollback bar

        feature = graph.features[id]
        inputs = gather_inputs(feature, graph.cache)

        match execute_feature(inputs, feature.feature):
            Ok(body) =>
                graph.cache[id] = CachedBody { brep: body, mesh: None, generation: gen+1 }
                feature.status = Valid
            Err(e) =>
                feature.status = Error(e.to_string())
                feature.error = Some(e.to_string())
                // Stop rebuild chain — downstream features cannot proceed
                break

    // 4. Invalidate tessellation cache for all modified bodies
    for id in stale:
        if let Some(cached) = graph.cache.get_mut(id):
            cached.mesh = None
```

**Caching strategy:** Each feature stores its output `BRepModel`. When a feature's
inputs haven't changed (checked via `generation` counters), its cached output is
reused. This means editing a late feature (e.g., a fillet at the end) only
re-executes that one feature, not the entire tree.

### (D) UX Behavior

- **Timeline bar** at the bottom: drag to roll back/forward through features.
- **Edit feature**: double-click a feature in the tree → dialog opens with current
  parameters → live preview of changes → commit or cancel.
- **Reorder**: drag feature up/down if the dependency graph allows it.
- **Suppress**: right-click → "Suppress Feature" → grayed out, excluded from rebuild.

## 5.2 Core Features

### Extrude

| Aspect | Detail |
|--------|--------|
| **Theory** | Sweep a closed 2D profile along a direction vector to create a prismatic solid. |
| **Inputs** | `profile_ref` (closed wire from sketch), `distance` (mm), `direction` (Blind/Symmetric/ToFace/ThroughAll), `draft_angle` (optional), `operation` (Join/Cut/Intersect/NewBody) |
| **Algorithm** | 1. Get profile wire in sketch plane. 2. Compute extrude vector = plane.normal × distance. 3. For each edge in wire, create a ruled surface (line sweep). 4. Create top face by translating profile. 5. Bottom face = original profile. 6. Stitch into closed shell. 7. If draft: tilt ruled surfaces by draft_angle toward axis. 8. If operation = Cut: boolean subtract from target body. |
| **Data structures** | New `BRepShell` with: top face, bottom face, N ruled side faces, 2N side edges, N+N top/bottom edges |
| **UX** | Arrow handle for distance, toggle direction, preview ghost, dimension input field |
| **Failure modes** | Self-intersecting profile → reject. Draft angle too large → collapse → warn. ThroughAll with no intersection → error. |

### Revolve

| Aspect | Detail |
|--------|--------|
| **Theory** | Sweep profile around an axis by a given angle. |
| **Algorithm** | 1. For each profile edge, create a surface of revolution (toroidal for lines, spherical for points, general NURBS for curves). 2. Trim at start/end angles. 3. Stitch. |
| **Failure modes** | Profile crosses axis → invalid. Full 360° creates a closed shell; < 360° creates an open body (needs end caps). |

### Fillet

| Aspect | Detail |
|--------|--------|
| **Theory** | Rolling-ball fillet: a sphere of radius r rolls along an edge, tangent to both adjacent faces. The swept envelope of the sphere defines the fillet surface. |
| **Algorithm** | 1. For each selected edge, compute spine curve (the locus of ball centers). 2. At each spine point, compute the cross-section circle tangent to both faces. 3. Create a NURBS surface through these circles. 4. Trim the adjacent faces where the fillet surface intersects them. 5. Stitch fillet surface in. 6. Corner blending: at vertices where 3+ fillet edges meet, compute setback distances and create a tri-fillet patch. |
| **Failure modes** | Radius too large (fillet consumes an entire face) → report "Fillet radius exceeds geometry". Short edge → degenerate fillet → auto-reduce radius at that edge. |

### Boolean Operations (Union / Cut / Intersect)

Detailed in Section 6.3 below.

### Shell

| Aspect | Detail |
|--------|--------|
| **Algorithm** | 1. Remove selected faces. 2. Offset remaining faces inward by thickness. 3. Create ruled surfaces connecting outer and inner boundaries at removed face holes. 4. Stitch into new shell. |
| **Failure modes** | Thickness > minimum wall feature → collapse. Offset surface self-intersects → reduce thickness or report error. |

### Pattern (Linear / Circular)

| Aspect | Detail |
|--------|--------|
| **Algorithm** | 1. Compute N transform matrices (linear: translate by `i × spacing × direction`; circular: rotate by `i × 360°/N` around axis). 2. For each instance, clone the source feature's body and apply transform. 3. Union all instances with the base body. |
| **Optimization** | Instead of N separate booleans, collect all instance meshes and do a single N-way union (batch boolean). |

### Hole Feature

| Aspect | Detail |
|--------|--------|
| **Theory** | A hole is a specialized cut-extrude with standard profiles: simple, counterbore, countersink, tapped. |
| **Data** | `diameter`, `depth`, `type` (simple/cbore/csink/tapped), `cbore_diameter`, `cbore_depth`, `csink_angle`, `thread_size`, `thread_pitch` |
| **Algorithm** | 1. Create profile (circle for simple; stepped profile for cbore; cone+circle for csink). 2. Extrude-cut at the selected face point along face normal. |

## 5.3 Topological Naming Strategy

### (A) Theory

When a user selects "Fillet these 4 edges", and then later edits an upstream sketch,
the B-Rep topology changes (edge IDs shift). The fillet feature must still find "the
same" 4 edges. This is the **topological naming problem**.

### (B) Data Structures

```rust
/// A persistent name for a topological entity that survives rebuild.
pub struct PersistentName {
    /// Which feature created this entity
    pub creating_feature: Uuid,
    /// Type of creation event
    pub creation_type: CreationType,
    /// Geometric signature for fallback matching
    pub geometric_signature: GeometricSignature,
    /// Adjacency signature (neighboring faces/edges)
    pub adjacency_signature: AdjacencySignature,
}

pub enum CreationType {
    /// Face created by extruding edge E of sketch S
    ExtrudeSide { sketch_edge_index: usize },
    /// Top/bottom cap of extrusion
    ExtrudeCap { is_top: bool },
    /// Face created by boolean intersection curve
    BooleanFace { tool_face: Uuid, target_face: Uuid },
    /// Edge at intersection of two faces
    IntersectionEdge { face_a: Uuid, face_b: Uuid },
    /// Fillet surface on edge E
    FilletFace { source_edge: Uuid },
    // ... etc.
}

pub struct GeometricSignature {
    /// Surface type (plane/cylinder/sphere/...)
    pub surface_type: SurfaceType,
    /// Approximate centroid
    pub centroid: DVec3,
    /// Approximate normal at centroid
    pub normal: DVec3,
    /// Approximate area
    pub area: f64,
}
```

### (C) Resolution Algorithm

```
resolve_name(persistent_name, current_brep):
    // Strategy 1: Exact match by creation provenance
    candidates = current_brep.entities_created_by(persistent_name.creating_feature)
    if candidates.len() == 1: return candidates[0]

    // Strategy 2: Filter by creation type
    candidates = candidates.filter(|e| e.creation_type == persistent_name.creation_type)
    if candidates.len() == 1: return candidates[0]

    // Strategy 3: Geometric signature matching
    best = None
    best_score = f64::MAX
    for candidate in all_entities_of_same_type(current_brep):
        score = geometric_distance(candidate.signature, persistent_name.geometric_signature)
        if score < best_score:
            best_score = score
            best = candidate
    if best_score < threshold: return best

    // Strategy 4: Adjacency graph matching
    for candidate in candidates:
        if adjacency_matches(candidate, persistent_name.adjacency_signature):
            return candidate

    // Failed: report to user
    return UnresolvedReference(persistent_name)
```

**On unresolved reference:** The feature turns red in the tree. A dialog offers:
"Edge reference lost. Click an edge to re-link, or delete this feature."

---

# 6) Solid Modeling Kernel (B-Rep) + Boolean Robustness

## 6.1 B-Rep Data Model

### (B) Data Structures

```
Solid
  └── Shell (1+, usually 1 for simple solid; void shells for internal cavities)
       └── Face (N)
            ├── surface: Surface (Plane|Cylinder|Cone|Sphere|Torus|NurbsSurface)
            ├── outer_loop: Loop
            │    └── Coedge → Coedge → ... → (back to first)
            └── inner_loops: Vec<Loop>  (holes in the face)
                 └── Coedge → ...

Loop
  └── Coedge (ordered, closed chain)
       ├── edge: &Edge
       ├── orientation: Same | Reversed  (which direction this loop traverses the edge)
       └── next: &Coedge

Edge
  ├── curve: Curve3D (Line|Circle|Ellipse|BSpline|Nurbs)
  ├── param_range: (f64, f64)  (t_start, t_end on the curve)
  ├── start_vertex: &Vertex
  ├── end_vertex: &Vertex
  ├── p_curve_left: Option<Curve2D>   (UV trim curve on left face)
  └── p_curve_right: Option<Curve2D>  (UV trim curve on right face)

Vertex
  ├── point: DVec3
  └── tolerance: f64    (vertex sits within this ball)
```

**Key invariants:**
1. Every edge is referenced by exactly 2 coedges (manifold condition).
2. Every loop is closed (first coedge connects to last).
3. Face normals point outward (for the outermost shell).
4. Each face's outer loop is oriented CCW when viewed from the normal direction.
5. Inner loops are CW (hole convention).

### Persistent IDs

Every topological entity gets a `Uuid` at creation time. This ID survives boolean
operations (the result face that came from tool face T₁ inherits T₁'s ID if it's
geometrically identical, or gets a new ID + provenance record linking to T₁).

## 6.2 Curve/Surface Trimming

### P-Curves

A p-curve (parametric curve) is a 2D curve in the UV parameter space of a surface.
Each edge stores two p-curves: one for each adjacent face.

**Why p-curves?** An edge's 3D curve and its face's surface may not agree perfectly
(especially after boolean operations or import). The p-curve ensures the trim
boundary is exact in the surface's parameter domain.

**Consistency rule:** The 3D edge curve `C(t)` and the face's surface evaluated at
the p-curve `S(pcurve(t))` must agree within `trim_tolerance` at all points:

```
max_t |C(t) - S(pcurve(t))| ≤ trim_tolerance
```

If this invariant is violated after an operation, the p-curve is recomputed by
projecting the 3D edge curve onto the surface (point inversion).

### Tessellation of Trimmed Faces

```
tessellate_trimmed_face(face):
    // 1. Sample p-curves to get UV boundary polygon
    uv_boundary = sample_loops_in_uv(face)

    // 2. Triangulate UV domain (constrained Delaunay)
    uv_mesh = constrained_delaunay(uv_boundary)

    // 3. Refine: insert points where chordal deviation exceeds tolerance
    for each triangle in uv_mesh:
        uv_mid = triangle.centroid()
        surface_point = face.surface.evaluate(uv_mid)
        linear_point = interpolate_triangle(triangle, uv_mid)
        if distance(surface_point, linear_point) > max_deviation:
            insert_point(uv_mesh, uv_mid)

    // 4. Evaluate final UV mesh points on the surface
    for each vertex in uv_mesh:
        vertex.position = face.surface.evaluate(vertex.uv)
        vertex.normal = face.surface.normal(vertex.uv)

    return uv_mesh
```

## 6.3 Boolean Operations — Robust Pipeline

### (A) Theory

Boolean operations (union, intersection, difference) between two solids A and B.

### (C) Algorithm — Full Pipeline

```
boolean(A, B, operation):
    // ═══ Phase 1: Broadphase ═══
    // Build BVH over faces of A and faces of B
    bvh_A = build_face_bvh(A)
    bvh_B = build_face_bvh(B)
    candidate_pairs = bvh_overlap(bvh_A, bvh_B)
    // Typically filters out 90%+ of face pairs

    // ═══ Phase 2: Face-Face Intersection ═══
    intersection_curves = []
    for (face_a, face_b) in candidate_pairs:
        curve = surface_surface_intersect(face_a.surface, face_b.surface)
        if curve is not None:
            // Trim curve to face boundaries
            trimmed = trim_curve_to_faces(curve, face_a, face_b)
            intersection_curves.extend(trimmed)

    if intersection_curves.is_empty():
        // No intersection — either disjoint or one contains the other
        return classify_containment(A, B, operation)

    // ═══ Phase 3: Split Faces ═══
    // Insert intersection curves as new edges into both shells
    for curve in intersection_curves:
        split_face(A, curve)
        split_face(B, curve)

    // ═══ Phase 4: Classify Regions ═══
    // For each face in A, determine if it's inside B, outside B, or on the boundary
    for face in A.faces:
        sample = face.interior_point()
        face.classification = point_in_solid(sample, B)  // Inside / Outside / OnBoundary

    for face in B.faces:
        sample = face.interior_point()
        face.classification = point_in_solid(sample, A)

    // ═══ Phase 5: Select Faces by Operation ═══
    result_faces = match operation:
        Union:
            A.faces.filter(|f| f.classification != Inside)
            + B.faces.filter(|f| f.classification != Inside)
        Intersection:
            A.faces.filter(|f| f.classification != Outside)
            + B.faces.filter(|f| f.classification != Outside)
        Difference:
            A.faces.filter(|f| f.classification != Inside)
            + B.faces.filter(|f| f.classification == Inside).map(flip_normal)

    // ═══ Phase 6: Stitch ═══
    result = stitch_faces(result_faces)

    // ═══ Phase 7: Heal ═══
    heal_gaps(result, tolerance)
    remove_sliver_faces(result, min_area)
    remove_tiny_edges(result, min_length)
    validate_manifold(result)

    return result
```

### (E) Failure Modes + Mitigations

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Near-coincident faces | Two faces are almost but not quite coplanar | Detect: `|dot(n₁,n₂) - 1| < ε AND |dist| < tol`. Merge into single face or offset slightly. |
| Sliver faces | Boolean creates a face with area < tol² | Post-boolean: remove faces below area threshold; merge into neighbors |
| Tiny edges | Intersection curve is very short | Collapse edges shorter than `vertex_merge` tolerance |
| Non-manifold result | Three or more faces share an edge | Split the edge; duplicate the boundary |
| Classification ambiguity | Sample point is exactly on a face of the other solid | Perturb sample point along face normal by ε; retry |

### (F) Complexity

- **Broadphase BVH overlap:** O(N log N) build, O(k) query where k = output pairs.
- **Surface-surface intersection (analytic):** O(1) for plane-plane, plane-cylinder, etc.
- **Surface-surface intersection (NURBS-NURBS):** O(n²) subdivision iterations.
- **Classification:** O(N) ray cast + BVH traversal per face.
- **Total for 50K-tri solids:** Target < 100 ms on modern CPU.

## 6.4 Fillet/Chamfer Kernel

### Rolling Ball Fillet Algorithm

```
fillet_edge(edge, radius, body):
    // 1. Compute spine curve
    //    The spine is the locus of centers of spheres of radius r
    //    that are tangent to both adjacent faces.
    face_left  = edge.left_face()
    face_right = edge.right_face()

    // Sample the edge at N points
    for t in linspace(edge.param_start, edge.param_end, N):
        edge_pt = edge.curve.evaluate(t)
        n_left  = face_left.surface.normal_at(edge_pt)
        n_right = face_right.surface.normal_at(edge_pt)

        // Offset both faces inward by r
        center = edge_pt + r * bisector(n_left, n_right)
        spine_points.push(center)

    // 2. Fit spine curve (B-spline through spine_points)
    spine = fit_bspline(spine_points, degree=3)

    // 3. At each spine point, construct the fillet cross-section
    //    (circular arc tangent to both faces)
    fillet_surface = sweep_circle_along_spine(spine, radius)

    // 4. Trim adjacent faces
    trim_left  = intersect(fillet_surface, face_left.surface)
    trim_right = intersect(fillet_surface, face_right.surface)
    face_left.trim_with(trim_left)
    face_right.trim_with(trim_right)

    // 5. Insert fillet face
    body.add_face(fillet_surface, trim_left, trim_right)
```

### Corner Blending (Setback)

When three fillet edges meet at a vertex:

```
blend_corner(vertex, fillet_edges, body):
    // Compute setback distances: each fillet must stop short of the vertex
    // so there's room for the blend patch
    for edge in fillet_edges:
        setback = compute_setback(edge.radius, vertex_angle(edge, vertex))

    // Create a tri-tangent blend patch (Gregory patch or Coons patch)
    // that smoothly connects the three truncated fillet surfaces
    patch = create_corner_blend(fillet_edges, setbacks)
    body.add_face(patch)
```

---

# 7) Tessellation, Display Pipeline, and Performance

## 7.1 Rendering Model

### Separation of Concerns

```
B-Rep (exact)          → source of truth
    ↓ tessellate()
TriMesh (approximate)  → GPU rendering + picking + DFM analysis
    ↓ upload_to_gpu()
GPU Buffers            → vertex/index buffers, BVH acceleration structure
```

**Key rule:** Never modify B-Rep based on tessellation. Tessellation is a
read-only, lossy transformation.

### Tessellation Parameters

```rust
pub struct TessellationConfig {
    /// Max chordal deviation: max distance from tessellation to true surface
    pub chordal_deviation: f64,      // mm (default: 0.05)
    /// Max angular deviation: max angle between adjacent triangle normals
    pub angular_deviation: f64,      // radians (default: 15° = 0.26 rad)
    /// Min edge length: don't create triangles smaller than this
    pub min_edge_length: f64,        // mm (default: 0.01)
    /// Max edge length: split edges longer than this
    pub max_edge_length: f64,        // mm (default: 10.0)
}
```

### Incremental Meshing

```
tessellate_incremental(body, changed_faces):
    for face in body.faces:
        if face.id in changed_faces OR face.mesh_generation < face.geometry_generation:
            face.mesh = tessellate_trimmed_face(face, config)
            face.mesh_generation = face.geometry_generation

    // Merge per-face meshes into body mesh
    body.mesh = merge_face_meshes(body.faces)
```

## 7.2 Acceleration Structures

### BVH (Bounding Volume Hierarchy)

```rust
pub struct BvhNode {
    pub aabb: Aabb,              // axis-aligned bounding box
    pub left: Option<Box<BvhNode>>,
    pub right: Option<Box<BvhNode>>,
    pub primitives: Vec<u32>,    // leaf: triangle indices
}
```

**Build:** SAH (Surface Area Heuristic) for quality, LBVH (linear BVH via Morton
codes) for speed. We use **LBVH for initial build** (< 3 ms for 1M triangles) and
**SAH for refit** when only a few faces changed.

### Spatial Hash for Sketch Snap

```rust
pub struct SpatialHash2D {
    cell_size: f64,
    cells: HashMap<(i64, i64), Vec<SnapCandidate>>,
}

pub struct SnapCandidate {
    pub entity_id: usize,
    pub snap_type: SnapType,  // Vertex, Midpoint, OnCurve, GridIntersection
    pub position: Point2,
}
```

Query: `hash.query(cursor_pos, radius)` returns candidates in O(1) average.

## 7.3 Large STEP/STL Strategy

### STEP (500 MB+)

```
import_step_progressive(file_path, progress_callback):
    // ── Stage 1: Stream-parse STEP entities ──
    // Don't load entire file into RAM; use streaming parser
    reader = StepStreamReader::open(file_path)

    // ── Stage 2: Build scene graph progressively ──
    while reader.has_next():
        entity = reader.next_entity()

        match entity:
            ProductDefinition(name, ...) =>
                node = SceneGraph::add_node(name)
                progress_callback(node, BoundingBoxOnly)

            AdvancedBrepShape(brep_data) =>
                // Parse geometry in background thread
                spawn_task(async {
                    brep = parse_brep(brep_data)
                    mesh = tessellate(brep, LOW_QUALITY)
                    node.set_geometry(brep, mesh)
                    progress_callback(node, LowQualityMesh)

                    // Then upgrade to high quality
                    mesh_hq = tessellate(brep, HIGH_QUALITY)
                    node.set_mesh(mesh_hq)
                    progress_callback(node, HighQualityMesh)
                })

    // User sees: bounding boxes → coarse mesh → fine mesh
```

**Memory management:**
- Parts not visible in viewport: evict high-quality mesh, keep only AABB.
- Parts far from camera: use LOD level 2 (coarse mesh).
- Maximum resident mesh budget: 512 MB GPU VRAM, 2 GB CPU RAM.

### STL (500 MB+)

```
import_stl_chunked(file_path):
    // ── Parse in 16 MB chunks ──
    reader = StlChunkReader::open(file_path)
    mesh = TriMesh::new()

    while reader.has_chunk():
        chunk = reader.read_chunk(16_MB)  // parse triangles
        // Parallel: weld vertices, compute normals
        chunk_mesh = rayon::par_iter(chunk.triangles)
            .map(|tri| process_triangle(tri))
            .collect()
        mesh.append(chunk_mesh)
        progress_callback(mesh.vertex_count())

    // ── Post-process ──
    mesh.weld_vertices(tolerance=1e-6)       // merge coincident vertices
    mesh.compute_normals()                    // weighted average normals
    mesh.build_bvh()

    // ── Optional: decimate for large meshes ──
    if mesh.triangle_count() > 5_000_000:
        mesh_lod = quadric_error_decimate(mesh, target=1_000_000)
        // Use mesh_lod for viewport, keep original for CAM
```

---

# 8) STEP Import/Export Architecture

## 8.1 STEP Ingestion Pipeline

### Staged Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Parse   │───→│ Geometry │───→│ Topology │───→│   Sew    │───→│ Validate │───→│ Tessellate│
│  STEP    │    │  Build   │    │  Build   │    │  Stitch  │    │  Heal    │    │  Cache   │
│  entities│    │ curves & │    │ faces,   │    │ close    │    │ orient,  │    │ generate │
│          │    │ surfaces │    │ edges,   │    │ gaps     │    │ fix      │    │ meshes   │
│          │    │          │    │ vertices │    │          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
    1 ms/MB       5 ms/MB         3 ms/MB         10 ms/MB        5 ms/MB        20 ms/MB
```

Total for 500 MB STEP: approximately 22 seconds (parallelized across 8 cores).

### Stage Details

**Stage 1 — Parse:**
- Streaming lexer: tokenize `#123 = ADVANCED_BREP_SHAPE_REPRESENTATION(...)` without
  loading entire file.
- AP203 / AP214 / AP242 detection from `FILE_SCHEMA`.
- Build entity index: `HashMap<u64, StepEntity>`.

**Stage 2 — Geometry Build:**
- Map STEP surface types → kernel surface types:
  - `PLANE` → `Surface::Plane`
  - `CYLINDRICAL_SURFACE` → `Surface::Cylinder`
  - `B_SPLINE_SURFACE_WITH_KNOTS` → `Surface::NurbsSurface`
  - etc.
- Map STEP curve types → kernel curve types.
- Unit conversion: parse `CONVERSION_BASED_UNIT` → apply scale factor.

**Stage 3 — Topology Build:**
- `CLOSED_SHELL` → `Shell`
- `ADVANCED_FACE` → `Face` (with surface reference)
- `FACE_OUTER_BOUND` / `FACE_BOUND` → `Loop`
- `ORIENTED_EDGE` → `Coedge` (with `EDGE_CURVE` → `Edge`)
- `VERTEX_POINT` → `Vertex`

**Stage 4 — Sew/Stitch:**
```
sew_shell(shell, tolerance):
    free_edges = shell.edges.filter(|e| e.coedge_count() == 1)
    // For each pair of free edges, check if they are geometrically coincident
    for (e1, e2) in free_edges.pairs():
        if edges_coincident(e1, e2, tolerance):
            merge_edges(e1, e2, shell)
    // Remaining free edges after sewing → report as gaps
```

**Stage 5 — Validate + Heal:** (See Section 3.3 above)

**Stage 6 — Tessellate:** Parallel per-face tessellation (Rayon `par_iter`).

### AP203/AP214/AP242 Metadata

- **Names:** `PRODUCT_DEFINITION.name` → entity name
- **Colors:** `STYLED_ITEM` → `SURFACE_STYLE_USAGE` → `COLOUR_RGB` → appearance
- **Layers:** `PRESENTATION_LAYER_ASSIGNMENT` → layer grouping
- **Assemblies:** `NEXT_ASSEMBLY_USAGE_OCCURRENCE` → parent-child tree
- **Units:** `GLOBAL_UNIT_ASSIGNED_CONTEXT` → mm/inch/meter

## 8.2 Export

### STEP Export

```
export_step(bodies, metadata, output_path):
    writer = StepWriter::new(AP214)

    // 1. Write header (FILE_DESCRIPTION, FILE_NAME, FILE_SCHEMA)
    writer.write_header(metadata)

    // 2. For each body, write geometry + topology
    for body in bodies:
        // Surfaces
        for face in body.faces:
            step_surface = convert_surface_to_step(face.surface)
            writer.write(step_surface)

        // Curves
        for edge in body.edges:
            step_curve = convert_curve_to_step(edge.curve)
            writer.write(step_curve)

        // Topology (faces → loops → edges → vertices)
        for face in body.faces:
            step_face = convert_face_to_step(face)
            writer.write(step_face)

        // Shell
        step_shell = convert_shell_to_step(body.shell)
        writer.write(step_shell)

    // 3. Write colors, names, assembly structure
    writer.write_metadata(metadata)
    writer.flush(output_path)
```

### Mesh Export (STL/OBJ/glTF)

- **STL:** Binary format, 80-byte header + N triangles × 50 bytes. No normals per
  vertex (only per-face). Deterministic ordering: faces sorted by centroid Z, then
  Y, then X.
- **OBJ:** Vertices, normals, texture coordinates, faces. Group by body name.
- **glTF 2.0:** Full PBR materials, scene hierarchy, animations. Preferred for
  visualization interchange.

---

# 9) CAM Subsystem (2.5D + 3-axis)

## 9.1 CAM Data Model

```rust
pub struct CamSetup {
    pub id: Uuid,
    pub name: String,
    pub stock: StockDefinition,
    pub wcs: WorkCoordinateSystem,
    pub operations: Vec<CamOperation>,
}

pub struct StockDefinition {
    pub shape: StockShape,           // Box, Cylinder, FromMesh
    pub dimensions: StockDimensions, // depends on shape
    pub material: CncMaterial,
}

pub enum StockShape {
    Box { width: f64, height: f64, depth: f64 },
    Cylinder { diameter: f64, length: f64 },
    FromMesh(TriMesh),               // Custom stock shape
}

pub struct WorkCoordinateSystem {
    pub origin: DVec3,
    pub x_axis: DVec3,
    pub y_axis: DVec3,
    pub z_axis: DVec3,               // tool axis (usually +Z)
}

pub struct CamOperation {
    pub id: Uuid,
    pub name: String,
    pub op_type: OperationType,
    pub tool: Tool,
    pub parameters: OperationParams,
    pub toolpath: Option<Toolpath>,  // computed lazily
    pub enabled: bool,
}

pub struct Tool {
    pub id: String,
    pub tool_type: ToolType,         // EndMill, BallNose, Drill, FaceMill
    pub diameter: f64,
    pub flute_length: f64,
    pub total_length: f64,
    pub num_flutes: u32,
    pub corner_radius: f64,          // 0 for flat, >0 for bull nose
}
```

## 9.2 Toolpath Algorithms

### Facing

```
generate_facing(stock, tool, params):
    // Zigzag passes across the top of the stock
    x_min = stock.min_x + tool.radius
    x_max = stock.max_x - tool.radius
    y_min = stock.min_y + tool.radius
    y_max = stock.max_y - tool.radius
    z = stock.max_z - params.depth_per_pass

    points = []
    y = y_min
    forward = true
    while y <= y_max:
        if forward:
            points.push([x_min, y, z])
            points.push([x_max, y, z])
        else:
            points.push([x_max, y, z])
            points.push([x_min, y, z])
        y += tool.diameter * params.stepover_ratio  // e.g., 0.7
        forward = !forward
    return points
```

### Pocketing (Offset Spiral)

```
generate_pocket(boundary, islands, tool, params):
    // 1. Offset boundary inward by tool_radius
    pocket_boundary = offset_polygon(boundary, -tool.radius)

    // 2. Offset islands outward by tool_radius
    pocket_islands = islands.map(|i| offset_polygon(i, tool.radius))

    // 3. Generate offset spiral
    current_boundary = pocket_boundary
    all_passes = []
    while current_boundary.area() > 0:
        pass = offset_polygon(current_boundary, -stepover)
        pass = clip_to_boundary(pass, pocket_boundary)
        pass = subtract_islands(pass, pocket_islands)
        all_passes.push(pass)
        current_boundary = pass

    // 4. Connect passes with linking moves
    toolpath = connect_with_ramp_entry(all_passes, params)

    // 5. Repeat for each depth layer
    for z in depth_layers(params.total_depth, params.depth_per_pass):
        toolpath.extend(translate_z(all_passes, z))

    return toolpath
```

### Contour Profiling

```
generate_contour(boundary, tool, params, inside_or_outside):
    offset = match inside_or_outside:
        Inside  => -tool.radius
        Outside => tool.radius

    profile = offset_polygon(boundary, offset)

    // Lead-in: arc entry tangent to the profile
    lead_in = compute_arc_lead_in(profile[0], profile[1], tool.radius)

    // Lead-out: arc exit tangent
    lead_out = compute_arc_lead_out(profile.last(), profile[profile.len()-2], tool.radius)

    for z in depth_layers(params.total_depth, params.depth_per_pass):
        toolpath.push(lead_in.at_z(z))
        toolpath.extend(profile.at_z(z))
        toolpath.push(lead_out.at_z(z))

    return toolpath
```

### Adaptive Clearing (Trochoidal)

```
generate_adaptive(boundary, islands, tool, params):
    // Core idea: maintain constant tool engagement angle
    // to prevent shock loading and enable higher feeds

    max_engagement = params.max_engagement_angle  // e.g., 90°
    stepover = tool.radius * (1 - cos(max_engagement))

    // 1. Compute medial axis of the pocket (Voronoi diagram)
    medial = compute_medial_axis(boundary, islands)

    // 2. Generate trochoidal path along medial axis
    for segment in medial.segments:
        // Trochoidal motion: circular arcs interspersed with forward moves
        forward_step = stepover
        arc_radius = tool.radius * 0.8
        points = []
        along = 0.0
        while along < segment.length:
            center = segment.point_at(along)
            // Circular arc (partial circle to maintain engagement)
            arc = generate_arc(center, arc_radius, engagement_angle)
            points.extend(arc)
            along += forward_step
        toolpath.extend(points)

    // 3. Depth layers
    for z in depth_layers(params.total_depth, params.depth_per_pass):
        toolpath.extend_at_z(z)

    return toolpath
```

### Drilling Cycles

Already implemented in `cam-engine/src/toolpath.rs` as `generate_peck_drill`.
Additional cycles:

```
generate_drill_cycle(hole, tool, params):
    match params.drill_type:
        Simple =>
            rapid_to(hole.x, hole.y, safe_z)
            feed_to(hole.x, hole.y, -hole.depth)
            rapid_to(hole.x, hole.y, safe_z)

        Peck(peck_depth) =>
            // G83 cycle: peck, retract to clear chips
            generate_peck_drill(...)  // existing implementation

        ChipBreak(break_depth) =>
            // G73 cycle: small retract (0.5mm) to break chip, don't fully retract
            current_z = 0
            while current_z < hole.depth:
                feed_to(hole.x, hole.y, -(current_z + break_depth))
                retract_by(0.5)
                current_z += break_depth

        Dwell(time_sec) =>
            feed_to(hole.x, hole.y, -hole.depth)
            dwell(time_sec)
            rapid_to(hole.x, hole.y, safe_z)
```

## 9.3 Verification

### Collision Detection

```
check_collisions(toolpath, tool, stock_mesh, part_mesh):
    swept_volume = compute_swept_volume(toolpath, tool)
    // Approximate swept volume as sequence of cylinders + spheres

    // Check tool vs. part (gouging)
    gouge_points = intersect(swept_volume, part_mesh)
    if gouge_points not empty:
        return Error::Gouging(gouge_points)

    // Check holder vs. stock/part
    holder_volume = compute_holder_swept(toolpath, tool)
    holder_collisions = intersect(holder_volume, stock_mesh)
    if holder_collisions not empty:
        return Error::HolderCollision(holder_collisions)

    return Ok
```

### Material Removal Simulation

```
simulate_material_removal(toolpath, tool, stock):
    // Represent stock as a dense voxel grid (dexels — Z-height columns)
    dexel_grid = DexelGrid::from_stock(stock, resolution=0.5mm)

    for segment in toolpath.segments:
        swept = tool.swept_cylinder(segment)
        dexel_grid.subtract(swept)

    remaining = dexel_grid.to_mesh()
    return remaining
```

### Time Estimation

```
estimate_time(toolpath):
    total_time = 0.0
    for i in 1..toolpath.points.len():
        dist = distance(points[i-1], points[i])
        feed = feed_rates[i]
        total_time += dist / feed  // minutes
    // Add tool change time (10 sec each)
    total_time += tool_changes * (10.0 / 60.0)
    return total_time
```

## 9.4 Post Processing

### Architecture

```rust
pub trait PostProcessor {
    fn header(&self, config: &PostConfig) -> String;
    fn tool_change(&self, tool: &Tool) -> String;
    fn rapid_move(&self, point: DVec3) -> String;
    fn linear_move(&self, point: DVec3, feed: f64) -> String;
    fn arc_cw(&self, end: DVec3, center_offset: DVec3, feed: f64) -> String;
    fn arc_ccw(&self, end: DVec3, center_offset: DVec3, feed: f64) -> String;
    fn spindle_on(&self, rpm: f64, direction: SpindleDir) -> String;
    fn coolant(&self, coolant_type: CoolantType) -> String;
    fn dwell(&self, seconds: f64) -> String;
    fn footer(&self, config: &PostConfig) -> String;
}
```

Built-in post-processors: Fanuc, Haas, Mazak, Siemens, LinuxCNC, Grbl, Marlin, Klipper.

Custom post-processors can be loaded as WASM plugins implementing this trait.

---

# 10) UX Rules: "Onshape/Fusion Feel"

## 10.1 Sketch UX

### Constraint Inference

```
on_sketch_entity_created(entity):
    // Check if the entity is nearly horizontal/vertical/tangent
    if entity is Segment:
        angle = atan2(dy, dx)
        if |angle| < 5°:
            suggest_constraint(Horizontal)
        elif |angle - 90°| < 5°:
            suggest_constraint(Vertical)
        elif |angle - 45°| < 3°:
            // Don't auto-infer 45° — too aggressive

    if entity.endpoint is near another_entity.endpoint (< 8px):
        suggest_constraint(Coincident)

    if entity is Arc and arc.endpoint is near line.endpoint:
        if tangent_angle_match(arc, line, tolerance=5°):
            suggest_constraint(Tangent)
```

**Inferred constraints appear as light blue glyphs that become solid on mouse-up
(confirm).** Hold **Ctrl** during drawing to suppress inference.

### Snap Priority (during drawing)

1. Existing vertex (8 px radius)
2. Midpoint of existing edge (8 px)
3. Intersection of two entities (8 px)
4. Tangent point (6 px)
5. Grid intersection (4 px)
6. On-edge (any point on existing curve) (3 px)
7. Grid line (nearest grid line) (2 px)
8. Free (no snap)

**Override:** Hold **Alt** to disable all snapping. Hold **Shift** to lock to
horizontal/vertical from the last point.

### Dimension Editing

```
on_dimension_click(dimension):
    // 1. Show inline text input at dimension position
    show_input(dimension.position, dimension.value.to_string())

    // 2. User types new value
    on_input_confirm(new_value):
        dimension.value = parse(new_value)
        solver.solve()  // live preview
        if solver.converged:
            commit_value()
        else:
            show_error("Cannot apply this dimension value")
            revert_to_previous()
```

## 10.2 Feature UX

### Feature Dialog Workflow

```
State Machine:
    IDLE → (user clicks "Extrude")
    SELECT_PROFILE → user clicks a sketch face → profile captured
    CONFIGURE → dialog shows distance, direction, operation
        ├── live preview (ghost geometry) updated on every parameter change
        ├── dimension handle in viewport for drag-to-set distance
        └── dropdown for direction (Blind/Symmetric/ToFace/ThroughAll)
    CONFIRM → user clicks "OK" or presses Enter
        → execute_feature()
        → add to feature tree
        → rebuild downstream features
    CANCEL → user clicks "Cancel" or presses Escape
        → discard preview
        → return to IDLE
```

### Edit Feature

```
on_edit_feature(feature_id):
    // 1. Roll back to just before this feature
    rollback_to(feature_id - 1)

    // 2. Show the feature's dialog with current parameters
    show_dialog(feature.params, live_preview=true)

    // 3. On confirm:
    //    - Update feature parameters
    //    - Rebuild from this feature forward
    //    - Re-resolve any topological name references

    // 4. On cancel:
    //    - Restore to original state
    //    - Rebuild forward
```

### Error Reporting

When a feature fails:

```
┌──────────────────────────────────────────────┐
│ ⚠ Feature "Fillet 1" failed                   │
│                                                │
│ Error: Edge reference lost after editing       │
│        Sketch 1                                │
│                                                │
│ The following edges could not be found:        │
│   • Edge 3 (previously between Face 2 and      │
│     Face 5)                                    │
│                                                │
│ Options:                                       │
│   [Re-select edges]  [Delete feature]  [Undo] │
└──────────────────────────────────────────────┘
```

## 10.3 Viewport UX

### Orbit/Pan/Zoom

| Action | Input | Behavior |
|--------|-------|----------|
| Orbit | Middle-drag | Trackball rotation around look-at point |
| Pan | Shift+Middle-drag | Translate camera in screen plane |
| Zoom | Scroll wheel | Dolly toward/away from cursor position (not center) |
| Zoom to fit | `F` key | Frame all visible geometry with 10% padding |
| Zoom to selection | `Z` key | Frame selected entities |
| Orthographic views | Numpad 1-9 | Front/Back/Left/Right/Top/Bottom/Iso |

### Selection Modes

| Mode | Toggle | Behavior |
|------|--------|----------|
| Body | `1` | Click selects entire solid |
| Face | `2` | Click selects a face (for Shell, Draft, Sketch-on-face) |
| Edge | `3` | Click selects an edge (for Fillet, Chamfer) |
| Vertex | `4` | Click selects a vertex (for Coincident constraints) |

### Box Select

- Left-drag from left to right: **window select** — only entities fully inside
  the rectangle are selected.
- Left-drag from right to left: **crossing select** — entities that intersect the
  rectangle are selected.

### Latency Targets

| Action | Target | Method |
|--------|--------|--------|
| Pointer to highlight | < 16 ms | GPU BVH picking, async CPU fallback |
| Sketch handle drag | 60 fps (16.7 ms budget) | Incremental solver (max 20 iterations per frame) |
| Feature preview update | < 200 ms | Incremental rebuild only changed feature |
| Full model rebuild (100 features) | < 2 s | Parallel rebuild, cached intermediate results |
| Large STEP initial display | < 3 s | Progressive load: AABB → low-res → high-res |

---

# 11) Test Strategy & Determinism

## 11.1 Geometry Unit Tests

```
test_categories:
    - Point/Line/Circle intersections (all edge cases: tangent, parallel, coincident)
    - NURBS evaluation vs. known analytical results
    - Bounding box correctness for all primitive types
    - Distance-to-point for all primitive types
    - Curve trimming produces valid sub-curves
```

## 11.2 Solver Tests

```
test_categories:
    - Horizontal constraint: point moves to correct Y
    - Distance constraint: endpoints reach exact distance
    - Triangle (3 distances): converges to unique triangle
    - Over-constrained detection: conflicting horizontal + vertical + diagonal
    - Under-constrained DOF count is accurate
    - Randomized: generate random constraint graph (N points, M constraints),
      perturb positions, verify convergence rate > 99%
    - Regression: saved failing cases from production (sketch files that jittered)
    - Drag simulation: 1000 random drag sequences, verify no NaN or divergence
```

## 11.3 STEP Corpus Tests

```
test_corpus:
    - NIST CTC (Conformance Testing Campaign) models
    - IDA-STEP roundtrip test suite
    - Known problematic files:
        - models with > 100K faces
        - models with non-manifold geometry
        - models with mixed AP203/AP214 entities
        - models with inch units
        - models with assembly structure (NAUO chains)
    - For each: import → validate → export → re-import → compare topology counts
```

## 11.4 Deterministic Rebuild Tests

```
test_determinism:
    for model in test_models:
        result_1 = rebuild(model, params)
        result_2 = rebuild(model, params)  // same params, second run
        assert result_1.topology.face_ids == result_2.topology.face_ids
        assert result_1.topology.edge_ids == result_2.topology.edge_ids
        assert result_1.mesh.positions ≈ result_2.mesh.positions (within 1e-12)
```

## 11.5 Fuzz Testing

```
fuzz_targets:
    - Constraint solver: random points + random constraints → must not panic or produce NaN
    - Boolean operations: random pairs of primitives → must not produce non-manifold
    - STEP parser: random byte sequences → must not panic (use cargo-fuzz)
    - STL parser: random binary data → must not panic
    - Tessellation: degenerate B-Rep inputs → must produce valid or empty mesh
```

---

# 12) Implementation Plan and Module Breakdown

## 12.1 Module Layout

```
packages/
├── shared-types/        # Geometry, units, materials, manufacturing types
│   └── src/
│       ├── geometry.rs          # Transform3D, BoundingBox3D, TriMesh, FaceRef, EdgeRef
│       ├── units.rs             # LengthUnit, AngleUnit, Parameter
│       ├── materials.rs         # SheetMaterial, CncMaterial, Appearance
│       ├── manufacturing.rs     # Toolpath, GCodeProgram, PostProcessor, NestingResult
│       ├── estimation.rs        # CncEstimation, CostBreakdown
│       ├── dfm.rs               # DfmFinding, DfmSeverity
│       ├── api.rs               # REST API request/response types
│       └── platform.rs          # Platform adapter types
│
├── cad-kernel/          # B-Rep topology + geometry + features + sketch ops
│   └── src/
│       ├── brep.rs              # BRepModel, BRepTopology (869 lines, 4 tests)
│       ├── features.rs          # Feature enum, 20 FeatureKinds (484 lines, 3 tests)
│       ├── operations.rs        # execute_feature() — all 20 features (2,050 lines, 60 tests)
│       ├── sketch.rs            # 7 entity types + 19 constraints (882 lines, 4 tests)
│       ├── sketch_ops.rs        # [NEW] Entity walker, trim, bevel, offset, bezier, intersections (1,238 lines, 13 tests)
│       ├── tools.rs             # [NEW] StatefulTool trait, ToolStateMachine, 4 tools (770 lines, 6 tests)
│       ├── snap.rs              # [NEW] SnapEngine (7 types) + PickingColorMap (569 lines, 6 tests)
│       ├── snapshot.rs          # [NEW] SketchSnapshot, ToolSnapshotManager, ClipboardBuffer (519 lines, 4 tests)
│       ├── history.rs           # HistoryManager, Command, undo/redo (297 lines, 4 tests)
│       ├── tessellation.rs      # B-Rep → TriMesh, quality, smoothing, STL (1,291 lines, 11 tests)
│       ├── document.rs          # Document, EventBus, DependencyGraph (679 lines, 5 tests)
│       ├── naming.rs            # Persistent topological naming (5-cascade) (534 lines, 5 tests)
│       └── lib.rs               # Module declarations + 30+ re-exports (77 lines)
│
├── constraint-solver/   # 2D sketch + 3D assembly constraint solving (1,915 lines, 30 tests)
│   └── src/
│       ├── solver2d.rs          # 4-stage cascade: DogLeg → LM → BFGS → NR (859 lines)
│       ├── solver3d.rs          # AssemblySolver: Mate, Align, Offset, Angle, Fixed (890 lines, 22 tests)
│       └── types.rs             # SolveResult, SolveStatus, SolverConfig (147 lines, 6 tests)
│
├── cam-engine/          # Toolpath generation + G-code + nesting
│   └── src/
│       ├── cnc.rs               # Physics-based CNC estimators (Kienzle, Taylor, etc.)
│       ├── toolpath.rs          # Roughing, finishing, drilling toolpath generators
│       ├── gcode.rs             # G-code generation + post-processors
│       ├── nesting.rs           # 2D rectangular nesting
│       ├── sheet.rs             # Sheet metal estimators (laser, plasma, waterjet)
│       ├── adaptive.rs          # [NEW] Adaptive/trochoidal clearing
│       ├── pocket.rs            # [NEW] Offset-spiral pocketing
│       ├── contour.rs           # [NEW] Profile contouring with lead-in/out
│       ├── simulation.rs        # [NEW] Material removal simulation (dexels)
│       └── collision.rs         # [NEW] Tool-stock-part collision detection
│
├── renderer/            # wgpu PBR renderer
│   └── src/
│       ├── gpu.rs               # wgpu device, queue, pipeline management
│       ├── pipeline.rs          # Render passes (Z-prepass, G-buffer, lighting, etc.)
│       ├── camera.rs            # Camera (perspective/ortho, orbit controls)
│       ├── scene.rs             # Scene graph, render objects
│       └── viewport.rs          # Viewport (resize, pick, gizmos)
│
├── editor-shell/        # ECS orchestrator, 22 commands, 21 tools (1,301 lines, 22 tests)
│   └── src/
│       ├── app.rs               # EditorApp with tool lifecycle (13 tests)
│       ├── commands.rs          # 22 EditorCommand variants + dispatch (9 tests)
│       ├── ecs.rs               # World: entities, sketches, snap, clipboard, snapshots
│       ├── input.rs             # Input handling (mouse, keyboard, touch)
│       ├── lib.rs               # Module declarations + re-exports
│       └── ui.rs                # UI panel types
│
├── dfm-analyzer/        # DFM checks (wall thickness, draft, undercuts)
├── plugin-runtime/      # WASM plugin host (wasmtime)
├── api-gateway/         # REST API (Axum) for cloud mode
├── worker-analysis/     # Background DFM analysis worker
├── worker-cad/          # Background STEP import worker
├── worker-cam/          # Background CAM worker
└── wasm-meshkit/        # Client-side WASM mesh processing
```

## 12.2 APIs Between Modules

| Caller | Callee | API Surface |
|--------|--------|-------------|
| `editor-shell` | `cad-kernel` | `execute_feature()`, `BRepModel::create_box()`, `tessellate()` |
| `editor-shell` | `cad-kernel` | Sketch: `Sketch::new()`, `add_entity()`, `add_constraint()`, `remove_entity()` |
| `editor-shell` | `cad-kernel` | Sketch ops: `trim_segment()`, `bevel_at_point()`, `offset_path()`, `find_paths()` |
| `editor-shell` | `cad-kernel` | Tools: `StatefulTool`, `ToolStateMachine`, `ToolInput`, `ToolModalResult` |
| `editor-shell` | `cad-kernel` | Snap: `SnapEngine::find_snap()`, `PickingColorMap`, `SnapConfig` |
| `editor-shell` | `cad-kernel` | Snapshot: `SketchSnapshot`, `ToolSnapshotManager`, `ClipboardBuffer` |
| `editor-shell` | `constraint-solver` | `SketchSolver::solve()`, `AssemblySolver::solve()` |
| `editor-shell` | `renderer` | `Viewport::render()`, `Camera::orbit()` |
| `editor-shell` | `cam-engine` | `generate_roughing_toolpath()`, `generate_gcode()` |
| `editor-shell` | `dfm-analyzer` | `DfmAnalyzer::analyze()` |
| `cad-kernel` | `shared-types` | `Transform3D`, `TriMesh`, `BoundingBox3D`, `Parameter` |
| `cam-engine` | `shared-types` | `Toolpath`, `GCodeProgram`, `CncMaterial` |
| Tauri commands | `editor-shell` | `EditorCommand` dispatch via Tauri IPC |

## 12.3 Data Ownership Rules

| Data | Owner | Shared via |
|------|-------|-----------|
| B-Rep models | `cad-kernel::World` | `&BRepModel` references |
| Tessellation meshes | `cad-kernel::World` (cached in `BRepModel.mesh`) | Cloned to GPU buffers |
| Constraint state | `constraint-solver::SketchSolver` | Owned per-sketch |
| Feature tree | `cad-kernel::FeatureTree` | `&Feature` references |
| Undo history | `cad-kernel::HistoryManager` | Opaque; access via `undo()`/`redo()` |
| Toolpaths | `cam-engine` | Stored in `CamSetup`; cloned for G-code generation |
| GPU buffers | `renderer` (wgpu) | Not shared; upload only |
| React UI state | `editorStore` (Zustand) | Read by components; modified via actions |

## 12.4 Threading Model

```
Main thread (UI + ECS tick):
    ├── Poll input events
    ├── Run ECS systems (single-threaded schedule)
    ├── Submit render commands to GPU
    └── Process Tauri IPC messages

Rayon thread pool (N-2 threads):
    ├── Constraint solving (par_iter over clusters)
    ├── Tessellation (par_iter over faces)
    ├── DFM analysis (par_iter over checks)
    ├── Boolean face classification (par_iter over faces)
    └── STEP parsing (par_iter over entity groups)

Tokio async runtime (4 threads):
    ├── File I/O (import/export)
    ├── Network (cloud sync, API calls)
    ├── Database (SQLite/PostgreSQL)
    └── Plugin runtime (WASM execution)

GPU (thousands of shader invocations):
    ├── Rendering pipeline
    ├── BVH construction
    ├── Picking (ray-triangle)
    └── Future: compute shaders for tessellation/booleans
```

## 12.5 Caching Model

| Cache | Key | Value | Invalidation |
|-------|-----|-------|-------------|
| Feature output | `feature.id` | `BRepModel` | When feature inputs change (generation counter) |
| Tessellation | `face.id + geometry_generation` | `FaceMesh` | When face geometry changes |
| BVH | `body.id + mesh_generation` | `BvhTree` | When any face mesh changes |
| GPU buffers | `body.id + mesh_generation` | Vertex/Index buffers | When tessellation changes |
| Snap candidates | `sketch.id + geometry_generation` | `SpatialHash2D` | When sketch entities change |
| STEP parse | file content hash (SHA-256) | Parsed entity index | File changes on disk |

---

# 13) Deliverables

## 13.1 Glossary

| Term | Definition |
|------|-----------|
| **B-Rep** | Boundary Representation — solid defined by its bounding surfaces (faces, edges, vertices) |
| **NURBS** | Non-Uniform Rational B-Spline — parametric curve/surface representation |
| **P-curve** | Parametric curve in the UV domain of a surface (trim curve) |
| **Coedge** | Directed use of an edge by a face loop (same edge appears in two coedges, one per adjacent face) |
| **Wire** | Ordered chain of edges forming a closed or open boundary |
| **Shell** | Closed set of faces forming the boundary of a solid |
| **DOF** | Degrees of Freedom — number of independent variables remaining after constraints |
| **Chordal deviation** | Maximum distance between tessellation and true surface |
| **Topological naming** | Persistent identification of B-Rep entities that survives model edits |
| **Rollback bar** | Feature tree pointer allowing time-travel through modeling history |
| **Dexels** | Discrete Z-height columns used for CAM material removal simulation |
| **SAH** | Surface Area Heuristic — BVH build quality metric |
| **LBVH** | Linear BVH — fast BVH construction via Morton code sorting |
| **Medial axis** | Locus of centers of maximal inscribed circles in a 2D shape (for adaptive clearing) |
| **Engagement angle** | Arc of tool contact with material during milling (controls cutting force) |
| **Kienzle model** | Empirical cutting force model: $F_c = k_{c1.1} \cdot b \cdot h^{1-m_c}$ |
| **Taylor equation** | Tool life prediction: $V \cdot T^n = C$ |
| **Loewen-Shaw** | Cutting temperature model: $\theta = \frac{0.754 \mu V F_c}{k \sqrt{l_c}}$ |
| **Altintas** | Chatter stability limit: $a_{lim} = \frac{-1}{2 K_f \cdot \text{Re}[G(j\omega_c)]}$ |

## 13.2 Formal Constraint Equations + Jacobian Strategy

**Upgrade path from current `solver2d.rs`:**

The current solver uses **finite-difference Jacobians** and **damped Newton (JᵀJ)**
with LU decomposition. The upgrade has three phases:

| Phase | Change | Expected Improvement |
|-------|--------|---------------------|
| 1. Analytic Jacobians | Replace `compute_jacobian()` with per-constraint analytic ∂f/∂x | 2× faster solve, better convergence near solution |
| 2. Levenberg-Marquardt | Replace damped-Newton with LM trust-region (Section 4.3.3) | Handles under-constrained systems, fewer divergences |
| 3. Cluster decomposition | Solve independent subgraphs separately (Section 4.3.2) | 60-80% speedup for typical sketches |

**All constraint equations and their Jacobian entries are tabulated in Section 4.2.**

## 13.3 Detailed Data Structures

All data structures are defined in the sections above. Summary of key types:

| Module | Key Types |
|--------|-----------|
| `shared-types` | `Transform3D`, `BoundingBox3D`, `TriMesh`, `FaceRef`, `EdgeRef`, `Parameter`, `SheetMaterial`, `CncMaterial`, `Toolpath`, `GCodeProgram` |
| `cad-kernel` | `BRepModel`, `BRepTopology`, `BRepVertex`, `BRepEdge`, `BRepFace`, `BRepShell`, `Feature`, `FeatureTree`, `Sketch`, `SketchConstraint`, `SketchDimension` |
| `constraint-solver` | `SketchSolver`, `Point2D`, `Constraint2D`, `AssemblySolver`, `AssemblyConstraint`, `SolveResult`, `SolverConfig` |
| `cam-engine` | `CamSetup`, `CamOperation`, `Tool`, `StockDefinition`, `CncParams` |

## 13.4 Algorithm Pseudocode Summary

| Algorithm | Section | Key Idea |
|-----------|---------|----------|
| Incremental constraint solving | 4.3.3 | LM with analytic reductions → numeric solve on residual clusters |
| B-Rep boolean pipeline | 6.3 | BVH broadphase → face-face intersect → split → classify → select → stitch → heal |
| Tessellation caching | 7.1 | Per-face mesh cache keyed by geometry generation counter |
| STEP ingestion + sewing | 8.1 | Stream-parse → geometry build → topology build → sew → validate → tessellate |
| Adaptive clearing CAM | 9.2 | Medial axis → trochoidal path with constant engagement angle → depth layers |

## 13.5 UX Event-State Machines

### Sketching State Machine

```
                 ┌─────────────────┐
                 │      IDLE       │
                 │  (no sketch)    │
                 └────────┬────────┘
                          │ click face / plane
                          ▼
                 ┌─────────────────┐
                 │  SKETCH_ACTIVE  │◄─────── Esc (deselect tool)
                 │  (2D mode on    │
                 │   sketch plane) │
                 └────────┬────────┘
                          │ select draw tool
              ┌───────────┼───────────────┐
              ▼           ▼               ▼
     ┌────────────┐ ┌──────────┐  ┌────────────┐
     │ DRAW_LINE  │ │DRAW_CIRCLE│  │ DRAW_ARC   │
     │            │ │           │  │            │
     │ click →    │ │ click →   │  │ click →    │
     │ first pt   │ │ center    │  │ center/p1  │
     │ click →    │ │ drag →    │  │ click →    │
     │ second pt  │ │ radius    │  │ through pt │
     │ → entity   │ │ → entity  │  │ click →    │
     │   created  │ │   created │  │ end pt     │
     └────────────┘ └──────────┘  └────────────┘
              │           │               │
              └───────────┼───────────────┘
                          ▼
                 ┌─────────────────┐
                 │  CONSTRAINT     │
                 │  INFERENCE      │──→ auto-add inferred constraints
                 │  (on entity     │
                 │   creation)     │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  SKETCH_ACTIVE  │──→ continue drawing or
                 │                 │    Esc → EXIT_SKETCH
                 └─────────────────┘
```

### Selection State Machine

```
     ┌───────────────┐
     │    IDLE       │
     │  (nothing     │
     │   selected)   │
     └───────┬───────┘
             │ click on entity
             ▼
     ┌───────────────┐
     │  SELECTED     │───── Shift+click → toggle additional selection
     │  (one or more │───── Ctrl+click → add to selection
     │   entities)   │───── click empty → IDLE
     └───────┬───────┘
             │ double-click feature in tree
             ▼
     ┌───────────────┐
     │ EDIT_FEATURE  │───── dialog open, live preview
     │               │───── OK → commit, return to SELECTED
     │               │───── Cancel → revert, return to SELECTED
     └───────────────┘
```

### Feature Preview and Commit

```
     ┌──────────────────┐
     │ FEATURE_DIALOG   │
     │                  │
     │ parameters shown │
     │ live preview on  │
     └────────┬─────────┘
              │ any parameter change
              ▼
     ┌──────────────────┐
     │ PREVIEW_UPDATE   │
     │                  │
     │ execute_feature  │
     │ with new params  │
     │ (temporary)      │
     │                  │
     │ show ghost mesh  │
     └────────┬─────────┘
              │ OK / Enter
              ▼
     ┌──────────────────┐
     │ COMMIT           │
     │                  │
     │ push to history  │
     │ rebuild downstream│
     │ update display   │
     └──────────────────┘
```

## 13.6 Failure Mode Table

| Subsystem | Failure Mode | Probability | Impact | Mitigation |
|-----------|-------------|-------------|--------|------------|
| Solver | Divergence during drag | Low (< 1%) | UX jitter | LM damping + fallback to last good state |
| Solver | Over-constrained system | Medium (user error) | Red constraints | Conflict finder + suggest removal |
| Boolean | Near-coincident faces | Medium | Failed boolean | Widen tolerance + retry; report if still failing |
| Boolean | Sliver faces in result | Medium | Downstream failures | Post-boolean heal pass |
| Fillet | Radius too large | Medium (user error) | Feature failure | Report max feasible radius; offer to reduce |
| STEP import | Non-manifold input | High (common in real files) | Holes in mesh | Auto-heal pipeline with tolerance cascade |
| STEP import | Missing geometry entities | Medium | Partial import | Report missing entities; import what's available |
| Tessellation | Degenerate face (zero area) | Low | Invalid mesh | Skip face; log warning |
| CAM | Tool gouges part | Low | Bad G-code | Collision check before post; report gouge locations |
| CAM | Feed rate exceeds machine limit | Low | Machine alarm | Clamp to max feed in post-processor |
| Naming | Reference lost after edit | Medium | Feature turns red | Geometric fallback matching + user re-link dialog |

## 13.7 Performance Plan for 500 MB+ Files

### CPU Strategy

| Stage | Approach | Expected Time |
|-------|----------|---------------|
| Parse | Streaming lexer, 16 MB chunks | 1 ms/MB → 500 ms |
| Geometry build | Rayon par_iter over entities | 5 ms/MB → 2.5 s |
| Topology build | Single-threaded (dependency order) | 3 ms/MB → 1.5 s |
| Sewing | Par_iter over free edge pairs | 10 ms/MB → 5 s |
| Tessellation | Par_iter over faces (16 threads) | 20 ms/MB → 10 s (÷16 = ~0.6 s) |
| **Total** | | **~10 s** |

### Memory Strategy

| Data | Size for 500 MB STEP | Strategy |
|------|---------------------|----------|
| Raw STEP text | 500 MB | Stream; never fully in RAM |
| Parsed entity index | ~200 MB | Compact representation |
| B-Rep topology | ~300 MB | Persistent; evict distant parts |
| Tessellation meshes | ~500 MB | LOD: coarse in RAM, fine on GPU |
| GPU VRAM | 256-512 MB | Frustum-culled; LOD streaming |
| **Peak CPU RAM** | **~1.5 GB** | Within 4 GB budget |

### LOD Strategy

| Distance from camera | LOD level | Triangle budget |
|---------------------|-----------|-----------------|
| < 100 mm | 0 (full) | 100% of tessellation |
| 100-1000 mm | 1 | 25% (decimate) |
| 1000-10000 mm | 2 | 5% (decimate) |
| > 10000 mm | 3 (bbox only) | 12 triangles (box wireframe) |

LOD transitions use **screen-space error metric**: if the projected size of the
chordal deviation is < 1 pixel, use the coarser LOD.

### Threading for Large Files

```
import_large_step(file, progress):
    // Phase 1: Parse (streaming, single thread + async I/O)
    entities = stream_parse(file)                         // ~500 ms

    // Phase 2: Build geometry (Rayon, parallel over entities)
    geometry = rayon::par_iter(entities)                   // ~2.5 s
        .map(|e| build_geometry(e))
        .collect()

    // Phase 3: Build topology (sequential, but fast)
    topology = build_topology(geometry)                    // ~1.5 s

    // Phase 4: Sew (Rayon, parallel over edge pairs)
    sew(topology)                                         // ~5 s

    // Phase 5: Tessellate (Rayon, parallel over faces)
    // Show progressive results: every 1000 faces, update viewport
    let (sender, receiver) = channel()
    rayon::scope(|s| {
        for chunk in topology.faces.chunks(1000):
            s.spawn(|_| {
                meshes = chunk.par_iter().map(tessellate).collect()
                sender.send(meshes)
            })
    })
    // Main thread receives chunks and uploads to GPU incrementally
```

---

# 14) Sketch Operations & Tool System (New Modules)

> **Added: June 2025** — Four new modules implementing all 14 Blender/CAD_Sketcher patterns
> (see `BLENDER-CAD-SKETCHER-PATTERNS.md` for the source research).

## 14.1 Sketch Operations (`cad-kernel/src/sketch_ops.rs` — 1,238 lines, 13 tests)

### Entity Walker & Path Discovery

The `EntityWalker` builds an adjacency graph from sketch entities via shared connection points:

```
connection_points(entity) → Vec<Point2D>
  - LineSegment → [start, end]
  - Arc         → [start_point, end_point]
  - Circle      → [] (no connection points — closed)
  - Rectangle   → [corner0, corner1, corner2, corner3]
  - Point       → [self]

EntityWalker::new(sketch) → builds point→entity adjacency HashMap
find_paths(sketch)        → Vec<SketchPath> via recursive walk
main_path(paths)          → longest or first-closed path
```

**SketchPath** stores: entity IDs, direction flags, cyclic boolean.

### Intersection Computation

`intersect_entities(a, b) → Vec<Point2D>`:

| Pair | Method | Max Solutions |
|------|--------|:------------:|
| Line–Line | Parametric `t = (b₂×d₁ - b₁×d₂) / (a₁×d₂ - a₂×d₁)` + range check | 1 |
| Line–Circle | Quadratic `at² + bt + c = 0`, discriminant check | 2 |
| Line–Arc | Same as line–circle + angle range filter | 2 |
| Circle–Circle | Radical line method: `d`, `a`, `h` computation | 2 |

### Trim Algorithm

```
trim_segment(sketch, segment_id, click_position) → TrimResult

1. Collect all intersections of segment with every other entity
2. Sort intersections by distance_along_segment(click_position, intersection)
3. Find bracketing pair (closest non-endpoint intersections on each side)
4. Split segment: create new segment between each pair
5. Copy applicable constraints (skip: Ratio, Midpoint for non-first)
6. Remap constraint references to new segments
7. Remove original segment (unless reused for first piece)
```

Returns: `TrimResult { new_segment_ids: Vec<Uuid>, removed_ids: Vec<Uuid> }`

### Bevel/Fillet Algorithm

```
bevel_at_point(sketch, point_id, radius) → BevelResult

1. Find 2 connected non-construction segments at point
2. compute_offset(segment, radius) → parallel offset representation
3. Intersect offset curves → nearest intersection = arc center
4. project_point(center, onto_segment) → tangent points
5. Create arc entity between tangent points
6. Add tangent constraints (arc ↔ segment₁, arc ↔ segment₂)
```

Returns: `BevelResult { arc_id: Uuid, tangent_point_ids: [Uuid; 2] }`

### Offset Algorithm

```
offset_path(sketch, entity_id, distance) → OffsetResult

1. EntityWalker finds connected path containing entity_id
2. For each segment: compute parallel offset
3. For consecutive offset segments: compute junction intersection
4. Create new entities at offset positions
5. For cyclic paths: close the offset contour
```

Returns: `OffsetResult { new_entity_ids: Vec<Uuid> }`

### Bézier Conversion

```rust
to_bezier(entity) → Vec<CubicBezierSegment>
// Optimal arc-to-cubic: q = (4/3) × tan(π / (2n))
// Arcs > 90° subdivided into n segments

tessellate_bezier(segments, resolution) → Vec<Point2D>
// de Casteljau subdivision at given resolution
```

### Sketch-to-Mesh Conversion

```rust
sketch_profile_to_mesh(sketch) → TriMesh
// Uses EntityWalker to find closed profiles
// Ear-clipping triangulation on 2D polygon
// Returns TriMesh for GPU display
```

## 14.2 Stateful Tool Framework (`cad-kernel/src/tools.rs` — 770 lines, 6 tests)

### Architecture (Blender StatefulOperator Pattern)

```
StatefulTool trait           ← Tool-specific logic
    └── ToolStateMachine     ← Generic state traversal + lifecycle
        └── EditorApp        ← Integration with editor-shell commands

Tool lifecycle:
  invoke() → create_snapshot → prefill states
  MODAL LOOP: handle_input(state, input) → Running | NextState | Finished | Cancelled
  finish() → commit entities + constraints
  cancel() → restore snapshot
```

### Core Trait

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

### Tool Input Events

```rust
pub enum ToolInput {
    MouseMove { position: Point2D },
    Click { position: Point2D },
    Release { position: Point2D },
    EntityHover { entity_id: Uuid },
    NumericInput { value: f64 },
    Tab,       // Cycle X/Y substates
    Escape,    // Cancel
    Enter,     // Confirm
    Undo,      // In-tool undo (pop snapshot)
}
```

### Built-In Tools

| Tool | States | Entities Created | Continuous | Description |
|------|:------:|------------------|:----------:|-------------|
| `LineTool` | 2 | LineSegment + 2 Points | ✅ | Chain-draws connected line segments |
| `CircleTool` | 2 | Circle + center Point | ❌ | Center + radius click |
| `ArcTool` | 3 | Arc + center Point | ❌ | Center → start angle → end angle |
| `RectangleTool` | 2 | Rectangle + 2 Points | ❌ | Corner-to-corner |

### Numeric Input System

`NumericInputState`: per-axis text buffers (X, Y). Tab cycles substates, Enter confirms with parsed value, Escape returns to mouse input. Validates against entity bounds.

### Continuous Draw (LineTool)

On `ToolModalResult::ContinuousDraw`:
1. Finish current segment (commit entities)
2. Re-invoke tool with endpoint pre-filled as first state
3. User immediately picks second point of next segment
4. Chain drawing until Escape/Enter

## 14.3 Snap Engine (`cad-kernel/src/snap.rs` — 569 lines, 6 tests)

### Snap Types (Priority Order)

| Priority | Type | Radius | Candidates |
|:--------:|------|:------:|------------|
| 1 | Endpoint | 8 px | Entity endpoints (line start/end, arc endpoints) |
| 2 | Midpoint | 8 px | Segment midpoints |
| 3 | Center | 8 px | Circle/arc centers |
| 4 | Intersection | 8 px | Entity-entity intersection points |
| 5 | Nearest | 6 px | Closest point on any curve |
| 6 | Grid | 4 px | Grid intersections |
| 7 | AxisAlignment | 3 px | Horizontal/vertical alignment with existing points |

### Algorithm

```
find_snap(sketch, cursor, config) → Option<SnapResult>

1. For each enabled snap type (priority order):
   - Collect candidate points from all sketch entities
   - Filter by pixel radius (distance < type.radius)
2. Flatten all candidates
3. Sort by (priority ASC, distance ASC)
4. Return best match
```

### GPU Picking Color Map

```rust
pub struct PickingColorMap {
    entity_to_color: HashMap<Uuid, [u8; 3]>,  // entity → unique RGB
    color_to_entity: HashMap<[u8; 3], Uuid>,   // RGB → entity
}
```

- `register(id)` — assigns next unique RGB color
- `resolve(color)` — O(1) lookup
- `resolve_spiral(colors, center, size)` — fuzzy search matching Blender's `PICK_SIZE=10`:
  walks spiral pattern outward from center pixel, returns first non-background hit

### SnapConfig

```rust
pub struct SnapConfig {
    pub enabled: bool,
    pub endpoint: bool,
    pub midpoint: bool,
    pub center: bool,
    pub intersection: bool,
    pub nearest: bool,
    pub grid: bool,
    pub axis_alignment: bool,
    pub grid_size: f64,
}
```

## 14.4 Snapshot & Clipboard (`cad-kernel/src/snapshot.rs` — 519 lines, 4 tests)

### Sketch Snapshot

```rust
pub struct SketchSnapshot {
    entities: Vec<(Uuid, SketchEntity)>,
    constraints: Vec<(Uuid, SketchConstraint)>,
    entity_order: Vec<Uuid>,
    metadata: SnapshotMetadata,
}

impl SketchSnapshot {
    pub fn from_sketch(sketch: &Sketch) -> Self;
    pub fn restore_to_sketch(&self, sketch: &mut Sketch);
    pub fn to_json(&self) -> String;
    pub fn from_json(json: &str) -> Result<Self, Error>;
    pub fn to_bytes(&self) -> Vec<u8>;
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, Error>;
}
```

### Tool Snapshot Manager

```rust
pub struct ToolSnapshotManager {
    stack: Vec<SketchSnapshot>,  // max depth: 50
}

impl ToolSnapshotManager {
    pub fn push_snapshot(&mut self, sketch: &Sketch);
    pub fn pop_and_restore(&mut self, sketch: &mut Sketch) -> bool;
    pub fn pop_snapshot(&mut self) -> Option<SketchSnapshot>;
    pub fn peek(&self) -> Option<&SketchSnapshot>;
    pub fn depth(&self) -> usize;
    pub fn clear(&mut self);
}
```

Usage: `push_snapshot()` before each tool operation, `pop_and_restore()` on Ctrl+Z during tool modal.

### Clipboard with Dependency Resolution

```rust
pub struct ClipboardBuffer {
    entities: Vec<(Uuid, SketchEntity)>,
    constraints: Vec<(Uuid, SketchConstraint)>,
}

impl ClipboardBuffer {
    pub fn from_selection(sketch: &Sketch, selected_ids: &[Uuid]) -> Self;
    // Resolves dependencies: if a LineSegment is selected,
    // its start/end Points are automatically included.
    // Constraints are included iff ALL referenced entities are in the set.

    pub fn paste_into(sketch: &mut Sketch, offset: Point2D) -> Vec<Uuid>;
    // Remaps all UUIDs to fresh values (avoid collisions).
    // Applies position offset to all geometric data.
    // Returns list of newly created entity IDs.
}
```

## 14.5 Tauri IPC Commands for Sketch System

All sketch operations are exposed via 37 Tauri commands in `apps/desktop/src-tauri/commands.rs` (692 lines):

| Category | Commands | Count |
|----------|----------|:-----:|
| Sketch CRUD | create, delete, list, set_active, get_active | 5 |
| Entities | add, remove, list, get, connections | 5 |
| Constraints | add, remove | 2 |
| Paths | get_paths, get_main_path | 2 |
| Operations | trim, bevel, offset | 3 |
| Snap | compute, configure | 2 |
| Tools | activate, send_input | 2 |
| Snapshot | take, restore | 2 |
| Clipboard | copy, paste | 2 |
| **Sketch Total** | | **25** |

Plus 12 general commands (primitives, entities, history, file I/O, analysis, mesh) = **37 total**.

## 14.6 Performance Contracts

| Operation | Target | Achieved | Method |
|-----------|--------|----------|--------|
| Snap computation | < 1 ms | ✅ | Priority-sorted candidate collection |
| Tool state transition | < 0.5 ms | ✅ | Direct enum dispatch |
| Trim (50 entities) | < 5 ms | ✅ | O(n) intersection scan + sort |
| Bevel | < 2 ms | ✅ | Analytic offset intersection |
| Offset path (20 segments) | < 10 ms | ✅ | O(n) parallel offset + junction |
| Snapshot create/restore | < 1 ms | ✅ | Deep clone of entity/constraint vecs |
| Clipboard paste (100 entities) | < 5 ms | ✅ | UUID remap + bulk insert |
| PickingColorMap resolve | < 0.01 ms | ✅ | HashMap O(1) lookup |

---

*Document generated: June 2025*
*Project: r3ditor — Open-Source Parametric CAD/CAM Editor*
*License: AGPL-3.0*
