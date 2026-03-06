# Salome Platform — Advanced Algorithms & Techniques Reference

> Extracted from [SalomePlatform](https://github.com/SalomePlatform) GitHub repositories (GEOM, SMESH, SHAPER, KERNEL, MEDCOUPLING).
> Purpose: Reference for implementing r3ditor's CAD/CAM kernel in Rust.

---

## Table of Contents

1. [SHAPER — Parametric Modeling Engine](#1-shaper--parametric-modeling-engine)
2. [SHAPER — Sketch Constraint Solver (PlaneGCS)](#2-shaper--sketch-constraint-solver-planegcs)
3. [SHAPER — Topological Naming / Persistent Selection](#3-shaper--topological-naming--persistent-selection)
4. [GEOM — Geometry Algorithms](#4-geom--geometry-algorithms)
5. [SMESH — Mesh Generation Algorithms](#5-smesh--mesh-generation-algorithms)
6. [SMESH — Mesh Quality Metrics](#6-smesh--mesh-quality-metrics)
7. [SMESH — Smoothing & Adaptation](#7-smesh--smoothing--adaptation)
8. [SMESH — Viscous Layers & Boundary Layers](#8-smesh--viscous-layers--boundary-layers)
9. [MEDCOUPLING — Field Interpolation & Remapping](#9-medcoupling--field-interpolation--remapping)
10. [KERNEL — Architecture Patterns](#10-kernel--architecture-patterns)
11. [Key Takeaways for r3ditor](#11-key-takeaways-for-r3ditor)

---

## 1. SHAPER — Parametric Modeling Engine

### 1.1 Feature Lifecycle Pattern

Every modeling operation is a **Feature** (`ModelAPI_Feature`). This is the fundamental unit of parametric modeling.

```
ModelAPI_Feature
  ├── getKind()          → unique string ID ("Extrusion", "BooleanCut")
  ├── initAttributes()   → declares all input attributes
  ├── execute()          → computes results from attributes (THE CORE)
  ├── compute(attrId)    → compute derived attributes
  ├── attributeChanged() → react to interactive changes (preview)
  ├── isPreviewNeeded()  → whether to recompute on every edit
  └── isMacro()          → if true, deleted after execution (e.g. Import)
```

**Result types:**
- `ModelAPI_ResultBody` — solid/shell results
- `ModelAPI_ResultConstruction` — sketch/construction results
- `ModelAPI_ResultPart` — sub-document parts

**Attribute types for feature parameters:**

| Type | Usage |
|------|-------|
| `AttributeDouble` | Radius, angle, distance |
| `AttributeInteger` | Counts |
| `AttributeString` | Creation method selection |
| `AttributeBoolean` | Flags |
| `AttributeSelection` | Single shape reference |
| `AttributeSelectionList` | Multiple shape references |
| `AttributeReference` | Feature-to-feature reference |
| `AttributeRefList` | List of feature references |

Key attribute properties:
- `isArgument()` — if true, changes trigger re-execution
- `isImmutable()` — programmatic changes don't trigger events
- `refsToMe()` — back-references (for dependency tracking)

### 1.2 Dependency Graph & Auto-Recomputation

`Model_Update` is the automatic recomputation engine — an event listener singleton.

**Core data structures:**
```
myModified:  Map<Feature, Set<Feature>>  // features needing update + reasons
myProcessed: Map<Feature, int>           // cycle detection counter (limit: 100)
```

**Update algorithm:**
1. `processEvent()` — listens for `OBJECT_UPDATED`, `OBJECT_CREATED`, `OP_FINISH`
2. `addModified(feature, reason)` — marks feature as needing update, **recursively propagates** to all referencing features via `refsToMe()`
3. `processFeatures()` — iterates `myModified` until empty
4. `processFeature()`:
   - Validates data, checks disabled state
   - Recursively processes all dependencies via `allReasons()`
   - Calls `updateArguments()` (evaluates expressions, updates selections)
   - Runs validators via `ValidatorsFactory::validate()`
   - Calls `feature->execute()` in try-catch
   - Updates results and sends redisplay events
5. `allReasons()` — collects all features a given feature depends on by iterating `referencesToObjects()` where `isArgument() == true`

**Key insight:** Dependencies are NOT stored as an explicit graph — they are **derived** from attribute references at update time.

**Cycle detection:** Counter per feature, limit 100 iterations.

### 1.3 Undo/Redo Architecture

Delegated to OCAF's built-in transaction mechanism:
- `Model_Document::undo()` / `redo()`
- `UNDO_LIMIT = 1000`
- Each feature operation is wrapped in a transaction
- Features tracked by `TDF_Label` tags

### 1.4 Event System

Central pub-sub message bus (`Events_Loop` singleton):

| Event | Purpose |
|-------|---------|
| `EVENT_OBJECT_CREATED` | Object was created |
| `EVENT_OBJECT_UPDATED` | Object was modified |
| `EVENT_OBJECT_DELETED` | Object was deleted |
| `EVENT_OBJECT_TO_REDISPLAY` | Needs visual update |
| `EVENT_ORDER_UPDATED` | Feature order changed |
| `EVENT_PREVIEW_BLOCKED` | Preview computation blocked |
| `EVENT_PREVIEW_REQUESTED` | Preview computation requested |
| `EVENT_AUTOMATIC_RECOMPUTATION_ENABLE` | Toggle auto-recompute |

### 1.5 Plugin System

XML-driven feature discovery:
1. `Config_ModuleReader` reads `plugins.xml`
2. Builds `featuresInFiles` map (feature ID → plugin library)
3. `Session::createFeature("ExtrusionCut")` → looks up plugin → loads library → calls factory

### 1.6 Composite Features & Boolean Composites

`CompositeFeature` — features that own sub-features (Sketch owns elements, Part owns features).

Boolean composites combine generation + boolean:
- `ExtrusionCut` = Extrusion + Boolean Cut
- `ExtrusionFuse` = Extrusion + Boolean Fuse
- `RevolutionCut` = Revolution + Boolean Cut
- `RevolutionFuse` = Revolution + Boolean Fuse

### 1.7 Concealment Pattern

Boolean operations "conceal" their input shapes — consumed solids disappear from the browser. Tracked via `addBackReference()` / `removeBackReference()` on results.

### 1.8 Validation Framework

Per-feature and per-attribute validators registered via `ValidatorsFactory`:
- `registerNotObligatory(featureKind, attrId)` — marks optional
- `isCase(feature, attrId)` — checks attribute applicability for current creation method
- Named validators: `ValidatorBooleanSelection`, `ValidatorFilletSelection`, `ValidatorExtrusionBoundaryFace`, etc.

---

## 2. SHAPER — Sketch Constraint Solver (PlaneGCS)

### 2.1 Architecture

SHAPER uses **PlaneGCS** (originally from FreeCAD) for 2D geometric constraint solving.

```
SketchSolver_Manager (orchestrator)
  └── SketchSolver_Group (per-sketch constraint groups)
       └── PlaneGCSSolver_Storage (entity/constraint storage)
            └── PlaneGCSSolver_Solver (wraps GCS::System)
                 └── GCS::System (equation system)
```

### 2.2 Solver Algorithm — Cascading Fallback

The solver tries algorithms in this order:

1. **DogLeg** (default) — Trust-region method, good for well-conditioned problems
2. **LevenbergMarquardt** — Falls back if DogLeg fails
3. **BFGS** — Quasi-Newton method, last resort

```
SolveStatus:
  STATUS_OK | STATUS_INCONSISTENT | STATUS_EMPTYSET |
  STATUS_DEGENERATED | STATUS_FAILED | STATUS_UNKNOWN
```

**Tolerance:** `1.0e-10`

### 2.3 Supported Entities

| Entity | Solver Representation |
|--------|----------------------|
| Point | `(x, y)` parameters |
| Line | Two points |
| Circle | Center point + radius parameter |
| Arc | Center + start + end + radius + start/end angles |
| Ellipse | Center + focus + semi-axes parameters |
| Elliptic Arc | Same as ellipse + arc angles |
| B-Spline | Control points + weights + knots |

### 2.4 Supported Constraints (25 types)

| Constraint | Description |
|------------|-------------|
| Coincidence | Point-point, point-on-curve, middle-point |
| Distance | Point-point, point-line, horizontal, vertical |
| Radius | Circle/arc radius |
| Angle | Line-line angle |
| Fixed | Lock position |
| Horizontal / Vertical | Line direction |
| Parallel / Perpendicular | Line-line relations |
| Symmetric | Mirror symmetry about line |
| Equal | Equal length/radius |
| Tangent | Curve-curve tangency |
| Collinear | Lines on same infinite line |
| Multi Rotation / Translation | Pattern constraints |
| Offset | Curve offset |

### 2.5 Key Implementation Details

- **DOF tracking:** Computed via `EigenDenseQR` algorithm for free parameter detection
- **Fictive constraints:** Added when only movement constraints exist (stabilization)
- **Auxiliary constraints:** Auto-added for arcs (center/radius/angle consistency), ellipses, B-splines
- **Conflict detection:** `collectConflicting()` returns list of conflicting constraints
- **Underconstrained detection:** `getUnderconstrainedGeometry()` finds free geometry

### 2.6 Constraint Mapping Pattern

High-level SketchPlugin constraints map to low-level GCS constraints via factory:

```
ConstraintCoincidence → SketchSolver_ConstraintCoincidence
  → GCS::ConstraintP2PCoincident (for point-point)
  → GCS::ConstraintPointOnLine (for point-on-line)
  → GCS::ConstraintPointOnCircle (for point-on-circle)
```

Each wrapper holds one or more `GCS::Constraint` objects + a scalar value parameter.

---

## 3. SHAPER — Topological Naming / Persistent Selection

### 3.1 The Problem

When a parametric model recomputes, topology changes (faces/edges/vertices get new internal IDs). The naming service tracks which sub-shape was selected across recomputations.

### 3.2 Algorithm Types (Cascading Priority)

The selector tries algorithms in order of priority:

| Priority | Type | Strategy | Name Format |
|----------|------|----------|-------------|
| 1 | **Primitive** | Direct TNaming reference | `ContextName/ShapeName` |
| 2 | **Modify** | Track through evolution history | `Name1&Name2` |
| 3 | **FilterByNeighbors** | Identify by adjacent shapes | `(Neighbor1)(Neighbor2)` |
| 4 | **Intersect** | Intersection of higher-dim shapes | `[Face1][Face2]v` |
| 5 | **Container** | Compound of individually-named shapes | Recursive |
| 6 | **WeakName** | Fallback: geometrical index | `_new_weak_name_N` |

### 3.3 Core Interface

```
Selector_Algo:
  select(context, value)     → identify how to name a sub-shape
  store()                    → persist naming to labels
  restore()                  → restore from labels
  restoreByName(name, type)  → resolve string back to shape
  solve(context)             → resolve named shape in new context
  name(generator)            → generate human-readable name
  value()                    → current resolved shape
```

### 3.4 TNaming Integration

Uses OCCT's TNaming for shape evolution tracking:
- `TNaming_NamedShape` — stores shapes on labels
- `TNaming_NewShapeIterator` — tracks shape evolution forward
- Evolution types: `PRIMITIVE`, `GENERATED`, `MODIFY`, `DELETE`, `SELECTED`
- `TNaming_Builder` — creates named shapes

### 3.5 Key Insight for r3ditor

The cascading approach (primitive → modify → neighbors → intersect → weak) provides **graceful degradation** when perfect naming is impossible. This is essential for robust parametric modeling.

---

## 4. GEOM — Geometry Algorithms

### 4.1 Boolean Operations

| Operation | OCCT API | Notes |
|-----------|----------|-------|
| Fuse (Union) | `BRepAlgoAPI_Fuse` | Merges solids |
| Cut (Subtract) | `BRepAlgoAPI_Cut` | Removes tool from object |
| Common (Intersect) | `BRepAlgoAPI_Common` | Keeps intersection |
| Section | `BRepAlgoAPI_Section` | Curves at intersection |
| Partition | `GEOMAlgo_Splitter` | Splits by tools (custom SALOME algo) |

Pre-check: `BOPAlgo_CheckerSI` for self-intersection detection.

### 4.2 Fillet & Chamfer (7 variants each)

**3D Fillet:**
- `BRepFilletAPI_MakeFillet` — standard fillet on edges of solid
- **1D Fillet (Wire):** Custom Newton solver for vertex rounding on 2D wires
  - Iteratively adjusts parameter to match requested radius
  - Builds arc segments connecting trimmed edges

**2D Fillet:**
- `ChFi2d_FilletAPI` — fillet on planar face edges

**Chamfer types:**
- By two distances (D1, D2)
- By distance + angle
- Applied via `BRepFilletAPI_MakeChamfer`

### 4.3 Extrusion / Revolution / Pipe / Loft

| Operation | OCCT API | Variants |
|-----------|----------|----------|
| Extrusion (Prism) | `BRepPrimAPI_MakePrism` | 6 types: by vector, 2 directions, up-to-shape, draft prism |
| Revolution | `BRepPrimAPI_MakeRevol` | By angle, full revolution |
| Pipe | `BRepOffsetAPI_MakePipe` + `MakePipeShell` | 5 types: simple, bi-normal, shell bi-normal, shells+freenet, path+locations |
| Loft (ThruSections) | `BRepOffsetAPI_ThruSections` | Through multiple profiles |
| Filling | `BRepOffsetAPI_MakeFilling` | Surface from boundary curves |

**Draft Prism:** `BRepFeat_MakeDPrism` — extrusion with draft angle.

### 4.4 Healing & Repair (11 operations)

| Operation | Purpose | OCCT API |
|-----------|---------|----------|
| ShapeProcess | Configurable repair pipeline | `ShapeProcessAPI_ApplySequence` |
| Sewing | Stitch faces into shell | `BRepBuilderAPI_Sewing` |
| FillHoles | Close holes in shells | `ShapeAnalysis_FreeBounds` → `BRepBuilderAPI_MakeFace` |
| CloseContour | Close open wires | `ShapeFix_Wire` |
| DivideEdge | Split edge at parameter | `ShapeUpgrade_WireDivide` |
| SameParameter | Fix edge parameterization | `BRep_Builder::SameParameter` |
| FuseCollinear | Merge collinear edges | `ShapeUpgrade_UnifySameDomain` |
| SuppressFaces | Remove faces from solid | `ShapeBuild_ReShape` |
| RemoveIntWires | Remove internal wires | Iterate → check → remove |
| RemoveExtraEdges | Remove redundant edges | `ShapeUpgrade_UnifySameDomain` |
| LimitTolerance | Clamp geometry tolerance | `ShapeFix_ShapeTolerance` |

### 4.5 Measurement & Inspection (20+ operations)

| Measurement | Technique |
|-------------|-----------|
| Mass properties | `BRepGProp::VolumeProperties` / `SurfaceProperties` / `LinearProperties` |
| Principal inertia | `GProp_PrincipalProps` from `GProp_GProps` |
| Bounding box | `Bnd_Box` via `BRepBndLib::Add` |
| Min distance | `BRepExtrema_DistShapeShape` |
| Curvature | `GeomLProp_CLProps` (curve) / `GeomLProp_SLProps` (surface) |
| Tolerance stats | `ShapeAnalysis_ShapeTolerance` — min/max/avg |
| Point on curve | `BRepAdaptor_Curve` + `GCPnts_AbscissaPoint` |
| Normal at point | `GeomLProp_SLProps::Normal()` |
| Proximity | `BRepExtrema_ShapeProximity` |

### 4.6 Shape Analysis & Recognition

| Analysis | Purpose |
|----------|---------|
| CheckShape | `BRepCheck_Analyzer` — validate B-Rep integrity |
| CheckConformity | `BOPAlgo_ArgumentAnalyzer` — pre-check for boolean ops |
| SelfIntersection | `BRepAlgoAPI_Check` — detect self-intersection |
| CanonicalRecognition | Detect if surface is plane/sphere/cone/cylinder/line/circle/ellipse |
| ShapeFinder | `GEOMAlgo_FinderShapeOn2` — find shapes on/in/out of a surface (custom SALOME) |

### 4.7 Transformation Operations

| Transform | OCCT API |
|-----------|----------|
| Translate | `gp_Trsf::SetTranslation` + `BRepBuilderAPI_Transform` |
| Rotate | `gp_Trsf::SetRotation` |
| Mirror | `gp_Trsf::SetMirror` (point/axis/plane) |
| Scale | `gp_Trsf::SetScale` |
| Offset | `BRepOffsetAPI_MakeOffset` (2D) / `BRepOffset_MakeOffset` (3D) |
| Linear Pattern | Translate × N |
| Circular Pattern | Rotate × N |

### 4.8 Partition & Decomposition

| Operation | Purpose |
|-----------|---------|
| Partition | `GEOMAlgo_Splitter` — split objects by tool shapes |
| HalfPartition | Partition by plane |
| GlueFaces | Merge coincident faces (`GEOMAlgo_GlueAnalyser` → `GEOMAlgo_Gluer2`) |
| Explode | Decompose compound → sub-shapes by type |
| Block operations | Multi-transform/explode for structured hex-meshable shapes |
| Shape filtering | `GEOMAlgo_FinderShapeOn2` — spatial queries on shapes |

---

## 5. SMESH — Mesh Generation Algorithms

### 5.1 1D Algorithms (Edge Meshing)

| Algorithm | Hypotheses | Technique |
|-----------|------------|-----------|
| **Regular_1D** | NumberOfSegments, LocalLength, MaxLength, Arithmetic1D, GeometricProgression, StartEndLength, Deflection1D, AutomaticLength | Standard edge discretization |
| **Adaptive_1D** | minSize, maxSize, deflection | Octree-based (`SegSizeTree`) spatial adaptive sizing driven by geometric deflection |
| **CompositeSegment_1D** | Same as Regular_1D | Meshes composite edges as single segments |
| **Python_1D** | PythonSplit1D | User-defined Python function for node distribution |

**Adaptive_1D details:**
- Uses `SMESH_Octree`-based `SegSizeTree` for spatial queries
- Initial triangulation via `BRepMesh_IncrementalMesh`
- Grading factor: 0.7 (controls size transition rate)
- Formula: `nbSegFinal = max(1, floor(nbSegs + 0.5))`

### 5.2 2D Algorithms (Surface Meshing)

| Algorithm | Element Type | Technique |
|-----------|-------------|-----------|
| **Quadrangle_2D** | Quad/Tri | Transfinite mapping with 5 quad types |
| **QuadFromMedialAxis_1D2D** | Quad | Medial axis decomposition + elliptic smoothing |
| **MEFISTO_2D** | Triangle | Delaunay triangulation |
| **Projection_2D** | Any | Projects mesh from source to target face via barycentric coords |

**Quadrangle_2D quad types:**
- `QUAD_STANDARD` — standard mapping
- `QUAD_TRIANGLE_PREF` — prefer triangles at irregular vertices
- `QUAD_QUADRANGLE_PREF` — prefer quads at irregular vertices
- `QUAD_QUADRANGLE_PREF_REVERSED` — reversed pref
- `QUAD_REDUCED` — reduced element count

**Quality metric:** `crit1() = myOppDiff + myIsFixedCorner`, `crit2() = myQuartDiff + mySumAngle`

### 5.3 3D Algorithms (Volume Meshing)

| Algorithm | Element Type | Technique |
|-----------|-------------|-----------|
| **Hexa_3D** | Hexahedra | Transfinite interpolation (Péronnet 1999) |
| **Prism_3D** | Prism/Penta | Sweeps 2D mesh along normals |
| **Cartesian_3D** | Hex/Polyhedra | Body-fitted Cartesian grid |
| **Penta_3D** | Pentahedra | Exactly 6 faces / 12 edges validation |
| **CompositeHexa_3D** | Hexahedra | Hex meshing on composite-sided boxes |
| **PolyhedronPerSolid_3D** | Polyhedra | One polyhedron per solid from skin mesh |
| **HexaFromSkin_3D** | Hexahedra | Hex mesh from 2D skin (no CAD required) |
| **QuadToTriaAdaptor** | Tet/Pyramid | Converts quads to tris with pyramid insertion |

### 5.4 Cartesian Body-Fitted Algorithm (Detail)

This is a powerful algorithm worth studying:

**Steps:**
1. Lines of Cartesian grid intersect geometry boundary
2. For each cell, count outside nodes:
   - All outside → skip
   - Too small → skip
   - All inside → add hexahedron
   - Mixed → create polyhedra fitting the boundary
3. Optional viscous layer insertion

**Grid spacing computation:**
- Divides range into 1000 sections
- Evaluates spacing function: `nbSegments[i] = nbSegments[i-1] + min(1, sectionLen/spacing)`
- Cell count: `nbCells = max(1, floor(nbSegments.back() + 0.5))`
- Correction factor: `corr = nbCells / nbSegments.back()`
- Supports forced points with tolerance `minLen × 1e-3`

**Parameters:**
- `sizeThreshold = 4.0` — cell size threshold for boundary inclusion
- `coords[3]` — explicit node coordinates per axis
- `spaceFunctions[3]` — spacing functions `f(t)` per axis
- `axisDirs[9]` — custom axes (3×3 matrix)
- TBB parallelization: `tbb::parallel_for` for performance

### 5.5 Polygon Triangulation (Ear-Clipping)

`SMESH_Triangulate` — Ear-clipping for polygon faces:
- `PolyVertex` linked list with `TriaArea()`, `IsInsideTria()`, `Delete()`
- Finds ears with positive area and no interior vertices
- `minArea = 1e-6 × ΣA / (n-2)`
- Special: BiQuad_Triangle → 6 tris, BiQuad_Quadrangle → 8 tris

### 5.6 Delaunay Triangulation (UV Space)

`SMESH_Delaunay` — Boundary-aware Delaunay in UV parameter space:
- Wraps OCCT's `BRepMesh_Delaun`
- `FindTriangle()` — walks triangulation via barycentric coordinates
- UV scale compensation: measures U/V ranges vs actual surface distances over 100 divisions

---

## 6. SMESH — Mesh Quality Metrics

### 6.1 Aspect Ratio (2D)

**Triangle:**
$$Q = \alpha \cdot h \cdot p / S$$
where $\alpha = \frac{\sqrt{3}}{6}$, $h$ = max edge length, $p$ = half-perimeter, $S$ = area

**Quadrangle:**
$$Q = \alpha \cdot L \cdot C_1 / C_2$$
where $\alpha = \sqrt{1/32}$, $L$ = max of edges & diagonals, $C_1 = \sqrt{\sum L_i^2}$, $C_2$ = min triangle area

Range: $[1.0, \infty)$; $1.0$ = ideal

Reference: Bouhamau, Frey & George (1999)

### 6.2 Aspect Ratio (3D)

**Tetrahedron:** Uses VTK's formula:
$$Q = \text{coeff} \cdot h \cdot \sum A / V$$
where $\text{coeff} = \frac{\sqrt{2}}{12}$

**Hexahedron:** `hexQualityByHomardMethod(P)` — HOMARD-specific quality measure

**Pyramid/Penta:** Decomposed into tetrahedra, maximum quality taken

### 6.3 Warping

**For 4-node quads:**
$$H = (\vec{m} - \vec{c}) \cdot \hat{N}$$
$$\text{result} = \arcsin(|H/L|) \cdot 180/\pi$$
where $L = \min(\text{edge}) \times 0.5$

**Warping3D** extends to volumes via `ProcessVolumeElement()`

### 6.4 Skew

**Triangle:** $\max|\pi/2 - \theta_{\text{skew}}|$
**Quadrangle:** Angle between opposite midpoint lines vs $\pi/2$
Range: $[0, \pi/2]$ in degrees

### 6.5 Deflection2D

Distance between mesh face and underlying geometry surface:
- `ShapeAnalysis_Surface` for projection
- `GeomLib_IsPlanarSurface` for plane detection

### 6.6 Complete Functor List

`MinimumAngle`, `Area`, `Volume`, `MaxElementLength2D/3D`, `Length2D/3D`, `MultiConnection`, `MultiConnection2D`, `FreeEdges`, `FreeBorders`, `FreeNodes`, `FreeFaces`, `BareBorderVolume/Face`, `OverConstrainedVolume/Face`, `NodeConnectivityNumber`, `Taper`

---

## 7. SMESH — Smoothing & Adaptation

### 7.1 Laplacian Smoothing

Pulls each node toward the arithmetic mean of connected neighbors:
$$\vec{p}_i' = \frac{1}{N}\sum_{j \in \text{adj}(i)} \vec{p}_j$$

- Produces least total edge length
- Fastest convergence
- Iterates until `maxIterations` exceeded OR all elements achieve `aspectRatio ≤ targetAspectRatio`

### 7.2 Centroidal Smoothing

Pulls each node toward the area-weighted centroid of surrounding elements:
$$\vec{p}_i' = \frac{\sum_e A_e \cdot \vec{c}_e}{\sum_e A_e}$$

- Produces more uniform element sizes
- Better for mesh quality than Laplacian

### 7.3 Parametric vs 3D Space

- **Parametric smoothing:** Moves nodes in surface UV parameter space — safe for curved surfaces
- **3D space smoothing:** Moves nodes in Cartesian coordinates — only for planar meshes

### 7.4 Elliptic Smoothing

Specialized smoothing for quad meshes from medial axis decomposition (`ellipticSmooth()` in QuadFromMedialAxis).

### 7.5 Internal Usage Patterns

| Context | Method | Details |
|---------|--------|---------|
| Prism projection | CENTROIDAL first, fallback to LAPLACIAN ×10 | `projectBottomToTop()` |
| Face projection | CENTROIDAL if concave (angle < -5°), else LAPLACIAN | `fixDistortedFaces()` |
| Viscous layers | CENTROIDAL ×3 iterations | `improve()` step |
| Internal nodes | TFI + surface projection | `FixInternalNodes()` |

### 7.6 Adaptive Meshing

**Adaptive_1D:** Octree-based adaptive 1D meshing driven by geometric deflection
- Parameters: `minSize=1e-10`, `maxSize=1e+10`, `deflection=1e-2`, `grading=0.7`

**MG-Adapt:** Field-based size map adaptation (wraps MeshGems)
- Time step selection, MED↔mesh format conversion, background size maps

**HOMARD:** Uniform and adaptive refinement
- Conforming refinement with boundary types (cylinder, torus, sphere, cone)

---

## 8. SMESH — Viscous Layers & Boundary Layers

### 8.1 Layer Height Calculation

$$h_0 = \frac{T \cdot (f - 1)}{f^n - 1}$$
$$h_i = \sum_{j=0}^{i} h_0 \cdot f^j$$

where $T$ = total thickness, $f$ = stretch factor, $n$ = number of layers

### 8.2 Extrusion Methods (3D)

| Method | Description |
|--------|-------------|
| `SURF_OFFSET_SMOOTH` | Extrude along surface normal + smooth |
| `FACE_OFFSET` | Translate along average normal to intersection with neighbor face |
| `NODE_OFFSET` | Translate along average normal per node |

### 8.3 Viscous Layers 2D Pipeline

7-step pipeline:
1. `findEdgesWithLayers()` — identify boundary edges
2. `makePolyLines()` — construct offset polylines
3. `inflate()` — grow layers outward (`stepSize × 1.25` increment)
4. `fixCollisions()` — detect/resolve self-intersections via `SegmentTree`
5. `shrink()` — adjust opposing boundaries
6. `refine()` — create actual layer elements
7. `improve()` — CENTROIDAL smoothing ×3 iterations

### 8.4 Layer Edge Structure

```
_LayerEdge:
  _uvOut, _uvIn        — outer/inner UV coordinates
  _length2D            — 2D length
  _isBlocked           — collision flag
  _normal2D            — extrusion direction
  _len2dTo3dRatio      — scale factor
  _ray                 — inflation ray for collision detection
  _uvRefined           — refined position after layer creation
```

---

## 9. MEDCOUPLING — Field Interpolation & Remapping

### 9.1 Remapper Three-Phase Workflow

```
Phase 1: prepare(srcMesh, tgtMesh, method)  → compute intersection matrix
Phase 2: transfer(srcField)                 → multiply by matrix
Phase 3: reverse transfer (optional)
```

**Methods:** `P0P0`, `P0P1`, `P1P0`, `P1P1`
- P0 = cell-centered (piecewise constant)
- P1 = node-centered (piecewise linear)

### 9.2 Intersection Algorithms

| Algorithm | Dimension | Technique |
|-----------|-----------|-----------|
| `TransformedTriangle` | 3D | Grandy's algorithm — transforms target tet to unit tet, clips source faces |
| `TriangulationIntersector` | 2D | Triangulates intersection polygon of two triangles |
| `ConvexIntersector` | 2D | Convex polygon intersection |
| `PlanarIntersector` | 3D→2D | Projects 3D surfaces to 2D for intersection |
| `SplitterTetra` | 3D | Handles coplanar face cases |

**Spatial acceleration:** `BBTree` (bounding box tree) for filtering candidate pairs.

### 9.3 NatureOfField Semantics

| Nature | Meaning | Remapping |
|--------|---------|-----------|
| `IntensiveMaximum` | Temperature-like (no scaling by area/volume) | $f_t = W \cdot f_s$ |
| `IntensiveConsevation` | Intensive with conservation | $f_t = W' \cdot f_s$ |
| `ExtensiveMaximum` | Force-like (scales with area/volume) | $f_t = W \cdot f_s$ |
| `ExtensiveConservation` | Total quantity conserved | $f_t = W_c \cdot f_s$ |

### 9.4 Gauss Quadrature

`MEDCouplingGaussLocalization` — reference coords + Gauss coords + weights.
Pre-defined rules for: SEG2/3, TRI3/6/7, QUAD4/8/9, TETRA4/10, HEXA8/20/27, PENTA6/15, PYRA5/13

### 9.5 Field Operations

| Category | Operations |
|----------|------------|
| Arithmetic | +, −, ×, ÷, ^, abs, negate, sqrt, exp, log |
| Vector | dot, cross, magnitude, normalize, eigenValues, eigenVectors |
| Analysis | integral, normL1, normL2, normMax, average, min, max |
| Functional | fillFromAnalytic, applyFunc, applyFuncOnThis |
| Spatial | getValueOnMulti, buildSubMeshData |

### 9.6 Spatial Discretization Types

| Type | Support |
|------|---------|
| `ON_CELLS` (P0) | Piecewise constant on cells |
| `ON_NODES` (P1) | Piecewise linear, values at nodes |
| `ON_GAUSS_PT` | Values at Gauss integration points |
| `ON_GAUSS_NE` | Values at Gauss points using element shape functions |
| `ON_NODES_FE` | Finite element nodal values |

---

## 10. KERNEL — Architecture Patterns

### 10.1 Document/Study Data Model

Tree-structured data model similar to OCAF:
- `DF_Document` → `DF_Label` → `DF_Attribute`
- Each label can have child labels + typed attributes
- Persistence: HDF5 file format
- RAII locking pattern for thread safety

### 10.2 Observer & Notification (Two-Level)

1. **Document-level:** `SALOMEDSImpl_AbstractCallback` for data changes
2. **Component-level:** CORBA CosNotification event channel for inter-component messaging

### 10.3 Container & Component System

Factory pattern for plugin loading:
- `GiveContainer` with find/start/get modes
- Supports C++ / Python / Executable component types
- Load balancing policies: `first`, `cycl`, `altcycl`, `best`

### 10.4 Resource Management

- XML-cataloged resources with multi-step filtering
- Resource types: file, CORBA object, data

### 10.5 Logging Architecture

```
LocalTraceBufferPool → background SALOMETraceCollector → CORBA Logger server
```

Ring buffer (`LocalTraceBufferPool`): 1024 entries of 256 chars, background flush thread.

---

## 11. Key Takeaways for r3ditor

### 11.1 Must-Implement Patterns

| Pattern | Source | Priority |
|---------|--------|----------|
| **Feature Pattern** | SHAPER | Critical — every operation is a Feature with `initAttributes()` + `execute()` |
| **Dependency Propagation** | SHAPER Model_Update | Critical — derive deps from attribute references, not explicit graph |
| **Topological Naming** | SHAPER Selector | Critical — cascading: primitive → modify → neighbors → intersect → weak |
| **Constraint Solver** | SHAPER PlaneGCS | Critical — DogLeg → LevenbergMarquardt → BFGS fallback |
| **Concealment** | SHAPER | High — boolean ops hide consumed inputs |
| **Event System** | SHAPER Events_Loop | High — pub-sub for decoupling |

### 11.2 Geometry Algorithms to Port

| Algorithm | Source | Complexity |
|-----------|--------|------------|
| Boolean operations (fuse/cut/common/partition) | GEOM + OCCT | Very High |
| Fillet/Chamfer (3D + wire) | GEOM | High |
| Extrusion with draft angle | GEOM | Medium |
| Pipe/sweep along path with bi-normal | GEOM | High |
| Loft through sections | GEOM | High |
| Shape healing pipeline | GEOM | High |
| Measurement/inspection | GEOM | Medium |
| Canonical recognition | GEOM | Medium |

### 11.3 Meshing Algorithms to Port

| Algorithm | Source | Use Case |
|-----------|--------|----------|
| Cartesian body-fitted | SMESH | Quick preview mesh |
| Adaptive 1D (octree) | SMESH | Edge discretization |
| Transfinite quad mapping | SMESH | Structured surface mesh |
| Laplacian/Centroidal smoothing | SMESH | Mesh quality improvement |
| Viscous layers | SMESH | CFD boundary layers |
| Quality metrics (aspect ratio, warping, skew) | SMESH | Mesh validation |
| Ear-clipping triangulation | SMESH | Polygon tessellation |

### 11.4 Solver Techniques

| Technique | Application |
|-----------|-------------|
| DogLeg trust-region | Primary sketch constraint solver |
| Levenberg-Marquardt | Fallback nonlinear solver |
| BFGS quasi-Newton | Last-resort solver |
| EigenDenseQR | DOF counting / rank detection |
| Newton iteration (1D fillet) | Wire fillet radius fitting |

### 11.5 Data Architecture

| Concept | Salome Approach | r3ditor Equivalent |
|---------|-----------------|---------------------|
| Document | OCAF TDF_Label tree | Rust tree with typed nodes |
| Undo/Redo | OCAF transactions | Command pattern with snapshots |
| Persistence | HDF5 / OCAF binary | Serde + custom binary format |
| Shape tracking | TNaming_NamedShape | Custom shape evolution tracker |
| Plugin loading | XML + dynamic library | Rust trait objects + WASM plugins |
| Event bus | Events_Loop singleton | Rust channels / observer pattern |

### 11.6 Mathematical Formulas Reference

**Aspect Ratio (Triangle):**
$$Q = \frac{\sqrt{3}}{6} \cdot \frac{h \cdot p}{S}$$

**Aspect Ratio (Quad):**
$$Q = \sqrt{\frac{1}{32}} \cdot \frac{L \cdot \sqrt{\sum L_i^2}}{\min(A_{\triangle})}$$

**Viscous Layer Height:**
$$h_0 = \frac{T(f-1)}{f^n - 1}, \quad h_i = \sum_{j=0}^{i} h_0 f^j$$

**Laplacian Smoothing:**
$$\vec{p}_i' = \frac{1}{|N(i)|}\sum_{j \in N(i)} \vec{p}_j$$

**Centroidal Smoothing:**
$$\vec{p}_i' = \frac{\sum_e A_e \vec{c}_e}{\sum_e A_e}$$

**Warping (Quad):**
$$W = \arcsin\left(\frac{|(\vec{m}-\vec{c})\cdot\hat{N}|}{0.5 \cdot \min(\text{edge})}\right) \cdot \frac{180}{\pi}$$

**Cartesian Grid Sizing:**
$$n_{\text{cells}} = \max\left(1, \left\lfloor n_{\text{segments}} + 0.5 \right\rfloor\right)$$

---

*This document serves as a comprehensive reference for implementing CAD/CAM kernel algorithms in r3ditor, extracted from the Salome Platform's open-source codebase (LGPL licensed).*
