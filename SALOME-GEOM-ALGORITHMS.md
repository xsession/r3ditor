# SALOME Platform GEOM Module — Comprehensive Algorithm Reference

> **Repository**: [SalomePlatform/GEOM](https://github.com/SalomePlatform/GEOM) (GitHub)  
> **Language**: C++ on OpenCASCADE Technology (OCCT) B-Rep kernel  
> **Architecture Pattern**: Driver pattern — each algorithm category has a `*Driver` class (inherits `GEOM_BaseDriver`) with an `Execute()` method. Operations classes (`GEOMImpl_I*Operations`) form the API layer. Interface classes (`GEOMImpl_I*`) manage function parameters stored in the OCAF document.

---

## Table of Contents

1. [Boolean Operations](#1-boolean-operations)
2. [Fillet & Chamfer](#2-fillet--chamfer)
3. [Extrusion / Revolution / Pipe / Sweep / Loft](#3-extrusion--revolution--pipe--sweep--loft)
4. [Healing & Repair](#4-healing--repair)
5. [Measurement & Inspection](#5-measurement--inspection)
6. [Shape Analysis & Conformity](#6-shape-analysis--conformity)
7. [Transformations (Translate / Rotate / Mirror / Scale / Offset / Pattern)](#7-transformations)
8. [Partition & Decomposition](#8-partition--decomposition)

---

## 1. Boolean Operations

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_BooleanDriver.cxx` | Core algorithm driver |
| `src/GEOMImpl/GEOMImpl_IBooleanOperations.cxx` | API layer |
| `src/GEOMImpl/GEOMImpl_IBoolean.hxx` | Parameter interface |
| `src/GEOMImpl/GEOMImpl_Types.hxx` | Type constants |
| `src/BooleanGUI/BooleanGUI.h` | GUI enum |

### Algorithms

#### 1.1 Common (Intersection) — `BOOLEAN_COMMON` (type 1)
- **Purpose**: Compute the common volume/area shared by two shapes.
- **OCCT API**: `BRepAlgoAPI_Common`
- **Approach**: Decomposes compound shapes via `GEOMUtils::AddSimpleShapes()`, then performs pairwise boolean common. Supports fuzzy tolerance parameter for near-coincident geometry.

#### 1.2 Cut (Subtraction) — `BOOLEAN_CUT` (type 2)
- **Purpose**: Subtract one shape from another.
- **OCCT API**: `BRepAlgoAPI_Cut`
- **Approach**: For faces/shells, calls `makeCompoundShellFromFaces()` to pre-process. Decomposes compounds, performs pairwise cut. Supports self-intersection checking via `BOPAlgo_CheckerSI` before the operation.

#### 1.3 Fuse (Union) — `BOOLEAN_FUSE` (type 3)
- **Purpose**: Merge two or more shapes into one.
- **OCCT API**: `BRepAlgoAPI_Fuse`
- **Approach**: After fusion, calls `GEOMImpl_GlueDriver::GlueFaces()` to merge coincident faces at tolerance. Optional `RemoveExtraEdges()` post-processing. `TNaming_CopyShape::CopyTool` copies shapes before modification to preserve originals.

#### 1.4 Section (Intersection Curve) — `BOOLEAN_SECTION` (type 4)
- **Purpose**: Compute intersection curves between shapes.
- **OCCT API**: `BRepAlgoAPI_Section`
- **Approach**: Sets `Approximation(Standard_True)` and computes PCurves on both shapes for accurate intersection representation.

#### 1.5 List Variants — `BOOLEAN_COMMON_LIST` (5), `BOOLEAN_FUSE_LIST` (6), `BOOLEAN_CUT_LIST` (7)
- **Purpose**: Operate on lists of shapes simultaneously rather than pairwise.
- **Approach**: Same underlying OCCT APIs, but iterate over `TColStd_HSequenceOfTransient` of shapes.

### Common Parameters
- **Fuzzy parameter**: Tolerance for near-coincident geometry
- **Self-intersection check**: Optional `BOPAlgo_CheckerSI` pre-check
- **Remove extra edges**: Optional post-processing for fuse

---

## 2. Fillet & Chamfer

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_FilletDriver.cxx` | 3D fillet |
| `src/GEOMImpl/GEOMImpl_Fillet1dDriver.cxx` | 1D fillet (on wires) |
| `src/GEOMImpl/GEOMImpl_Fillet2dDriver.cxx` | 2D fillet (on faces) |
| `src/GEOMImpl/GEOMImpl_ChamferDriver.cxx` | Chamfer |
| `src/GEOMImpl/GEOMImpl_ILocalOperations.cxx` | API layer |
| `src/GEOMImpl/GEOMImpl_IChamfer.hxx` | Chamfer parameter interface |
| `src/GEOMImpl/GEOMImpl_Fillet1d.cxx` | Newton's method fillet solver |

### Algorithms

#### 2.1 3D Fillet — `GEOMImpl_FilletDriver`
- **Purpose**: Round edges of a 3D solid.
- **OCCT API**: `BRepFilletAPI_MakeFillet`
- **Types**:
  - `FILLET_SHAPE_ALL` — all edges, single radius
  - `FILLET_SHAPE_EDGES` — selected edges, single radius
  - `FILLET_SHAPE_FACES` — edges of selected faces, single radius
  - `FILLET_SHAPE_EDGES_2R` — selected edges, two radii (R1, R2)
  - `FILLET_SHAPE_FACES_2R` — face edges, two radii
- **Approach**: Iterates `TopExp_Explorer` to collect edges/faces. Uses `SetRadius(R)` or `SetRadius(R1, R2, ...)` per contour/edge.

#### 2.2 1D Fillet (Wire Fillet) — `GEOMImpl_Fillet1dDriver`
- **Purpose**: Fillet vertices within a wire (planar blend arcs).
- **OCCT API**: Custom `GEOMImpl_Fillet1d` class (not standard OCCT)
- **Math**: **Newton's method** (`performNewton`) for finding fillet arc parameters. `performInterval` and `processPoint` subdivide parameter space.
- **Approach**: Maps vertices to adjacent edges (`aMapVToEdges`). For each vertex with exactly 2 edges, computes a supporting plane (`takePlane`), constructs `GEOMImpl_Fillet1d(edge1, edge2, plane)`, calls `Perform(radius)` to get the blend arc. Tracks edge modifications via `TopTools_DataMapOfShapeShape`. Uses `ShapeFix_Wire` for wire reordering.

#### 2.3 2D Fillet (Face Fillet) — `GEOMImpl_Fillet2dDriver`
- **Purpose**: Fillet vertices on a planar face.
- **OCCT API**: `BRepFilletAPI_MakeFillet2d`
- **Approach**: Operates on `TopAbs_FACE` shapes, adds fillets at specified vertices.

#### 2.4 Chamfer — `GEOMImpl_ChamferDriver`
- **Purpose**: Bevel edges with flat cuts.
- **OCCT API**: `BRepFilletAPI_MakeChamfer`
- **Types**:
  - `CHAMFER_SHAPE_ALL` — symmetric distance D on all edges
  - `CHAMFER_SHAPE_EDGE` — D1, D2 on edge between two faces
  - `CHAMFER_SHAPE_EDGE_AD` — distance D + angle on edge
  - `CHAMFER_SHAPE_FACES` — D1, D2 on face edges
  - `CHAMFER_SHAPE_FACES_AD` — D + angle on face edges
  - `CHAMFER_SHAPE_EDGES` — D1, D2 on selected edges
  - `CHAMFER_SHAPE_EDGES_AD` — D + angle on selected edges
- **Math**: Angle validation: $0 < \alpha < \frac{\pi}{2}$
- **Approach**: Uses `GEOMImpl_Block6Explorer::MapShapesAndAncestors` for edge-face topology mapping.

---

## 3. Extrusion / Revolution / Pipe / Sweep / Loft

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_PrismDriver.cxx` | Extrusion (prism) |
| `src/GEOMImpl/GEOMImpl_RevolutionDriver.cxx` | Revolution |
| `src/GEOMImpl/GEOMImpl_PipeDriver.cxx` | Pipe / sweep (~3500+ lines) |
| `src/GEOMImpl/GEOMImpl_PipePathDriver.cxx` | Pipe path restoration |
| `src/GEOMImpl/GEOMImpl_ThruSectionsDriver.cxx` | Loft through sections |
| `src/GEOMImpl/GEOMImpl_FillingDriver.cxx` | Surface filling from contours |
| `src/GEOMImpl/GEOMImpl_I3DPrimOperations.cxx` | API layer |
| `src/GEOMImpl/GEOMImpl_IPrism.hxx` | Prism parameters |
| `src/GEOMImpl/GEOMImpl_IPipe.hxx` | Pipe parameters |

### Algorithms

#### 3.1 Extrusion (Prism) — `GEOMImpl_PrismDriver`
- **Purpose**: Extrude a profile along a direction.
- **OCCT API**: `BRepPrimAPI_MakePrism`
- **Types**:
  - `PRISM_BASE_VEC_H` — base + direction vector + height
  - `PRISM_BASE_TWO_PNT` — extrude between two points
  - `PRISM_BASE_DXDYDZ` — extrude by displacement vector
  - All have `_2WAYS` variants (extrude in both directions)
  - `DRAFT_PRISM_FEATURE` — boss/cut with draft angle
- **Special Algorithms**:
  - **Scaled Prism (Tapered extrusion)**: Uses `GEOMImpl_PipeDriver::CreatePipeWithDifferentSections` to loft between the base and a scaled copy at the target height.
  - **Draft Prism**: Uses `BRepFeat_MakeDPrism` with angle conversion ($\text{angle} \times \frac{\pi}{180}$). Supports fuse (boss/protrusion) and cut (depression) modes. Handles face orientation inversion.

#### 3.2 Revolution — `GEOMImpl_RevolutionDriver`
- **Purpose**: Create a solid of revolution by rotating a profile around an axis.
- **OCCT API**: `BRepPrimAPI_MakeRevol`
- **Types**:
  - `REVOLUTION_BASE_AXIS_ANGLE` — rotate by specified angle
  - `REVOLUTION_BASE_AXIS_ANGLE_2WAYS` — rotate both directions

#### 3.3 Pipe / Sweep — `GEOMImpl_PipeDriver`
- **Purpose**: Sweep a profile along a path (spine).
- **OCCT API**: `BRepOffsetAPI_MakePipe`, `BRepOffsetAPI_MakePipeShell`
- **Types**:
  - `PIPE_BASE_PATH` — simple pipe sweep
  - `PIPE_DIFFERENT_SECTIONS` — loft different profiles along path
  - `PIPE_SHELL_SECTIONS` — shell sweep with contact/correction
  - `PIPE_SHELLS_WITHOUT_PATH` — multi-section pipes without explicit path
  - `PIPE_BI_NORMAL_ALONG_VECTOR` — sweep with fixed bi-normal direction
- **Key Techniques**:
  - `EvaluateBestSweepMode()` — selects optimal `GeomFill_Trihedron` mode (Frenet, corrected Frenet, discrete)
  - `BuildPipeShell` with fallback to `DiscreteTrihedron` mode on failure
  - `CreatePipeWithDifferentSections` (static) — lofting different profiles along a path
  - `CreatePipeShellsWithoutPath` — multi-section pipe without explicit spine
  - **Group generation** (`CreateGroups1`, `CreateGroups2`) — tracks topology for downstream operations
  - Post-processing: `GlueFaces` with vertex tolerance

#### 3.4 Pipe Path Restoration — `GEOMImpl_PipePathDriver`
- **Purpose**: Reconstruct the spine path from a pipe-like shape.
- **OCCT API**: `BRepOffsetAPI_MiddlePath`
- **Types**: `PIPE_PATH_TWO_BASES`, `PIPE_PATH_TWO_SEQS`

#### 3.5 Loft Through Sections — `GEOMImpl_ThruSectionsDriver`
- **Purpose**: Create a shape by lofting through multiple cross-section profiles.
- **OCCT API**: `BRepOffsetAPI_ThruSections`
- **Types**: `THRUSECTIONS_RULED` (linear interpolation), `THRUSECTIONS_SMOOTHED` (smooth surface)

#### 3.6 Surface Filling — `GEOMImpl_FillingDriver`
- **Purpose**: Create a surface bounded by wire contours.
- **OCCT API**: `BRepOffsetAPI_MakeFilling` (implied, N-sided patch)
- **Parameters**: MinDeg, MaxDeg, Tol2D, Tol3D, NbIter, Method, Approx

---

## 4. Healing & Repair

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_HealingDriver.cxx` | Main healing driver |
| `src/GEOMImpl/GEOMImpl_IHealingOperations.hxx` | API layer |
| `src/GEOMImpl/GEOMImpl_IHealing.hxx` | Parameter interface |
| `src/ShHealOper/ShHealOper_ShapeProcess.cxx/.hxx` | Shape process pipeline |
| `src/ShHealOper/ShHealOper_FillHoles.cxx/.hxx` | Hole filling |
| `src/ShHealOper/ShHealOper_Sewing.cxx/.hxx` | Sewing |
| `src/ShHealOper/ShHealOper_CloseContour.cxx/.hxx` | Contour closing |
| `src/ShHealOper/ShHealOper_EdgeDivide.cxx/.hxx` | Edge splitting |
| `src/ShHealOper/ShHealOper_RemoveFace.cxx` | Face removal |
| `src/ShHealOper/ShHealOper_RemoveInternalWires.cxx` | Internal wire removal |
| `src/ShHealOper/ShHealOper_ChangeOrientation.cxx` | Orientation change |
| `src/ShHealOper/ShHealOper_SplitCurve2d.cxx` | 2D curve splitting |
| `src/ShHealOper/ShHealOper_SplitCurve3d.cxx` | 3D curve splitting |

### Algorithms

#### 4.1 Shape Process — `SHAPE_PROCESS`
- **Purpose**: Apply a configurable sequence of healing operators (fix shape, split curves, fix face size, drop small edges, etc.).
- **OCCT API**: `ShapeProcessAPI_ApplySequence`
- **Approach**: Configurable pipeline — operators, parameters, and values are passed as parallel string arrays. The driver constructs a `ShHealOper_ShapeProcess`, sets operators and parameters, then calls `Perform()`. Copies the shape first via `TNaming_CopyShape::CopyTool` to preserve the original. Detalisation level defaults to `TopAbs_EDGE`.
- **Resource File**: `ShHealing` resource with `ShapeProcess` prefix.

#### 4.2 Suppress Faces — `SUPPRESS_FACES`
- **Purpose**: Remove selected faces from a shape.
- **Approach**: Recursive `SuppressFacesRec()` using `ShHealOper_RemoveFace`. Operates on indexed face selection.

#### 4.3 Close Contour — `CLOSE_CONTOUR`
- **Purpose**: Close gaps in wires by adding line segments or merging vertices.
- **Class**: `ShHealOper_CloseContour`
- **Modes**: By vertex (merge endpoints) or by gap curves (insert line segments). If all edges belong to one face, gap is closed in 2D; otherwise in 3D.
- **OCCT API**: `ShapeAnalysis_Wire` for gap detection (`CheckGap3d`), `ShapeFix_Wire` for wire repair.
- **Approach**: Maps edges-to-faces (`TopExp::MapShapesAndAncestors`), checks if edges share a common face, fills gaps with `Geom_Line`/`Geom2d_Line` segments.

#### 4.4 Remove Internal Wires — `REMOVE_INT_WIRES`
- **Purpose**: Remove internal wire loops from faces.
- **Class**: `ShHealOper_RemoveInternalWires`

#### 4.5 Fill Holes (Remove Holes) — `FILL_HOLES`
- **Purpose**: Fill holes in a shape by creating patch surfaces over open boundaries.
- **Class**: `ShHealOper_FillHoles`
- **Approach**:
  1. Find free boundary wires via `ShapeAnalysis_FreeBounds` (closed and open wires)
  2. Also find free edges not belonging to any face
  3. `prepareWires()` organizes shapes into wire sequences
  4. `buildSurface()` constructs a `Geom_Surface` patch over each wire boundary
  5. `addFace()` creates a face from the surface with proper 2D PCurves
- **Parameters**: Degree, NbPtsOnCur, NbIter, Tol3d, Tol2d, TolAng, TolCrv, MaxDeg, MaxSeg

#### 4.6 Sewing — `SEWING` / `SEWING_NON_MANIFOLD`
- **Purpose**: Stitch together disconnected faces/edges by merging coincident boundaries.
- **Class**: `ShHealOper_Sewing`
- **OCCT API**: `BRepBuilderAPI_Sewing`
- **Approach**: Creates sewing object with tolerance, loads shape, adds sub-shapes, performs sewing. Post-processing: `getShells()` extracts resulting shells, `getWires()` extracts wires. Supports manifold and non-manifold modes. Verification via `isSewed()` comparing sub-shape counts.

#### 4.7 Remove Internal Faces — `REMOVE_INTERNAL_FACES`
- **Purpose**: Remove faces shared between solids (internal partitions).
- **Class**: `GEOMAlgo_RemoverWebs`

#### 4.8 Divide Edge / Add Point on Edge — `DIVIDE_EDGE` / `DIVIDE_EDGE_BY_POINT`
- **Purpose**: Split an edge at specified parameter values or point positions.
- **Class**: `ShHealOper_EdgeDivide`
- **Approach**: Uses `ShapeUpgrade_WireDivide` tool. Can split by parametric value (0-1 coefficient) or by length. Handles PCurves on adjacent faces. Tracks modifications via `ShapeBuild_Edge`.

#### 4.9 Change Orientation — `CHANGE_ORIENTATION`
- **Purpose**: Reverse the orientation of a shape.
- **Class**: `ShHealOper_ChangeOrientation`

#### 4.10 Limit Tolerance — `LIMIT_TOLERANCE`
- **Purpose**: Clamp shape tolerances to a specified maximum value.

#### 4.11 Fuse Collinear Edges — static utility
- **Purpose**: Merge collinear edges into single edges.
- **Function**: `GEOMImpl_HealingDriver::FuseCollinearEdges()`
- **Prerequisite check**: `AreEdgesC1()` — tests if two edges have C1 continuity at their junction.

---

## 5. Measurement & Inspection

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_IMeasureOperations.cxx` | All measurement algorithms |
| `src/GEOMImpl/GEOMImpl_IMeasureOperations.hxx` | Class declaration with `ShapeKind` enum |
| `src/GEOMImpl/GEOMImpl_MeasureDriver.cxx` | Driver for geometry construction from measurements |
| `src/GEOMImpl/GEOMImpl_ShapeProximityDriver.cxx` | Shape proximity driver |
| `src/GEOMImpl/GEOMImpl_PatchFaceDriver.cxx` | Face patching driver |
| `src/MeasureGUI/` | Qt GUI dialogs for measurements |

### Algorithms

#### 5.1 Basic Properties — `GetBasicProperties()`
- **Purpose**: Compute length, surface area, and volume.
- **OCCT API**: `BRepGProp::LinearProperties()`, `BRepGProp::SurfaceProperties()`, `BRepGProp::VolumeProperties()`
- **Math**: Uses `GProp_GProps` mass properties. Length = linear mass, area = surface mass, volume = volumetric mass (iterated over `TopAbs_SOLID` sub-shapes). Accepts tolerance parameter for adaptive Gauss integration.

#### 5.2 Inertia — `GetInertia()`
- **Purpose**: Compute the inertia tensor and principal moments.
- **OCCT API**: `GProp_GProps`, `GProp_PrincipalProps`
- **Output**: 3×3 inertia matrix (I11..I33) and principal moments (Ix, Iy, Iz).

#### 5.3 Bounding Box — `GetBoundingBox()`
- **Purpose**: Compute axis-aligned bounding box.
- **OCCT API**: `Bnd_Box`, `BRepBndLib`
- **Approach**: Copies shape via `BRepBuilderAPI_Copy`, adds to `Bnd_Box`. Precise mode available. Can also construct a box shape (`MakeBoundingBox()`).

#### 5.4 Tolerance — `GetTolerance()`
- **Purpose**: Get min/max tolerances for faces, edges, and vertices.
- **OCCT API**: `ShapeAnalysis_ShapeTolerance` (implied via iteration)
- **Output**: FaceMin, FaceMax, EdgeMin, EdgeMax, VertMin, VertMax

#### 5.5 Minimum Distance — `GetMinDistance()`
- **Purpose**: Compute minimum distance between two shapes.
- **Output**: Distance value + closest points (X1,Y1,Z1) and (X2,Y2,Z2)

#### 5.6 Closest Points — `ClosestPoints()`
- **Purpose**: Find all pairs of closest points between two shapes.

#### 5.7 Angle — `GetAngle()` / `GetAngleBtwVectors()`
- **Purpose**: Compute angle between two lines or two vectors.
- **Math**: Standard dot product angle: $\theta = \arccos\left(\frac{\vec{a} \cdot \vec{b}}{|\vec{a}||\vec{b}|}\right)$

#### 5.8 Centre of Mass — `GetCentreOfMass()`
- **Purpose**: Compute the centroid of a shape.
- **OCCT API**: `GEOMUtils::GetPosition()` → `gp_Ax3.Location()`
- **Driver**: `GEOMImpl_MeasureDriver` with type `CDG_MEASURE`, constructs a vertex at the centroid.

#### 5.9 Normal — `GetNormal()`
- **Purpose**: Compute the surface normal vector at a point on a face.

#### 5.10 Point Coordinates — `PointCoordinates()`
- **Purpose**: Extract X, Y, Z coordinates from a vertex shape.

#### 5.11 Curvature — `CurveCurvatureByParam()`, `CurveCurvatureByPoint()`, `MaxSurfaceCurvatureByParam()`
- **Purpose**: Compute curvature radii of curves and surfaces.
- **OCCT API**: `GeomLProp_CLProps` (curve), `GeomLProp_SLProps` (surface)
- **Math**: For surfaces, computes min/max principal curvatures. Radius = $\frac{1}{\kappa}$. If both curvatures are defined, returns average: $R = \frac{R_1 + R_2}{2}$.

#### 5.12 Shape Proximity — `ShapeProximityCalculator()`
- **Purpose**: Compute proximity (Hausdorff-like distance) between two shapes.
- **Driver**: `GEOMImpl_ShapeProximityDriver`
- **Approach**: Coarse proximity via sampling points, then fine proximity. Configurable sample count via `SetShapeSampling()`.

#### 5.13 Compute Tolerance — `ComputeTolerance()`
- **Purpose**: Compute distance from an edge to a face (edge-face gap).
- **OCCT API**: `BOPTools_AlgoTools::ComputeTolerance()`

#### 5.14 Update Tolerance — `UpdateTolerance()`
- **Purpose**: Minimize tolerances of shapes and sub-shapes as much as possible.
- **Driver**: `GEOMImpl_ConformityDriver` with type `CONFORMITY_UPDATE_TOL`

#### 5.15 WhatIs — `WhatIs()`
- **Purpose**: Get a textual description of a shape's sub-shape counts.
- **Approach**: Iterates through the shape tree, counts each `TopAbs_ShapeEnum` type. Detects degenerated edges.

#### 5.16 KindOfShape — `KindOfShape()`
- **Purpose**: Classify a shape into a geometric kind (sphere, cylinder, box, torus, cone, etc.) and extract its geometric parameters.
- **OCCT API**: `GEOMAlgo_ShapeInfoFiller`
- **Shape kinds**: `SK_SPHERE`, `SK_CYLINDER`, `SK_BOX`, `SK_ROTATED_BOX`, `SK_TORUS`, `SK_CONE`, `SK_POLYHEDRON`, `SK_SOLID`, `SK_SPHERE2D`, plus edge kinds (SEGMENT, CIRCLE, ELLIPSE, ARC_CIRCLE, ARC_ELLIPSE, etc.)
- **Output**: Integer and double arrays describing the shape parameters (center, axis, radii, dimensions).

#### 5.17 Position — `GetPosition()`
- **Purpose**: Get the local coordinate system (origin + axes) of a shape.

#### 5.18 IsGoodForSolid
- **Purpose**: Check if a shell is suitable for creating a solid.

#### 5.19 AreCoordsInside
- **Purpose**: Test whether given coordinates lie inside a shape.

#### 5.20 Patch Face — `PatchFace()`
- **Purpose**: Subdivide a face into simpler patches.
- **Driver**: `GEOMImpl_PatchFaceDriver`

---

## 6. Shape Analysis & Conformity

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_ConformityDriver.cxx/.hxx` | Conformity check driver |
| `src/GEOMImpl/GEOMImpl_IConformity.hxx` | Parameter interface |
| `src/GEOMImpl/GEOMImpl_IMeasureOperations.cxx` | CheckShape, CheckSelfIntersections |
| `src/GEOMUtils/GEOMUtils.cxx` | CheckShape, MeshShape utilities |
| `src/GEOMAlgo/` | GEOMAlgo_ShapeInfoFiller, GEOMAlgo_FinderShapeOn2 |
| `src/GEOM_I/GEOM_ICanonicalRecognition_i.cc` | Canonical shape recognition |
| `src/GEOM_SWIG/conformity.py` | Python CheckConformity wrapper |

### Algorithms

#### 6.1 CheckShape — `CheckShape()`
- **Purpose**: Validate a shape's topological and geometric consistency.
- **OCCT API**: `BRepCheck_Analyzer`
- **Approach**: `BRepCheck_Analyzer(shape, checkGeometry, isExact)`. Returns validity status plus detailed error list.

#### 6.2 CheckConformity — `CheckConformityShape()`
- **Purpose**: Comprehensive analysis for Boolean Operations applicability.
- **OCCT API**: `BOPAlgo_ArgumentAnalyzer`
- **Driver**: `GEOMImpl_ConformityDriver` with type `CONFORMITY_CHECK_SHAPE`
- **Checks performed** (`performAnalyze()`):
  - `CurveOnSurfaceMode()` — curve/surface consistency
  - `SelfInterMode()` — self-intersection detection
  - `SmallEdgeMode()` — small edge detection
- **Sub-analyses** (from `GEOMImpl_IMeasureOperations`):
  - `SelfIntersected2D()` — find all self-intersected 2D curves
  - `InterferingSubshapes()` — find pairs of interfering sub-shapes (V/V, V/E, V/F, E/E, E/F, F/F)
  - `SmallEdges()` — detect edges below minimum size
  - `DistantShapes()` — find shapes separated by more than tolerance

#### 6.3 CheckSelfIntersections — `CheckSelfIntersectionsFast()`
- **Purpose**: Fast self-intersection detection using mesh-based approach.
- **Approach**: Copies shape via `GEOMAlgo_AlgoTools::CopyShape`, meshes it with `GEOMUtils::MeshShape(deflection)`, then checks for mesh intersections.

#### 6.4 Canonical Shape Recognition — `GEOM_ICanonicalRecognition_i`
- **Purpose**: Identify if shapes match canonical forms.
- **Functions**: `isPlane()`, `isSphere()`, `isCone()`, `isCylinder()` — each checks within tolerance and returns geometric parameters (normal, origin, radius, etc.).

#### 6.5 Shapes On Surface/Solid Filtering — `GEOMAlgo_FinderShapeOn2`
- **Purpose**: Find sub-shapes that satisfy spatial relationships with surfaces or solids.
- **Classifiers**: `GEOMAlgo_ClsfBox`, `GEOMAlgo_ClsfQuad`, `GEOMAlgo_ClsfSolid`, `GEOMAlgo_ClsfSurf`
- **States**: `GEOMAlgo_ST_IN`, `GEOMAlgo_ST_OUT`, `GEOMAlgo_ST_ON`, `GEOMAlgo_ST_ONIN`, `GEOMAlgo_ST_ONOUT`, `GEOMAlgo_ST_INOUT`
- **Configurable**: `SetNbPntsMax(100)` controls inner point sampling density.

---

## 7. Transformations

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_ITransformOperations.cxx/.hxx` | API layer for all transforms |
| `src/GEOMImpl/GEOMImpl_TranslateDriver.cxx` | Translation driver |
| `src/GEOMImpl/GEOMImpl_RotateDriver.cxx` | Rotation driver |
| `src/GEOMImpl/GEOMImpl_MirrorDriver.cxx` | Mirror driver |
| `src/GEOMImpl/GEOMImpl_OffsetDriver.cxx` | Offset driver |
| `src/GEOMImpl/GEOMImpl_ScaleDriver.cxx` | Scale driver |
| `src/GEOMImpl/GEOMImpl_PositionDriver.cxx` | Position/placement driver |
| `src/GEOMImpl/GEOMImpl_ProjectionDriver.cxx` | Projection driver |
| `src/GEOMImpl/GEOMImpl_ITranslate.hxx` | Translation parameters |
| `src/GEOMImpl/GEOMImpl_IRotate.hxx` | Rotation parameters |
| `src/GEOMImpl/GEOMImpl_IMirror.hxx` | Mirror parameters |
| `src/GEOMImpl/GEOMImpl_Types.hxx` | Type constants |

### Algorithms

#### 7.1 Translation
- **OCCT API**: `BRepBuilderAPI_Transform` with `gp_Trsf::SetTranslation()`
- **Types**:
  - `TRANSLATE_TWO_POINTS` / `_COPY` (type 1/3) — translate by vector between two points
  - `TRANSLATE_VECTOR` / `_COPY` (type 2/4) — translate along a vector shape
  - `TRANSLATE_XYZ` / `_COPY` (type 7/8) — translate by DX, DY, DZ components
  - `TRANSLATE_1D` (type 5) — **linear pattern**: replicate along vector with step and count
  - `TRANSLATE_2D` (type 6) — **rectangular pattern**: replicate along two vectors with steps and counts
- **Pattern approach**: Builds `TopoDS_Compound`, iterates N times applying cumulative translation transforms via `gp_Trsf`, adds transformed copies.

#### 7.2 Rotation
- **OCCT API**: `BRepBuilderAPI_Transform` with `gp_Trsf::SetRotation()`
- **Types**:
  - `ROTATE` / `ROTATE_COPY` (1/2) — rotate around axis by angle
  - `ROTATE_THREE_POINTS` / `_COPY` (5/6) — rotation defined by three points
  - `ROTATE_1D` (3) — **circular pattern**: replicate by rotation around axis N times (360°/N)
  - `ROTATE_1D_STEP` (7) — circular pattern with explicit angle step
  - `ROTATE_2D` (4) — **cylindrical pattern**: rotate + radial translate, N × M copies

#### 7.3 Mirror (Reflection)
- **OCCT API**: `BRepBuilderAPI_Transform` with `gp_Trsf::SetMirror()`
- **Types**:
  - `MIRROR_PLANE` / `_COPY` (1/2) — reflect across a plane
  - `MIRROR_AXIS` / `_COPY` (3/4) — reflect across an axis (line)
  - `MIRROR_POINT` / `_COPY` (5/6) — reflect through a point (point symmetry)
- **Parameters**: `GEOMImpl_IMirror` stores: Original, Plane, Axis, Point

#### 7.4 Offset
- **Purpose**: Create an offset (equidistant) shape at constant distance from the original surface.
- **OCCT API**: `BRepOffsetAPI_MakeOffsetShape` (implied via driver)
- **Types**:
  - `OFFSET_SHAPE` / `_COPY` (1/2) — standard surface offset
  - `OFFSET_THICKENING` / `_COPY` (3/4) — thicken a shell into a solid
- **Option**: `theJoinByPipes` — join offset surfaces by pipe-like transitions

#### 7.5 Scale
- **Purpose**: Uniform or anisotropic scaling.
- **Types**: `ScaleShape`, `ScaleShapeCopy`, `ScaleShapeAlongAxes`
- **Parameters**: Scale factor (uniform) or factorX/Y/Z (anisotropic), center point

#### 7.6 Position / Placement
- **Purpose**: Move a shape from one coordinate system to another.
- **Functions**:
  - `PositionShape(startLCS, endLCS)` — relocate between local coordinate systems
  - `PositionAlongPath(path, distance, reverse)` — place shape at a parametric position along a path curve

#### 7.7 Projection
- **Purpose**: Project shapes onto surfaces.
- **Types**:
  - `PROJECTION_COPY` (1) — project shape onto target shape
  - `PROJECTION_ON_WIRE` (2) — project point onto wire, get parameter and edge index
  - `PROJECTION_ON_CYLINDER` (3) — project shape onto a cylinder (unwrap/wrap)
- **Cylinder projection**: `projectOnCylinder()` — custom algorithm with radius, start angle, angle length, angle rotation parameters.

#### 7.8 TransformLikeOther
- **Purpose**: Apply the same transformation that was applied to a sample object.
- **Approach**: Inspects the sample object's last function to determine transformation type (TRANSLATE_1D, TRANSLATE_2D, ROTATE_1D, ROTATE_2D), copies parameters to the target function.

---

## 8. Partition & Decomposition

### Files
| File | Role |
|------|------|
| `src/GEOMImpl/GEOMImpl_PartitionDriver.cxx` | Main partition driver |
| `src/GEOMImpl/GEOMImpl_IPartition.hxx` | Partition parameter interface |
| `src/GEOMImpl/GEOMImpl_IBooleanOperations.cxx` | MakePartition, MakeHalfPartition API |
| `src/GEOMImpl/GEOMImpl_GlueDriver.cxx/.hxx` | Face/edge gluing |
| `src/GEOMImpl/GEOMImpl_BlockDriver.cxx` | Block operations (hexahedral solids) |
| `src/GEOMImpl/GEOMImpl_IBlocksOperations.cxx` | Block operations API |
| `src/GEOMImpl/GEOMImpl_IShapesOperations.cxx` | Explode/decompose operations |
| `src/GEOM/GEOM_SubShapeDriver.cxx` | Sub-shape extraction driver |
| `src/GEOMAlgo/GEOMAlgo_Splitter.hxx` | Custom splitter extending BOPAlgo |

### Algorithms

#### 8.1 Partition — `PARTITION_PARTITION` / `PARTITION_NO_SELF_INTERSECTIONS`
- **Purpose**: Split shapes by tool shapes (planes, surfaces, other solids).
- **OCCT API**: `GEOMAlgo_Splitter` (extends BOPAlgo general fuse)
- **Approach**:
  1. Copy all input shapes via `TNaming_CopyShape::CopyTool` (preserves originals)
  2. Maintain `aCopyMap` for history tracking (original → copy mapping)
  3. `PrepareShapes()` — decomposes compounds into simple shapes based on limit type
  4. Add shapes as arguments, tools as tools to `GEOMAlgo_Splitter` (PS)
  5. Optional: `CheckSelfIntersection()` via `BOPAlgo_CheckerSI` pre-check
  6. Set fuzzy parameter if specified, then `PS.Perform()`
  7. Post-process: validate result via `GEOMUtils::CheckShape()`, fix tolerances if needed
  8. **History tracking**: For each input sub-shape, query `PS.IsDeleted()` / `PS.Modified()` and store index mapping in `TDataStd_IntegerArray` labels for `GetInPlace` functionality
- **Inputs**: Shapes (objects), Tools, KeepInside, RemoveInside, Materials, Limit shape type
- **Self-intersection checking**: Optional `BOPAlgo_CheckerSI` before partition
- **Fuzzy parameter**: Tolerance for near-coincident geometry

#### 8.2 Half Partition — `PARTITION_HALF`
- **Purpose**: Split a shape with a single plane (simpler API).
- **Approach**: Same `GEOMAlgo_Splitter` but with only one shape and one plane tool. Copies both, performs split, tracks history.

#### 8.3 Glue Faces/Edges — `GEOMImpl_GlueDriver`
- **Purpose**: Merge coincident (within tolerance) faces and edges in a compound.
- **Static utility**: `GEOMImpl_GlueDriver::GlueFaces(shape, tolerance, keepNonSolids)`
- **Use cases**: Post-processing after boolean operations, block compound creation
- **Options**: Optional `pMapModif` for tracking face modifications

#### 8.4 Explode (Decompose) — `GEOMImpl_IShapesOperations::MakeExplode()`
- **Purpose**: Extract all sub-shapes of a given type from a shape.
- **Types**: Any `TopAbs_ShapeEnum` (VERTEX, EDGE, WIRE, FACE, SHELL, SOLID, etc.)
- **Modes**:
  - `EXPLODE_OLD_INCLUDE_MAIN` — include main shape, legacy sorting
  - `EXPLODE_NEW_INCLUDE_MAIN` — include main shape, centroid-based sorting
  - `EXPLODE_NEW_EXCLUDE_MAIN` — exclude main shape from results
- **Approach**: Builds `TopTools_IndexedMapOfShape`, creates `GEOM_SUBSHAPE` objects with `GEOM_ISubShape` function that stores main shape reference and index array. Sets function values directly (bypasses solver for performance).

#### 8.5 Block Operations — `GEOMImpl_BlockDriver`
- **Purpose**: Create and manipulate hexahedral blocks (for meshing).
- **Types**:
  - `BLOCK_FACE_TWO_EDGES` — quad face from 2 opposite edges
  - `BLOCK_FACE_FOUR_PNT` — quad face from 4 points
  - `BLOCK_FACE_FOUR_EDGES` — quad face from 4 edges
  - `BLOCK_TWO_FACES` — hexahedral solid from 2 opposite faces
  - `BLOCK_SIX_FACES` — hexahedral solid from 6 faces
  - `BLOCK_COMPOUND_GLUE` — glue faces in a block compound
  - `BLOCK_REMOVE_EXTRA` / `BLOCK_COMPOUND_IMPROVE` — simplify block compounds
- **Approach**: Uses `BRepTools_Quilt` for gluing faces into solids, `BRepClass3d_SolidClassifier` for inside/outside checking, `BRepLib::SameParameter` for consistency. `GEOMImpl_Block6Explorer::MakeFace()` constructs faces from wire polygons.

#### 8.6 GetBlockByParts — `GEOMImpl_IBlocksOperations::GetBlockByParts()`
- **Purpose**: Find a specific block (solid) in a compound that contains given sub-shapes.
- **Approach**: Explodes compound on solids, checks which solid contains all specified parts as sub-shapes.

#### 8.7 Extract Sub-Shapes — `ExtractSubShapes()`
- **Purpose**: Extract sub-shapes excluding the main shape itself.
- **Approach**: Calls `MakeExplode()` with `EXPLODE_NEW_EXCLUDE_MAIN` mode.

#### 8.8 Shapes On Shape Filtering — `getShapesOnShapeIDs()`
- **Purpose**: Find sub-shapes of one shape that satisfy spatial conditions relative to another shape.
- **OCCT API**: `GEOMAlgo_FinderShapeOn2` with `GEOMAlgo_ClsfSolid`
- **States**: IN, OUT, ON, ONIN, ONOUT, INOUT

---

## Appendix: Architecture Summary

### Driver Registration (`GEOMImpl_Gen::GEOMImpl_Gen()`)
All drivers are registered in the OCAF function driver table:
```
GEOMImpl_BooleanDriver      → Boolean ops + Partition
GEOMImpl_PartitionDriver    → Partition
GEOMImpl_FilletDriver       → 3D Fillet
GEOMImpl_ChamferDriver      → Chamfer  (via LocalOperations)
GEOMImpl_Fillet1dDriver     → 1D Fillet (via LocalOperations)
GEOMImpl_Fillet2dDriver     → 2D Fillet (via LocalOperations)
GEOMImpl_PrismDriver        → Extrusion
GEOMImpl_RevolutionDriver   → Revolution
GEOMImpl_PipeDriver         → Pipe/Sweep
GEOMImpl_PipePathDriver     → Path restoration
GEOMImpl_ThruSectionsDriver → Loft
GEOMImpl_FillingDriver      → Surface filling
GEOMImpl_HealingDriver      → All healing ops
GEOMImpl_MeasureDriver      → Measurement geometry (CDG, BBox, etc.)
GEOMImpl_TranslateDriver    → Translation + patterns
GEOMImpl_RotateDriver       → Rotation + patterns
GEOMImpl_MirrorDriver       → Mirror
GEOMImpl_OffsetDriver       → Offset
GEOMImpl_ScaleDriver        → Scale
GEOMImpl_PositionDriver     → Position/Placement
GEOMImpl_ProjectionDriver   → Projection
GEOMImpl_ShapeDriver        → Shape construction, sub-shapes
GEOMImpl_GlueDriver         → Face/edge gluing
GEOMImpl_BlockDriver        → Block operations
GEOMImpl_ConformityDriver   → Shape conformity checking
GEOMImpl_ShapeProximityDriver → Shape proximity
GEOMImpl_WrappingDriver     → Face wrapping
```

### Custom SALOME Algorithms (not in standard OCCT)
- `GEOMAlgo_Splitter` — extended partition/split algorithm
- `GEOMAlgo_ShapeInfoFiller` — shape kind classification
- `GEOMAlgo_FinderShapeOn2` — spatial shape filtering with classifiers
- `GEOMAlgo_RemoverWebs` — internal face removal
- `GEOMAlgo_GlueDetector` — detect glueable faces
- `GEOMAlgo_AlgoTools` — miscellaneous utilities (copy, mesh, etc.)
- `GEOMImpl_Fillet1d` — custom 1D fillet with Newton solver
- `ShHealOper_*` — SALOME's shape healing operator library
