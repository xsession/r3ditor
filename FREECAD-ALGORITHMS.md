# FreeCAD Advanced Algorithms & Techniques Reference

> **Extracted from FreeCAD/FreeCAD GitHub repository for r3ditor implementation**
>
> Source: `https://github.com/FreeCAD/FreeCAD`

---

## Table of Contents

1. [Sketch Constraint Solver (PlaneGCS)](#1-sketch-constraint-solver-planegcs)
2. [Boolean Operations & B-Rep Algorithms](#2-boolean-operations--b-rep-algorithms)
3. [Topological Naming Problem (TNP)](#3-topological-naming-problem-tnp)
4. [PartDesign Feature Operations](#4-partdesign-feature-operations)
5. [Transformation Features (Pattern/Mirror)](#5-transformation-features-patternmirror)
6. [Fillet, Chamfer & Dress-Up Features](#6-fillet-chamfer--dress-up-features)
7. [Shape Healing & Tolerance Management](#7-shape-healing--tolerance-management)
8. [Mesh & Tessellation Algorithms](#8-mesh--tessellation-algorithms)
9. [CAM / Toolpath Generation](#9-cam--toolpath-generation)
10. [Assembly Solver (Ondsel/MbD)](#10-assembly-solver-ondselmbd)
11. [Sketch Analysis & Auto-Constraint](#11-sketch-analysis--auto-constraint)

---

## 1. Sketch Constraint Solver (PlaneGCS)

**Source:** `src/Mod/Sketcher/App/planegcs/`

FreeCAD's 2D constraint solver is the **PlaneGCS** (Plane Geometric Constraint System), a custom solver built with Eigen. It uses a cascading multi-algorithm strategy with subsystem decomposition.

### 1.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GCS::System                               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────────┐ │
│  │ plist    │  │ clist    │  │ reductionmaps             │ │
│  │ (params) │  │ (constr) │  │ (equality simplification) │ │
│  └────┬─────┘  └────┬─────┘  └───────────┬───────────────┘ │
│       │             │                     │                  │
│  ┌────▼─────────────▼─────────────────────▼──────────────┐  │
│  │              Partitioned SubSystems                    │  │
│  │  plists[] · clists[] · reductionmaps[]                │  │
│  └────────────────────┬──────────────────────────────────┘  │
│                       │                                      │
│  ┌────────────────────▼──────────────────────────────────┐  │
│  │           Solver Algorithms (cascading)                │  │
│  │  DogLeg → LevenbergMarquardt → BFGS → SQP(augmented) │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Diagnosis (DOF/Redundancy)                │  │
│  │  makeReducedJacobian → QR rank → conflicting/redundant│  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Solver Algorithms

FreeCAD implements **three core solvers** plus an **SQP augmented** fallback:

#### DogLeg (Default for dragging)
```
solve_DL(SubSystem* subsys):
  1. Compute residual fx, Jacobian Jx
  2. Steepest descent: h_sd = α * g  where  α = ||g||² / ||Jx·g||²
  3. Gauss-Newton step: h_gn = Jx⁺ · (-fx)
     - Three GN step variants: FullPivLU, LeastNormFullPivLU, LeastNormLdlt
  4. Dog-leg combination:
     if ||h_gn|| < δ → h_dl = h_gn
     else if α·||g|| ≥ δ → h_dl = (δ/||g||) · g
     else → interpolate between h_sd and h_gn within trust region δ
  5. Trust region update: ρ = (err - err_new) / dL
     if ρ > 0.75 → δ = max(δ, 3·||h_dl||)
     if ρ < 0.25 → δ = δ/2, ν *= 2
  6. Convergence: fx_inf ≤ tolf OR g_inf ≤ tolg OR δ ≤ tolx·(tolx + ||x||)
```

#### Levenberg-Marquardt
```
solve_LM(SubSystem* subsys):
  1. Residual e, Jacobian J
  2. Normal equations: A = JᵀJ, g = Jᵀe
  3. Augmented: A(i,i) += μ  (damping parameter)
  4. Solve: h = A⁻¹·g  (via fullPivLu)
  5. Step limiting: scale = subsys->maxStep(h)
  6. Update μ: adaptive via ratio dF/dL
     if improvement → μ *= max(1/3, 1-(2ρ-1)³), ν = 2
     else → μ *= ν, ν *= 2
  7. Convergence: ||e|| ≤ ε² OR g_inf ≤ ε₁ OR h_norm ≤ ε₁²·||x||
```

#### BFGS (Quasi-Newton)
```
solve_BFGS(SubSystem* subsys):
  1. Initial: D = I (identity), x = params, grad = ∇error
  2. Search direction: xdir = -D · grad
  3. Line search along xdir
  4. BFGS Hessian update:
     D += (1 + yᵀDy/hᵀy)/(hᵀy) · hhᵀ - (1/hᵀy)(hDyᵀ + Dyhᵀ)
  5. Convergence: ||h|| ≤ criterion OR err ≤ smallF
```

#### SQP Augmented System (Last resort)
```
solve(SubSystem* subsysA, SubSystem* subsysB):
  - Treats subsysA as high-priority constraints
  - subsysB as low-priority (original parameters as soft constraints)
  - QP subproblem: minimize ½xᵀBx + gᵀx  s.t.  JA·x + resA = 0
  - Uses Y,Z decomposition of JA for null-space projection
  - Merit function: f = error_B + μ·||resA||₁
  - Line search with Armijo backtracking (η=0.25, τ=0.5, ρ=0.5)
```

### 1.3 Cascading Solver Strategy

```cpp
// Sketch::internalSolve — the cascading pattern
// Default solver (configurable: BFGS=0, LM=1, DogLeg=2)
ret = GCSsys.solve(isFine, defaultAlgorithm);

if (ret == Success) {
    GCSsys.applySolution();
    valid = updateGeometry();
    if (!valid) { GCSsys.undoSolution(); }
}

if (!valid) {  // Fallback cascade
    for (soltype in [DogLeg, LM, BFGS, SQP_Augmented]) {
        if (soltype == default) continue;  // skip already tried
        ret = GCSsys.solve(isFine, soltype);
        if (ret == Success) break;
    }
}

// SQP augmented (soltype=3): adds equality constraints to initial params
// This creates a second subsystem that tries to keep params close to initial
```

### 1.4 Constraint Type Hierarchy

```
Constraint (base)
├── ConstraintEqual             — param₁ = ratio · param₂
├── ConstraintProportional      — param₁ = ratio · param₂ + offset
├── ConstraintDifference        — param₁ - param₂ = d
├── ConstraintP2PDistance        — ||p₁ - p₂|| = d
├── ConstraintP2PAngle          — atan2(Δy, Δx) = angle + da
├── ConstraintP2LDistance        — point-to-line distance
├── ConstraintPointOnLine        — p lies on line(l₁, l₂)
├── ConstraintPointOnPerpBisector — midpoint perpendicular
├── ConstraintParallel           — l₁ ∥ l₂
├── ConstraintPerpendicular      — l₁ ⊥ l₂
├── ConstraintL2LAngle           — angle between two lines
├── ConstraintMidpointOnLine     — midpoint of segment on line
├── ConstraintTangentCircumf     — circle tangency
├── ConstraintPointOnEllipse     — point on ellipse
├── ConstraintEllipseTangentLine — ellipse-line tangency
├── ConstraintInternalAlignmentPoint2Ellipse
├── ConstraintInternalAlignmentPoint2Hyperbola
├── ConstraintEqualMajorAxesConic
├── ConstraintEqualFocalDistance
├── ConstraintCurveValue         — ties parameter u with point on curve
├── ConstraintPointOnHyperbola
├── ConstraintPointOnParabola
├── ConstraintAngleViaPoint      — angle at intersection point
├── ConstraintAngleViaTwoPoints
├── ConstraintSnell              — Snell's law for refraction
├── ConstraintEqualLineLength    — ||l₁|| = ||l₂||
├── ConstraintC2CDistance        — curve-to-curve distance
├── ConstraintC2LDistance        — curve-to-line distance
├── ConstraintP2CDistance        — point-to-curve distance
├── ConstraintArcLength          — arc length constraint
├── ConstraintSlopeAtBSplineKnot — B-spline tangent at knot
├── ConstraintPointOnBSpline     — point lies on B-spline
└── ConstraintCenterOfGravity    — weighted center of points
```

**Key Constraint Interface:**
```cpp
class Constraint {
    virtual double error();               // residual
    virtual double grad(double* param);   // ∂error/∂param
    virtual void errorgrad(double* err, double* grad, double* param); // combined
    virtual double maxStep(MAP_pD_D& dir, double lim);  // step limiter
    virtual void rescale(double coef);    // constraint scaling
    bool driving;                         // driving vs non-driving (reference)
    Alignment internalAlignment;          // internal alignment type
    int tag;                              // maps to Sketcher constraint index
};
```

### 1.5 SubSystem & Decomposition

```cpp
class SubSystem {
    // Parameters: independent copies via pmap (redirect → work copy)
    void redirectParams();   // switch to internal copies
    void revertParams();     // restore originals
    void applySolution();    // write solution back

    // Evaluation
    double error();                              // Σ constraint.error()²
    void calcResidual(VectorXd& r);             // r[i] = constraint[i].error()
    void calcResidual(VectorXd& r, double& err);
    void calcJacobi(MatrixXd& jacobi);          // J[i][j] = constraint[i].grad(param[j])
    void calcGrad(VectorXd& grad);              // grad = Jᵀ · residual
    double maxStep(VectorXd& xdir);             // min over all constraints
};
```

### 1.6 DOF Diagnosis

```cpp
System::diagnose(Algorithm alg):
  1. Build reduced Jacobian via makeReducedJacobian()
     - Removes equality constraints via reductionmaps
     - Builds tagmultiplicity map (Sketcher constraint → solver constraints)
  2. Choose QR algorithm:
     - DenseQR for small systems (< autoQRThreshold ≈ 200 params)
     - SparseQR for large systems (avoids rank detection issues)
  3. QR decomposition → rank → DOF = params - rank
  4. Identify:
     - conflictingTags: constraints causing rank deficiency
     - redundantTags: linearly dependent constraints
     - partiallyRedundantTags: numerically close to redundant
```

### 1.7 System Configuration Parameters

```cpp
System::System():
    maxIter(100), maxIterRedundant(100),
    sketchSizeMultiplier(false),     // if true: maxIter *= xsize
    convergence(1e-10), convergenceRedundant(1e-10),
    qrAlgorithm(EigenSparseQR),
    autoChooseAlgorithm(true), autoQRThreshold(1000),
    dogLegGaussStep(FullPivLU),
    LM_eps(1e-10), LM_eps1(1e-80), LM_tau(1e-3),
    DL_tolg(1e-80), DL_tolx(1e-80), DL_tolf(1e-10)
```

---

## 2. Boolean Operations & B-Rep Algorithms

**Source:** `src/Mod/Part/App/TopoShape*.cpp`, `src/Mod/Part/App/FCBRepAlgoAPI_*`

### 2.1 Boolean Operation Wrapper Pattern

FreeCAD wraps OCCT boolean operations through a custom API layer:

```
FCBRepAlgoAPI_BooleanOperation (abstract base)
├── FCBRepAlgoAPI_Fuse    — union (OpCode: FUS)
├── FCBRepAlgoAPI_Cut     — subtraction (OpCode: CUT)
├── FCBRepAlgoAPI_Common  — intersection (OpCode: CMN)
└── FCBRepAlgoAPI_Section — cross-section
```

**Key design:** Each wrapper adds TNP element mapping on top of OCCT's `BRepAlgoAPI_*`.

### 2.2 Unified Entry Point

```cpp
TopoShape::makeElementBoolean(OpCode op, const std::vector<TopoShape>& shapes):
  1. Dispatch by op code:
     - OpCode::Fuse    → BRepAlgoAPI_Fuse
     - OpCode::Cut     → BRepAlgoAPI_Cut
     - OpCode::Common  → BRepAlgoAPI_Common
  2. Set fuzzy tolerance via setAutoFuzzy() (automatic tolerance detection)
  3. Execute with SetNonDestructive(true) for GeneralFuse
  4. Validate result with BRepAlgo::IsValid()
  5. Fix tolerance with ShapeFix_ShapeTolerance
  6. Build element map via makeShapeWithElementMap()
```

### 2.3 Convenience Wrappers

```cpp
// Single-shape boolean shortcuts
makeElementFuse(shapes)     → makeElementBoolean(OpCodes::Fuse, shapes)
makeElementCut(shapes)      → makeElementBoolean(OpCodes::Cut, shapes)
makeElementCommon(shapes)   → makeElementBoolean(OpCodes::Common, shapes)

// XOR = Union - Common (iterative)
makeElementXor(shapes):
  result = Union(all shapes)
  common = Common(all shapes)
  result = Cut(result, common)

// MultiFuse: iteratively fuse list of shapes
makeElementMultiFuse(shapes):
  result = shapes[0]
  for i in 1..n: result = Fuse(result, shapes[i])
```

### 2.4 GeneralFuse with Fuzzy Tolerance

```cpp
// GeneralFuse: splits all shapes into disjoint pieces
BOPAlgo_Builder builder;
builder.SetNonDestructive(true);
builder.SetFuzzyValue(autoFuzzy);  // computed from shape tolerances
builder.AddArgument(shape1);
builder.AddArgument(shape2);
builder.Perform();
// Result: all intersection volumes separated
```

### 2.5 Compound Boolean Handling

```cpp
RecursiveCutCompound(shape, tool):
  if shape.isCompound:
    for sub in shape.subShapes:
      result.add(RecursiveCutCompound(sub, tool))
  else:
    result = BooleanCut(shape, tool)

RecursiveCutFusedTools(shape, tools):
  fusedTools = MultiFuse(tools)
  result = RecursiveCutCompound(shape, fusedTools)
```

### 2.6 Post-Boolean Validation

```cpp
// After every boolean:
1. BRepAlgo::IsValid(result)  — topological validity check
2. ShapeFix_ShapeTolerance::LimitTolerance(result, tol)  — clamp tolerances
3. ShapeFix_Shape::Perform()  — general shape healing
4. BRepCheck_Analyzer  — detailed analysis if validation fails
```

---

## 3. Topological Naming Problem (TNP)

**Source:** `src/Mod/Part/App/TopoShapeExpansion.cpp`, `src/Mod/Part/App/TopoShapeOpCode.h`

### 3.1 Core Algorithm: makeShapeWithElementMap

This is FreeCAD's solution to the Topological Naming Problem — persistent identification of geometric elements across parametric model updates.

```
makeShapeWithElementMap(result, mapper, sources[], opCode):

  Phase 1: Collect ShapeInfo
  ─────────────────────────
  For each element type (Vertex, Edge, Face):
    Build map: TopoDS_Shape → ShapeInfo{ tag, shapeName, ... }

  Phase 2: Forward Naming (lower → higher dimension)
  ──────────────────────────────────────────────────
  For each source shape:
    For each element in source:
      modified = mapper.modified(element)
      generated = mapper.generated(element)
      For each result element in modified/generated:
        encodedName = encodeElementName(sourceName, opCode, tag)
        resultElement.setName(encodedName)

  Phase 3: Reverse Naming (higher → lower dimension)
  ──────────────────────────────────────────────────
  For unnamed lower elements:
    Find parent higher elements that ARE named
    Derive name: childName = parentName + ";:G" + index

  Phase 4: Delayed Naming (shells, solids)
  ────────────────────────────────────────
  For compound elements (Shell, Solid):
    Name from constituent faces/edges

  Phase 5: Parallel Face Mapping
  ─────────────────────────────
  Map faces that moved in parallel during extrusion
```

### 3.2 Mapper Pattern

```cpp
class Mapper {
    virtual TopTools_ListOfShape modified(const TopoDS_Shape& s) = 0;
    virtual TopTools_ListOfShape generated(const TopoDS_Shape& s) = 0;
};

class MapperMaker : public Mapper {
    // Wraps BRepBuilderAPI_MakeShape
    // Used for: extrude, revolve, fillet, chamfer, loft, sweep
    BRepBuilderAPI_MakeShape& maker;
};

class MapperSewing : public Mapper {
    // Wraps BRepBuilderAPI_Sewing
    BRepBuilderAPI_Sewing& sewing;
};

class MapperHistory : public Mapper {
    // Wraps BRepTools_History, BRepTools_ReShape, ShapeFix_Root
    // Generic history tracker for complex operations
};

class ShapeMapper : public Mapper {
    // User-defined mappings with MappingStatus enum
    enum MappingStatus { Generated, Modified, Both };
};
```

### 3.3 Element Name Encoding

```
Format: sourceName + ";" + opCode + tag + ":" + index

Examples:
  "Face1;FUS3:2"  — Face1 fused, tag 3, 2nd result
  "Edge5;CUT1:1"  — Edge5 cut, tag 1, 1st result
  "Face2;FIL2:3"  — Face2 filleted, tag 2, 3rd result

Combo names (elements from multiple sources):
  setElementComboName() — combines names with separator
  decodeElementComboName() — splits back to components
```

### 3.4 Operation Codes (TopoShapeOpCode.h)

```cpp
// Version number for encoding compatibility
static constexpr int OpCodeVersion = 15;

namespace OpCodes {
    FUS,        // Fuse
    CUT,        // Cut
    CMN,        // Common
    SEC,        // Section
    Fillet,     // Fillet
    Chamfer,    // Chamfer
    Offset,     // Offset
    ThruSections, // Loft
    Pipe,       // Sweep/Pipe
    Revolution, // Revolution
    Prism,      // Extrusion
    // ... etc
}
```

### 3.5 History Tracking

```cpp
getElementHistory(element):
  Returns: (tag, originalName, [intermediateNames])
  — Traces an element back through all operations to its origin
  — Used for: selection persistence, constraint persistence, feature editing

mapSubElement(sourceShape, targetShape):
  — Copies element maps between shapes
  — Used when shape is modified but topology is preserved
```

---

## 4. PartDesign Feature Operations

**Source:** `src/Mod/PartDesign/App/`

### 4.1 Class Hierarchy

```
PartDesign::Feature
└── PartDesign::FeatureRefine
    └── PartDesign::FeatureAddSub       — Type: {Additive, Subtractive}
        ├── PartDesign::ProfileBased     — Base for sketch-based features
        │   ├── FeatureExtrude           — Pad/Pocket base class
        │   │   ├── Pad                  — Additive extrusion
        │   │   └── Pocket               — Subtractive extrusion
        │   ├── Revolution               — Additive revolution
        │   ├── Groove                   — Subtractive revolution
        │   ├── Pipe (AdditivePipe/SubtractivePipe)  — Sweep along spine
        │   ├── Loft (AdditiveLoft/SubtractiveLoft)  — Through sections
        │   └── Helix (AdditiveHelix/SubtractiveHelix)
        └── FeaturePrimitive             — Parametric primitives
            ├── Box → AdditiveBox / SubtractiveBox
            ├── Cylinder → AdditiveCylinder / SubtractiveCylinder
            ├── Sphere → AdditiveSphere / SubtractiveSphere
            ├── Cone → AdditiveCone / SubtractiveCone
            ├── Ellipsoid → AdditiveEllipsoid / SubtractiveEllipsoid
            ├── Torus → AdditiveTorus / SubtractiveTorus
            ├── Prism → AdditivePrism / SubtractivePrism
            └── Wedge → AdditiveWedge / SubtractiveWedge
```

### 4.2 Extrusion (Pad/Pocket)

```cpp
FeatureExtrude::buildExtrusion(ExtrudeOptions options):

  enum ExtrudeOption {
      MakeFace    = 1,  // Create face from profile wire
      MakeFuse    = 2,  // Fuse/cut with base shape
      LegacyPocket = 4, // Backward compatibility mode
      InverseDirection = 8,  // Reverse auto-detected direction
  };

  Extrusion Methods:
  ──────────────────
  - "Length"      → BRepPrimAPI_MakePrism(profile, direction * length)
  - "UpToLast"    → extend to last face of support
  - "UpToFirst"   → extend to first intersecting face
  - "UpToFace"    → extend to specific named face
  - "TwoLengths"  → symmetric or asymmetric in both directions
  - "UpToShape"   → extend to arbitrary shape(s)

  Taper Angle Support:
  ───────────────────
  if hasTaperedAngle():
    - Apply draft angle to extrusion profile
    - Uses BRepOffsetAPI_DraftAngle or loft-based tapering

  Direction Computation:
  ─────────────────────
  computeDirection(sketchVector, inverse):
    - Default: sketch face normal
    - Custom: user-specified direction vector
    - Inverse flag for Pocket (material removal direction)
```

### 4.3 Revolution (Revolution/Groove)

```cpp
Revolution::generateRevolution(revol, sketchshape, axis, angle, angle2, midplane, reversed, method):

  RevolMethod:
  ──────────
  - Angle        → single angle revolution
  - ThroughAll   → 360° revolution
  - ToFirst      → revolve to first intersecting face
  - ToFace       → revolve to specific face
  - TwoAngles    → different angles in each direction

  RevolMode:
  ─────────
  - CutFromBase  (0) — BRepFeat_MakeRevol in cut mode
  - FuseWithBase (1) — BRepFeat_MakeRevol in fuse mode
  - None         (2) — standalone solid via BRepPrimAPI_MakeRevol

  Implementation:
  - BRepPrimAPI_MakeRevol for standalone solids
  - BRepFeat_MakeRevol for fuse/cut with base
  - Axis from: sketch axis, datum line, edge reference
```

### 4.4 Sweep (Pipe)

```cpp
Pipe::execute():
  1. Get profile shape from sketch
  2. Build path from Spine reference (edges → continuous wire)
  3. Configure BRepOffsetAPI_MakePipeShell:
     - Transition modes: Transformed, RightCorner, RoundCorner
     - Auxiliary spine for twist control
     - Binormal mode for fixed orientation
  4. Add sections at positions along path
  5. Build solid, validate, fuse/cut with base

Pipe properties:
  - Spine: path curve (PropertyLinkSub)
  - SpineTangent: enforce tangent continuity
  - AuxiliarySpine: twist control curve
  - AuxiliaryCurvilinear: curvilinear equivalence
  - Mode: {Standard, Fixed, Frenet, Auxiliary, Binormal}
  - Transition: {Transformed, RightCorner, RoundCorner}
  - Sections: multiple profiles along path
```

### 4.5 Loft (Through Sections)

```cpp
Loft::execute():
  1. Collect profile sections (multiple sketches/profiles)
  2. BRepOffsetAPI_ThruSections(isSolid=true, isRuled)
     - isSolid: create solid vs shell
     - isRuled: ruled surface vs smooth interpolation
     - maxDegree: maximum NURBS degree (default 5)
  3. Add wires in order
  4. Validate result (BRepAlgo::IsValid)
  5. Boolean fuse/cut with base shape

Loft properties:
  - Sections: ordered list of profile shapes
  - Closed: connect last section to first
  - Ruled: straight line interpolation vs smooth
```

### 4.6 ProfileBased Utilities

```cpp
ProfileBased::getTopoShapeVerifiedFace(silent, doFit, allowOpen):
  — Extracts verified face from profile sketch
  — Handles wire→face conversion via BRepBuilderAPI_MakeFace

ProfileBased::checkWireInsideFace(wire, face, dir):
  — Validates wire projection lies within face boundary
  — Uses BRepProj_Projection

ProfileBased::checkLineCrossesFace(line, face):
  — Checks if construction line intersects face
  — For UpToFace boundary validation

ProfileBased::getThroughAllLength():
  — Computes bounding box diagonal for "ThroughAll" extrusion
  — Ensures extrusion extends beyond all geometry

ProfileBased::addOffsetToFace(upToFace, dir, offset):
  — Applies offset to "UpToFace" target
  — Translates face along direction by offset amount
```

---

## 5. Transformation Features (Pattern/Mirror)

**Source:** `src/Mod/PartDesign/App/FeatureTransformed.cpp`, `Feature{Mirrored,LinearPattern,PolarPattern,MultiTransform}.cpp`

### 5.1 Transformed Base Class

```cpp
class Transformed : public FeatureRefine {
    // Two modes:
    enum Mode { Features, WholeShape };

    // Core: virtual method returns list of gp_Trsf transformations
    virtual const list<gp_Trsf> getTransformations(vector<DocumentObject*> originals);

    // execute() applies transformations:
    1. Get support shape (base)
    2. Get list of transformations from subclass
    3. For each original feature:
       - Get additive/subtractive shape
       - Apply each transformation: shape.makeElementTransform(trsf)
    4. Collect all transformed shapes into compound
    5. Boolean fuse/cut all copies with support
    6. Build element map for TNP
};
```

### 5.2 Mirrored

```cpp
Mirrored::getTransformations():
  1. Get mirror plane from MirrorPlane property
     - XY, XZ, YZ planes from sketch
     - Named face from geometry
  2. Create reflection transformation:
     gp_Trsf trans;
     trans.SetMirror(gp_Ax2(axbase, axdir));
  3. Return {identity, reflection}  // original + mirror copy
```

### 5.3 Linear Pattern

```cpp
LinearPattern::getTransformations():
  Properties:
    Direction, Direction2  — two independent directions (2D grid pattern)
    Mode: {Extent, Spacing}
    Length/Offset, Occurrences
    Reversed, SpacingPattern

  Algorithm:
  1. Calculate offset vectors for each direction:
     offsetVector = getDirectionFromProperty(dirProp) * length/(occurrences-1)
     // or in Spacing mode: offsetVector = direction * offset

  2. Calculate step positions:
     steps[i] = i * offsetVector  (uniform)
     // or with SpacingPattern: steps[i] = cumulative custom spacings

  3. Combine both directions (outer product):
     for step1 in steps1:
       for step2 in steps2:
         trans.SetTranslation(step1 + step2)
         transformations.push(trans)
```

### 5.4 Polar Pattern

```cpp
PolarPattern::getTransformations():
  Properties:
    Axis  — rotation axis reference
    Mode: {Extent, Spacing}
    Angle/Offset, Occurrences
    Reversed, SpacingPattern

  Algorithm:
  1. Get rotation axis from reference:
     - Sketch axis (H_Axis, V_Axis, N_Axis, AxisN)
     - Datum line
     - Edge reference
  2. Calculate rotations:
     In Extent mode:
       angle_step = TotalAngle / (occurrences - 1)
       // Special: if TotalAngle == 360° → divide by occurrences (avoid overlap)
     In Spacing mode:
       cumulative rotation from Offset or SpacingPattern

  3. trans.SetRotation(axis, cumulativeAngle)
```

### 5.5 MultiTransform

```cpp
MultiTransform::getTransformations(originals):
  // Composes multiple transformation types
  1. For each sub-transformation in Transformations list:
     subTransforms = subFeature->getTransformations(originals)
  2. Compute product:
     result = product of all sub-transformation lists
     // {T1} × {T2} × {T3} = {T1·T2·T3 for all combinations}
```

---

## 6. Fillet, Chamfer & Dress-Up Features

**Source:** `src/Mod/PartDesign/App/Feature{Fillet,Chamfer,Draft,Thickness}.cpp`

### 6.1 3D Fillet

```cpp
PartDesign::Fillet::execute():
  1. Get base shape from BaseFeature
  2. Collect edges:
     - UseAllEdges: iterate all edges of base shape
     - Selected edges: from Base property references
  3. Call TopoShape::makeElementFillet():
     - BRepFilletAPI_MakeFillet maker(baseShape)
     - For each edge: maker.Add(radius, edge)
     - maker.Build()
  4. Validate: BRepAlgo::IsValid(result)
  5. Fix tolerance: ShapeFix_ShapeTolerance::LimitTolerance(result, tol)
  6. Build TNP element map with MapperMaker

  FilletElement structure:
    int edgeId;      // edge index
    double radius1;  // start radius
    double radius2;  // end radius (for variable fillet)
```

### 6.2 Chamfer

```cpp
PartDesign::Chamfer::execute():
  - Similar to Fillet but uses BRepFilletAPI_MakeChamfer
  - Chamfer types:
    - Equal distance: same distance on both sides
    - Two distances: different distances
    - Distance + Angle: one distance + chamfer angle
  - maker.Add(dist1, dist2, edge, face)  // face needed for direction
```

### 6.3 2D Fillet

```cpp
// For sketch-level fillets (wire/edge pairs)
ChFi2d_FilletAPI:
  - Line-Line fillet: circular arc tangent to both lines
  - Line-Arc fillet: arc tangent to line and existing arc
  - Arc-Arc fillet: arc tangent to two existing arcs

// Draft-level geometric computation:
Draft::computeFillet(line1, line2, radius):
  - Compute intersection point
  - Find tangent points at distance = radius
  - Create fillet arc between tangent points
```

### 6.4 Draft (Taper)

```cpp
PartDesign::Draft::execute():
  - BRepOffsetAPI_DraftAngle
  - Applies taper angle to selected faces
  - NeutralPlane: reference plane for draft direction
  - PullDirection: direction of draft
```

### 6.5 Thickness (Shell)

```cpp
PartDesign::Thickness::execute():
  - BRepOffsetAPI_MakeThickSolid
  - Hollows solid by removing selected faces
  - Parameters: thickness value, tolerance
  - Join types: Arc, Tangent, Intersection
```

---

## 7. Shape Healing & Tolerance Management

**Source:** OCCT integration throughout `src/Mod/Part/App/`

### 7.1 ShapeFix Pipeline

```
ShapeFix_Shape(shape):
  ├── ShapeFix_Solid    — fix solid construction
  ├── ShapeFix_Shell    — fix shell orientation/connectivity
  ├── ShapeFix_Face     — fix face/wire orientations
  ├── ShapeFix_Wire     — fix wire topology
  └── ShapeFix_Edge     — fix edge geometry
```

### 7.2 Tolerance Management

```cpp
// After every boolean/fillet/chamfer operation:
ShapeFix_ShapeTolerance::LimitTolerance(shape, tolerance):
  — Clamps all vertex/edge/face tolerances to max value
  — Prevents tolerance explosion from cascading operations

// Helix-specific:
FeatureHelix::execute():
  ShapeFix_ShapeTolerance().LimitTolerance(result, Precision::Confusion())
  // Required for helical approximation → fusion compatibility
```

### 7.3 Sewing

```cpp
BRepBuilderAPI_Sewing sewer(tolerance):
  sewer.SetSewingParam(true);      // perform sewing
  sewer.SetDegenerateShapeOption(true);  // handle degenerate shapes
  sewer.SetCutFreeEdgesMode(true);  // cut free edges
  sewer.SetNonManifoldMode(false);  // reject non-manifold
  sewer.Add(shape);
  sewer.Perform();
  result = sewer.SewedShape();
```

---

## 8. Mesh & Tessellation Algorithms

**Source:** `src/Mod/Mesh/App/Core/`, `src/Mod/MeshPart/App/`

### 8.1 Triangulation Hierarchy

```
AbstractPolygonTriangulator (base)
├── EarClippingTriangulator      — O(n²), simple polygons
│   └── QuasiDelaunayTriangulator — ear-clipping + edge flips for quality
├── DelaunayTriangulator          — Wm4 library, proper Delaunay
├── FlatTriangulator              — minimal triangulation
└── ConstraintDelaunayTriangulator — honors boundary constraints
```

**Algorithm Details:**

```
EarClipping:
  1. Build vertex list from polygon
  2. Find "ears" (triangles that don't intersect other edges)
  3. Clip ears iteratively until polygon is triangulated
  Time: O(n²), simple and robust

QuasiDelaunay (extends EarClipping):
  1. EarClipping first pass
  2. Edge flip pass: for each interior edge, check Delaunay condition
     if circumcircle of triangle contains opposite vertex → flip edge
  3. Repeat until no more flips needed

Delaunay (Wm4 library):
  - Proper incremental Delaunay with point insertion
  - Bowyer-Watson algorithm
  - Better quality triangles (maximize minimum angle)

ConstraintDelaunay:
  - Delaunay + preserves input boundary edges
  - Required for sketch wire → mesh conversion
```

### 8.2 Surface Reconstruction (Point Cloud → Mesh)

```
Via PCL (Point Cloud Library) integration:

GreedyProjectionTriangulation:
  — Projects neighborhood to local 2D plane
  — Greedy triangle growth from boundary edges
  — Good for: organized point clouds, smooth surfaces

PoissonReconstruction:
  — Implicit function fitting (indicator function)
  — Marching cubes extraction
  — Parameters: depth, scale, samplesPerNode
  — Good for: watertight surface from noisy data

MarchingCubesHoppe:
  — Signed distance field → isosurface extraction
  — Grid-based, consistent topology

GridReconstruction:
  — Regular grid resampling
  — Simple but memory intensive

OrganizedFastMesh:
  — For organized point clouds (e.g., from depth cameras)
  — Very fast, exploits grid structure
```

### 8.3 Mesh Decimation (QEM)

```cpp
MeshSimplify::simplify(targetFaces):
  // Quadric Error Metric decimation (Garland & Heckbert)
  1. For each vertex: compute error quadric Q = Σ Kp (plane quadrics)
  2. For each edge: compute collapse cost = vᵀ·(Q₁+Q₂)·v
  3. Priority queue by cost (min-heap)
  4. Iteratively collapse cheapest edge:
     a. Remove edge, merge vertices
     b. Position new vertex at Q-optimal point: v = (Q₁+Q₂)⁻¹ · b
     c. Update adjacent edge costs
     d. Check for topology violations (non-manifold, flipped normals)
  5. Stop when targetFaces reached
```

### 8.4 Mesh Smoothing

```cpp
AbstractSmoothing:
  Components:
  ├── TangentialSmoothing  — smooth tangent to surface (preserves shape)
  ├── NormalSmoothing       — smooth along normals (shrinks)
  └── TangentialNormalSmoothing — combined (Taubin-like)

  Continuity levels:
  - C0: position continuity (simple averaging)
  - C1: tangent continuity (curvature-aware)
  - C2: curvature continuity (fairness)

  Algorithm (Laplacian smoothing):
  for each iteration:
    for each vertex v:
      centroid = average(neighbors(v))
      v_new = v + λ * (centroid - v)  // tangential component
      v_new += μ * normal_correction   // normal component
```

### 8.5 Mesh Segmentation

```cpp
MeshDistanceSurfaceSegment:
  — Segments mesh by distance to fitted surface

AbstractSurfaceFit:
  — Fits analytic surfaces to mesh regions:
    - Plane fitting (least squares)
    - Cylinder fitting (iterative)
    - Sphere fitting (algebraic)
    - Cone fitting
  — Used for: feature recognition, reverse engineering
```

### 8.6 Standard Tessellation Parameters

```cpp
TessellationParams:
  LinearDeflection   — max distance from surface to mesh (chordal)
  AngularDeflection  — max angle between adjacent normals
  Relative           — deflection relative to shape size

  Methods:
  - Standard (OCCT IncrementalMesh)
  - MEFISTO (2D advancing front)
  - Netgen (3D tetrahedral meshing)
  - Gmsh (general purpose mesher)
```

### 8.7 Hole Filling

```cpp
MeshTopoAlgorithm::FillupHoles(maxEdges):
  1. Detect boundary loops (free edges)
  2. For each hole with edges ≤ maxEdges:
     a. Triangulate hole boundary polygon
     b. Fit surface through boundary points
     c. Project triangulation onto fitted surface
     d. Insert triangles into mesh
  3. Post-process: smooth filled region
```

---

## 9. CAM / Toolpath Generation

**Source:** `src/Mod/CAM/`, `src/Mod/CAM/libarea/`

### 9.1 Adaptive Clearing (Adaptive2d)

**Core engine:** `libarea/Adaptive.cpp` (~3400 lines of C++)

```cpp
class Adaptive2d {
    Properties:
      double toolDiameter;
      double helixRampDiameter;  // helix entry hole diameter
      double stepOverFactor;      // WOC as fraction of tool diameter (0.0-1.0)
      double tolerance;           // path tolerance
      double stockToLeave;        // finishing allowance
      bool forceInsideOut;        // start from inside
      bool finishingProfile;      // final contour pass

    Core Algorithm (Execute):
    ─────────────────────────
    1. Scale input geometry to integer coordinates (Clipper library)
    2. Generate tool shape (circle approximation as polygon)
    3. Initialize ClearedArea tracker (Clipper union of tool paths)
    4. Process PolyNodes (contour hierarchy):
       for each region:
         a. FindEntryPoint() — search for valid helix entry position
            - Check if tool fits without collision
            - Prefer center of largest inscribed circle
         b. Generate helix ramp entry (circular G2 with decreasing Z)
         c. Adaptive spiral outward:
            while uncleared area exists:
              - Compute next cut direction (maximizing material engagement)
              - Limit stepover to stepOverFactor * toolDiameter
              - IsClearPath() — check for collision with already-cut area
              - AppendToolPath() — generate cutting/linking moves
              - Update ClearedArea
         d. Generate finishing profile pass (if enabled)

    Move Types:
      mtCutting      — active cutting move
      mtLinkClear    — rapid move over cleared area
      mtLinkNotClear — retract + rapid + plunge move
```

### 9.2 ClearedArea Tracking

```cpp
class ClearedArea {
    // Uses Clipper library for 2D boolean operations
    ClipperLib::Paths clearedPaths;

    Add(toolPath):
      // Union of tool envelope along path with cleared area
      offset = ClipperOffset(toolRadius)
      clearedPaths = Union(clearedPaths, offsetPath)

    IsCleared(point):
      // Point-in-polygon test against cleared area

    IsClearPath(p1, p2):
      // Check if line segment is entirely within cleared area
      // Used for link move classification
};
```

### 9.3 Waterline Machining

```python
# Three algorithm variants:
class Waterline:
    algorithms = ["OCL Dropcutter", "OCL Adaptive", "Experimental"]

    OCL_Dropcutter:
      1. Slice model at Z levels (waterline heights)
      2. For each Z level:
         - Drop cutter along X-Y grid
         - Find contact points with surface
         - Generate contour at waterline height
      3. Offset contours by tool radius

    OCL_Adaptive:
      - Adaptive sampling based on surface curvature
      - Finer resolution in high-curvature areas
      - Coarser in flat regions

    Experimental:
      - Topo map creation from STL mesh
      - Waterline highlighting at each Z level
      - Direct contour extraction
```

### 9.4 Pocket Operation

```python
class Pocket:
    Properties:
      - StartDepth, FinalDepth
      - StepDown (depth per pass)
      - AdaptiveStart, AdaptiveFinish
      - UseStartPoint

    Algorithm:
    1. Get pocket boundary from solid sectioning at each Z level
    2. Remove holes (inner islands)
    3. Generate offset paths:
       a. Envelope-based depth calculation
       b. Zigzag or contour-parallel toolpath
       c. Stepover between passes
    4. Optimize entry: helix ramp or direct plunge
    5. Lead-in/lead-out arcs for smooth entry/exit
```

### 9.5 G-code Generation

```
G-code output format:
  G0 Xn Yn Zn         — rapid move
  G1 Xn Yn Zn Fn      — linear cutting move with feedrate
  G2 Xn Yn Zn In Jn   — clockwise arc
  G3 Xn Yn Zn In Jn   — counterclockwise arc

Helix ramp entry:
  Loop: G2 X Y Z I J (circular arcs with decreasing Z)
  Until target depth reached

Link moves:
  Clear area:  G0 (rapid traverse)
  Not clear:   G0 Z(retract) → G0 X Y → G0/G1 Z(plunge)
```

---

## 10. Assembly Solver (Ondsel/MbD)

**Source:** `src/Mod/Assembly/App/`, uses OndselSolver (MbD library)

### 10.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   AssemblyObject                         │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │ objectPartMap│  │ MbD Assembly   │  │ Joint Group│  │
│  │ (Part→MbD)   │  │ (ASMTAssembly) │  │            │  │
│  └──────┬───────┘  └───────┬────────┘  └──────┬─────┘  │
│         │                  │                    │        │
│  ┌──────▼──────────────────▼────────────────────▼─────┐ │
│  │              Ondsel MbD Solver                      │ │
│  │  Parts(6DOF) · Joints(constraints) · Markers       │ │
│  │  runPreDrag() → solve → doDragStep → postDrag      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Solver Status                          │  │
│  │  DOF · Conflicts · Redundancies · Malformed        │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 10.2 Joint Types

```cpp
enum class JointType {
    Fixed,          → ASMTFixedJoint        (0 DOF)
    Revolute,       → ASMTRevoluteJoint     (1 DOF: rotation)
    Cylindrical,    → ASMTCylindricalJoint  (2 DOF: rotation + translation)
    Slider,         → ASMTTranslationalJoint (1 DOF: translation)
    Ball,           → ASMTSphericalJoint    (3 DOF: 3 rotations)
    Distance,       → varies by geometry (see below)
    Parallel,       → ASMTParallelAxesJoint (maintains parallel axes)
    Perpendicular,  → ASMTPerpendicularJoint
    Angle,          → ASMTAngleJoint (angle = theIzJz)
    RackPinion,     → ASMTRackPinionJoint (pitchRadius)
    Screw,          → ASMTScrewJoint (pitch)
    Gears,          → ASMTGearJoint (radiusI, radiusJ)
    Belt,           → ASMTGearJoint (radiusI, radiusJ, reverse)
};
```

### 10.3 Distance Joint → Geometry-Specific Mapping

```cpp
makeMbdJointDistance(joint):
  // Maps Distance constraint to appropriate MbD joint based on geometry types

  PointPoint       → ASMTSphSphJoint (distance=0 → ASMTSphericalJoint)
  LineLine         → ASMTRevCylJoint
  LineCircle       → ASMTRevCylJoint (+ radii)
  CircleCircle     → ASMTRevCylJoint (+ radii)

  PlanePlane       → ASMTPlanarJoint (offset)
  PlaneCylinder    → ASMTPointInPlaneJoint + distance
  PlaneSphere      → ASMTPointInPlaneJoint + radius
  PlaneCone        → ASMTPointInPlaneJoint + radius at contact

  CylinderCylinder → ASMTRevCylJoint (+ radii)
  CylinderSphere   → ASMTCylSphJoint
  SphereSphere     → ASMTSphSphJoint

  PointPlane       → ASMTPointInPlaneJoint (offset)
  PointCylinder    → ASMTCylSphJoint
  PointLine        → ASMTCylSphJoint (distance)

  LinePlane        → ASMTLineInPlaneJoint (offset)
```

### 10.4 Solve Workflow

```cpp
AssemblyObject::solve(enableRedo, updateJCS):
  1. ensureIdentityPlacements()  — normalize link placements
  2. mbdAssembly = makeMbdAssembly()  — create fresh solver model
  3. fixGroundedParts()  — identify grounded (fixed) components
  4. removeUnconnectedJoints()  — prune dangling constraints
  5. jointParts(joints)  — create MbD joints from FreeCAD joints:
     for each joint:
       mbdJoints = makeMbdJoint(joint)
       mbdAssembly.addJoint(mbdJoint)
  6. mbdAssembly.runPreDrag()  — solve to initial equilibrium
  7. validateNewPlacements()  — check solution sanity
  8. setNewPlacements()  — apply solved positions back to FreeCAD
  9. updateSolveStatus()  — count DOF, detect conflicts/redundancies
```

### 10.5 Part & Marker Creation

```cpp
makeMbdPart(name, placement, mass):
  auto part = ASMTPart::With();
  part.setPosition3D(pos.x, pos.y, pos.z);
  part.setRotationMatrix(r0, r1, r2);  // 3x3 from placement
  part.setPrincipalMassMarker(mass, density=1.0, inertia={1,1,1});

makeMbdMarker(name, placement):
  auto marker = ASMTMarker::With();
  marker.setPosition3D(pos.x, pos.y, pos.z);
  marker.setRotationMatrix(r0, r1, r2);
  // Markers define joint coordinate systems (JCS) on each part
```

### 10.6 Joint Limits

```cpp
// Slider/Cylindrical: translation limits
ASMTTranslationLimit::With():
  limit.settype("=>");   // minimum
  limit.setlimit(minLength);
  limit.settol("1.0e-9");

// Revolute/Cylindrical: rotation limits
ASMTRotationLimit::With():
  limit.settype("=<");   // maximum
  limit.setlimit(maxAngle);
```

### 10.7 Solver Diagnostics

```cpp
updateSolveStatus():
  // Initial DOF = numberOfComponents * 6  (6 DOF per rigid body)
  mbdAssembly.jointsMotionsDo([](Joint jm) {
    jm.constraintsDo([](Constraint con) {
      spec = con.constraintSpec();
      if (spec.startsWith("Redundant")) isRedundant = true;
      --lastDoF;  // each constraint removes 1 DOF
    });
  });
  // Result: DOF, conflicting joints, redundant joints, malformed
```

### 10.8 Pre-Solve & Parallel Prevention

```python
# JointObject.py
Joint.preSolve(joint):
  # Position parts to avoid solver failures
  # Match JCS in closest direction (matched or flipped)
  self.matchJCS(joint, savePlc)

Joint.preventParallel(joint):
  # Angle/Perpendicular joints fail when JCS are parallel
  # Slightly rotate one part to break parallelism
  if self.areJcsZParallel(joint):
    rotate_part_slightly()
```

---

## 11. Sketch Analysis & Auto-Constraint

**Source:** `src/Mod/Sketcher/App/SketchAnalysis.cpp`

### 11.1 Auto-Constraint Detection

```cpp
SketchAnalysis::autoconstraint(precision, angleprecision, includeconstruction):
  1. detectMissingPointOnPointConstraints(precision)
     — Find near-coincident points within tolerance
     — Create Coincident constraints

  2. detectMissingVerticalHorizontalConstraints(angleprecision)
     — Check edges for near-vertical/horizontal alignment
     — checkVertical(dir, angleprecision): |dir.x/dir.y| < tan(precision)
     — checkHorizontal(dir, angleprecision): |dir.y/dir.x| < tan(precision)

  3. detectMissingEqualityConstraints(precision)
     — Find segments with equal lengths
     — Create Equal constraints

  4. Apply constraints one-by-one with validation:
     makeConstraintsOneByOne(ids):
       for each constraint:
         sketch.addConstraint(constraint)
         solvesketch(status, dofs, true)
         if (status < 0):  // overconstrained
           sketch.removeConstraint(lastAdded)
```

### 11.2 Sketch Solve Integration

```cpp
SketchObject::solve(updateGeoAfterSolving):
  Return codes:
    0  — Success
   -1  — Solver error
   -2  — Redundant constraints
   -3  — Conflicting constraints
   -4  — Overconstrained
   -5  — Malformed constraints

  After solve:
  - updateGeometry()  — write solver params back to OCCT geometry
  - updateNonDrivingConstraints()  — evaluate reference dimensions
```

### 11.3 Geometry Types in Sketch

```cpp
enum GeoType {
    None = 0,
    Point = 1,
    Line = 2,
    Arc = 3,
    Circle = 4,
    Ellipse = 5,
    ArcOfEllipse = 6,
    ArcOfHyperbola = 7,
    ArcOfParabola = 8,
    BSpline = 9
};
```

### 11.4 Sketcher Constraint Types

```
Constraint types (Sketcher level):
  None, Coincident, Block, Horizontal, Vertical,
  Parallel, Tangent, Distance, DistanceX, DistanceY,
  Angle, Perpendicular, Radius, Equal,
  PointOnObject, Symmetric, InternalAlignment,
  SnellsLaw, Diameter, Weight

InternalAlignment subtypes:
  EllipseMajorDiameter, EllipseMinorDiameter,
  EllipseFocus1, EllipseFocus2,
  HyperbolaMajor, HyperbolaMinor, HyperbolaFocus,
  ParabolaFocus, BSplineControlPoint, BSplineKnotPoint,
  ParabolaFocalAxis
```

---

## Implementation Priority for r3ditor

Based on the r3ditor architecture and existing cad-kernel, the following FreeCAD algorithms should be prioritized:

### Tier 1 — Core (Already partially implemented)
| Algorithm | FreeCAD Source | r3ditor Status |
|-----------|---------------|----------------|
| PlaneGCS constraint solver | `planegcs/GCS.cpp` | constraint-solver has DogLeg→LM→BFGS cascade ✅ |
| TNP element naming | `TopoShapeExpansion.cpp` | naming.rs has basic TNS ✅ |
| Feature tree recomputation | `PartDesign::Feature` | document.rs has dep graph ✅ |
| Boolean operations | `FCBRepAlgoAPI_*` | operations.rs has basic booleans ✅ |
| Mesh tessellation | `MeshPart/Tessellation` | tessellation.rs has basic impl ✅ |

### Tier 2 — Next Implementation
| Algorithm | FreeCAD Source | Implementation Notes |
|-----------|---------------|---------------------|
| Extrude (Pad/Pocket) | `FeatureExtrude.cpp` | Add UpToFirst/UpToFace/TwoLengths modes |
| Revolution (Revolution/Groove) | `FeatureRevolution.cpp` | Add axis selection + angle modes |
| Pattern transforms | `FeatureLinearPattern.cpp` | Linear/Polar/Mirror via gp_Trsf list |
| DOF diagnosis | `GCS::diagnose()` | QR rank analysis for constraint status |
| Auto-constraint | `SketchAnalysis.cpp` | Coincident/horizontal/vertical detection |

### Tier 3 — Advanced Features
| Algorithm | FreeCAD Source | Implementation Notes |
|-----------|---------------|---------------------|
| Sweep/Pipe | `FeaturePipe.cpp` | BRepOffsetAPI_MakePipeShell equivalent |
| Loft | `FeatureLoft.cpp` | BRepOffsetAPI_ThruSections equivalent |
| Assembly solver | `AssemblyObject.cpp` | MbD joint system with marker pairs |
| Adaptive clearing | `Adaptive.cpp` | Clipper-based ClearedArea tracking |
| Shape healing | `ShapeFix_*` | Tolerance management pipeline |
| QEM decimation | `MeshSimplify` | Quadric error metric mesh simplification |

### Tier 4 — Production Polish
| Algorithm | FreeCAD Source | Implementation Notes |
|-----------|---------------|---------------------|
| Waterline machining | `Waterline.py` | OCL dropcutter + adaptive |
| Variable fillet | `FeatureFillet.cpp` | radius1/radius2 per edge |
| MultiTransform | `FeatureMultiTransform.cpp` | Product of transform lists |
| B-spline constraints | `Constraints.cpp` | SlopeAtKnot, PointOnBSpline |
| Surface reconstruction | PCL integration | Poisson/Greedy/MarchingCubes |

---

## Key Architectural Patterns to Adopt

### 1. Cascading Solver (from PlaneGCS)
```rust
// Already implemented in constraint-solver
enum SolveAlgorithm { DogLeg, LevenbergMarquardt, BFGS }
// Try each in sequence, fallback on failure
```

### 2. Mapper Pattern (from TNP)
```rust
// For persistent element naming across operations
trait ShapeMapper {
    fn modified(&self, element: &TopoElement) -> Vec<TopoElement>;
    fn generated(&self, element: &TopoElement) -> Vec<TopoElement>;
}
```

### 3. AddSub Pattern (from PartDesign)
```rust
// Every feature is either Additive or Subtractive
enum FeatureType { Additive, Subtractive }
// execute() → get shape → boolean fuse/cut with base
```

### 4. Transform Abstraction (from Transformed)
```rust
// All patterns share: virtual getTransformations() → Vec<Transform>
// execute() applies transforms and does compound boolean
trait TransformFeature {
    fn get_transformations(&self) -> Vec<Mat4>;
}
```

### 5. Joint Type Dispatch (from Assembly)
```rust
// Map geometric configuration to constraint type
enum JointKind { Fixed, Revolute, Cylindrical, Slider, Ball, ... }
// Distance joint → runtime dispatch based on face/edge/vertex types
```

### 6. ClearedArea Tracking (from Adaptive CAM)
```rust
// 2D boolean union of tool envelope along toolpath
// Used for: link move classification, remaining stock detection
struct ClearedArea { paths: Vec<Polygon> }
```
