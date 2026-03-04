# ManuShop CAD/CAM Editor — Optimal Open-Source Architecture

> **Brand-New, High-Performance, Multicore, GPU-Accelerated, Intuitive 3D CAD/CAM Environment**
>
> Generated from the DFM Quote Suite project stack audit — March 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Project Stack (Audit)](#2-current-project-stack-audit)
3. [Target Architecture Vision](#3-target-architecture-vision)
4. [Core Architecture — ECS + B-Rep Hybrid](#4-core-architecture--ecs--b-rep-hybrid)
5. [CAD Kernel Layer](#5-cad-kernel-layer)
6. [CAM/Manufacturing Layer](#6-cammanufacturing-layer)
7. [GPU Acceleration Pipeline](#7-gpu-acceleration-pipeline)
8. [Multicore Parallelism Strategy](#8-multicore-parallelism-strategy)
9. [Rendering Engine](#9-rendering-engine)
10. [User Interface / UX Layer](#10-user-interface--ux-layer)
11. [File Format & Data Exchange](#11-file-format--data-exchange)
12. [Plugin / Extension Architecture](#12-plugin--extension-architecture)
13. [Deployment Topology](#13-deployment-topology)
14. [Complete Technology Matrix](#14-complete-technology-matrix)
15. [Crate / Package Dependency Map](#15-crate--package-dependency-map)
16. [Performance Targets](#16-performance-targets)
17. [Migration Path from Current Stack](#17-migration-path-from-current-stack)
18. [Appendix A — Full Current Stack Inventory](#appendix-a--full-current-stack-inventory)
19. [Appendix B — Recommended Crate Versions](#appendix-b--recommended-crate-versions)

---

## 1. Executive Summary

This document defines the **optimal software architecture** for a brand-new open-source 3D CAD/CAM editor, derived from auditing the existing **DFM Quote Suite** monorepo and mapping its capabilities onto a production-grade, multicore, GPU-accelerated design environment.

### Design Principles

| # | Principle | Implementation |
|---|-----------|---------------|
| 1 | **Rust-first, zero-cost abstractions** | All kernel, compute, and rendering code in Rust 2021 edition |
| 2 | **GPU-native geometry processing** | wgpu 28 (Vulkan/Metal/DX12/WebGPU) for tessellation, BVH, booleans |
| 3 | **Multicore by default** | Rayon data parallelism + Tokio async I/O + ECS parallel schedules |
| 4 | **B-Rep + mesh dual representation** | NURBS/B-Rep for CAD accuracy, GPU mesh for visualization & CAM |
| 5 | **Modular crate ecosystem** | Ship-of-Theseus design — every subsystem is a replaceable crate |
| 6 | **Web-native deployment** | WASM target for browser, native target for desktop, shared core |
| 7 | **Intuitive, modern UI** | egui immediate-mode for viewport, React/Tauri for panels & workflows |
| 8 | **DFM + quoting integrated** | Manufacturing analysis is a first-class citizen, not an afterthought |

---

## 2. Current Project Stack (Audit)

### 2.1 What We Have Today

```
┌─────────────────────────────────────────────────────────────────┐
│                    DFM QUOTE SUITE (Current)                    │
├─────────────────────────────────────────────────────────────────┤
│  GUI              │ React 18 + Three.js 0.170 + R3F + Drei     │
│  Build            │ Vite 6.0 + TypeScript 5.6 + Tailwind 3.4   │
│  API Gateway      │ Axum 0.7 + Tokio + utoipa Swagger           │
│  Worker Analysis  │ Rust + wgpu 0.19 + physics estimators       │
│  Worker CAD       │ Rust + OpenCascade (sidecar container)      │
│  WASM MeshKit     │ wasm-bindgen + STL parse + simplify + DFM   │
│  Shared Types     │ Rust crate (api, dfm, estimation, materials)│
│  Database         │ PostgreSQL 16 (sqlx 0.7, migrations)        │
│  Cache/Queue      │ Redis 7 (streams)                           │
│  Object Storage   │ MinIO / S3 (aws-sdk-s3 v1)                 │
│  Containers       │ Docker multi-stage, docker-compose          │
│  Orchestration    │ Kubernetes (GPU node pool)                  │
│  Observability    │ Prometheus + Grafana                        │
│  Platform Plugins │ Shopify, WooCommerce, BigCommerce, Magento, Wix │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Strengths to Preserve

- ✅ **Rust backend** — memory safety, performance, fearless concurrency
- ✅ **wgpu GPU compute** — cross-platform GPU, already in the stack
- ✅ **Physics-based estimators** — Kienzle, Loewen-Shaw, Altintas, laser/plasma/waterjet models
- ✅ **17 sheet materials + 6 CNC materials** — real-world data with thicknesses/properties
- ✅ **WASM mesh processing** — client-side STL parsing, simplification, LOD
- ✅ **OpenCascade integration** — STEP/IGES import/export via sidecar
- ✅ **Multi-tenant SaaS architecture** — JWT, tenant headers, platform adapters
- ✅ **Docker + K8s deployment** — GPU-enabled worker pods, auto-scaling

### 2.3 Gaps to Fill for a Full CAD/CAM Editor

| Gap | Current State | Required |
|-----|---------------|----------|
| **Parametric modeling** | None — upload-only | Sketch → extrude → fillet → assembly workflow |
| **Constraint solver** | None | 2D geometric constraints + 3D assembly constraints |
| **History tree** | None | Feature-based parametric history with rollback |
| **Direct editing** | None | Push/pull, move face, offset, shell |
| **Toolpath generation** | Estimation only | Full CNC G-code, laser paths, nesting |
| **Simulation** | Physics pricing models | FEA stress, thermal, modal analysis |
| **Multi-viewport** | Single Three.js canvas | Quad-view, cross-sections, drawing views |
| **Undo/redo** | None | Command pattern with full state snapshots |
| **Real-time collaboration** | None | CRDT-based multi-user editing |
| **Desktop app** | Browser-only | Tauri native shell with system GPU access |

---

## 3. Target Architecture Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MANUSHOP CAD/CAM EDITOR                              │
│                    "Open-Source Fusion 360 Killer"                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  Tauri Shell │  │ egui Viewport│  │  React Panels│  │  Web (WASM)   │   │
│  │  (Desktop)   │  │ (3D Canvas)  │  │  (Sidebar)   │  │  (Browser)    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘   │
│         │                 │                  │                   │           │
│  ┌──────┴─────────────────┴──────────────────┴───────────────────┴───────┐   │
│  │                     EDITOR SHELL (ECS Orchestrator)                   │   │
│  │          Bevy-like ECS: Entities + Components + Systems               │   │
│  │     ┌─────────────────────────────────────────────────────────┐       │   │
│  │     │  Schedule: [Input] → [Constraint] → [Rebuild] → [Render]│      │   │
│  │     └─────────────────────────────────────────────────────────┘       │   │
│  └──────┬───────────────────┬──────────────────┬────────────────────┬────┘   │
│         │                   │                  │                    │        │
│  ┌──────┴───────┐  ┌───────┴──────┐  ┌────────┴──────┐  ┌─────────┴─────┐  │
│  │  CAD Kernel  │  │ CAM Engine   │  │  DFM Analyzer │  │  Renderer     │  │
│  │  ───────────  │  │ ────────────  │  │ ──────────── │  │ ──────────    │  │
│  │ • B-Rep/NURBS │  │ • Toolpaths   │  │ • Wall thick │  │ • wgpu 28    │  │
│  │ • Constraints │  │ • G-code gen  │  │ • Draft angle│  │ • PBR + IBL  │  │
│  │ • Booleans    │  │ • Nesting     │  │ • Undercuts  │  │ • Shadows    │  │
│  │ • Fillets     │  │ • Feeds/speeds│  │ • Estimator  │  │ • SSAO/Bloom │  │
│  │ • History tree│  │ • Post-proc   │  │ • Sheet metal│  │ • GPU culling│  │
│  └──────────────┘  └──────────────┘  └───────────────┘  └───────────────┘  │
│         │                   │                  │                    │        │
│  ┌──────┴───────────────────┴──────────────────┴────────────────────┴────┐   │
│  │                      GPU COMPUTE LAYER (wgpu)                        │   │
│  │  Tessellation │ BVH Build │ Boolean Ops │ FEA Solve │ Nesting Opt   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         │                   │                  │                    │        │
│  ┌──────┴───────────────────┴──────────────────┴────────────────────┴────┐   │
│  │                    PERSISTENCE + COLLABORATION                        │   │
│  │    SQLite (local) │ PostgreSQL (cloud) │ CRDT Sync │ S3 Assets       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Core Architecture — ECS + B-Rep Hybrid

### 4.1 Why ECS for a CAD Editor

Traditional CAD apps use monolithic object hierarchies. We use an **Entity-Component-System** pattern inspired by Bevy for:

- **Parallel system scheduling** — constraint solving, tessellation, rendering run concurrently
- **Cache-friendly memory layout** — components stored contiguously in SoA (struct-of-arrays)
- **Decoupled logic** — new manufacturing processes = new systems, no touching existing code
- **Hot-reload friendly** — reload WASM plugin systems at runtime without restarting

### 4.2 ECS Data Model

```rust
// ─── Core Entity Archetypes ───

// A geometric body (part, assembly, sketch)
struct BodyEntity {
    id: Entity,
    // Components:
    brep: BRepTopology,         // Vertices, edges, faces, shells, solids
    nurbs: NurbsGeometry,       // Curves & surfaces (parametric definition)
    mesh: TriMesh,              // GPU-ready tessellation (generated)
    transform: Transform3D,     // Position, rotation, scale
    material: PhysicalMaterial, // Density, yield strength, hardness, etc.
    appearance: Appearance,     // Color, texture, PBR params
    history: FeatureHistory,    // Parametric feature tree
    constraints: Constraints,   // Geometric & dimensional constraints
    metadata: PartMetadata,     // Name, part number, revision
}

// A manufacturing job (CNC, laser, bend, etc.)
struct ManufacturingEntity {
    id: Entity,
    body_ref: Entity,           // Link to the body
    process: ManufacturingProcess,
    material: SheetMaterial | CncMaterial,
    estimation: QuoteEstimation,
    toolpaths: Vec<Toolpath>,
    gcode: Option<GCodeProgram>,
    dfm_findings: Vec<DfmFinding>,
}

// A 2D sketch (lives on a plane or face)
struct SketchEntity {
    id: Entity,
    plane: SketchPlane,
    curves: Vec<SketchCurve>,   // Lines, arcs, splines, conics
    constraints: Vec<SketchConstraint>, // Coincident, parallel, tangent, dimension
    solved: bool,
}
```

### 4.3 System Schedule (per frame)

```
Frame N:
  ┌─ Stage 1: INPUT ─────────────────────────────────┐
  │  • Mouse/keyboard → pick/select/transform         │
  │  • Sketch input → add/modify curves               │
  │  • Command execution → push to history             │
  │  • File import → deserialize into entities         │
  └────────────────────────────────────────────────────┘
                         ↓
  ┌─ Stage 2: SOLVE (parallel) ───────────────────────┐
  │  • 2D constraint solver (Newton-Raphson)           │ ← Rayon par_iter
  │  • 3D assembly constraint solver                   │ ← GPU compute
  │  • Parametric history replay (if params changed)   │
  └────────────────────────────────────────────────────┘
                         ↓
  ┌─ Stage 3: REBUILD (parallel) ─────────────────────┐
  │  • B-Rep boolean operations                        │ ← GPU compute
  │  • Fillet/chamfer generation                       │
  │  • Tessellation (NURBS → triangles)                │ ← GPU compute
  │  • BVH rebuild for ray-casting                     │ ← GPU compute
  │  • DFM analysis (if geometry changed)              │ ← Rayon par_iter
  │  • Cost re-estimation (if process/material changed)│
  └────────────────────────────────────────────────────┘
                         ↓
  ┌─ Stage 4: RENDER ─────────────────────────────────┐
  │  • Frustum culling (GPU)                           │
  │  • Draw opaque pass (PBR, shadows)                 │
  │  • Draw transparent pass                           │
  │  • Edge overlay (wireframe, silhouette)            │
  │  • Gizmo / handle overlay                          │
  │  • UI overlay (egui)                               │
  │  • Present frame                                   │
  └────────────────────────────────────────────────────┘
```

---

## 5. CAD Kernel Layer

### 5.1 Dual-Kernel Strategy

| Kernel | Purpose | Tech | License |
|--------|---------|------|---------|
| **Truck** (primary) | Pure-Rust B-Rep/NURBS kernel | `truck-*` crate family | Apache 2.0 |
| **OpenCascade** (secondary) | STEP/IGES import/export, advanced booleans | `opencascade-rs` 0.2 | LGPL-2.1 |
| **Fornjot** (experimental) | Future pure-Rust replacement for OCCT | `fj-core` 0.49 | 0BSD |

### 5.2 Truck Crate Ecosystem (Pure Rust, WebGPU-native)

```toml
# Core geometry
truck-base       = "0.6"    # cgmath, tolerance, curve/surface traits
truck-geotrait   = "0.6"    # ParametricCurve, ParametricSurface traits
truck-geometry   = "0.6"    # KnotVec, BSpline, NURBS curves & surfaces
truck-topology   = "0.6"    # Vertex, Edge, Wire, Face, Shell, Solid
truck-modeling   = "0.6"    # Integrated modeling: extrude, revolve, sweep, loft
truck-shapeops   = "0.6"    # Boolean operations (union, cut, intersect) on Solids
truck-meshalgo   = "0.6"    # Tessellation, mesh generation from B-Rep
truck-polymesh   = "0.6"    # Polygon mesh data structure + algorithms

# Rendering (wgpu-native)
truck-platform   = "0.6"    # wgpu abstraction, render pipelines
truck-rendimpl   = "0.6"    # Shape + mesh visualization

# Import/Export
truck-stepio     = "0.6"    # STEP file read/write

# Scripting / WASM
truck-js         = "*"      # JavaScript/WASM bindings
```

### 5.3 Parametric Feature Tree

```rust
enum Feature {
    Sketch2D {
        plane: SketchPlane,
        profile: ClosedWire,
        constraints: Vec<SketchConstraint>,
    },
    Extrude {
        profile: FeatureRef,    // → Sketch2D
        distance: Parameter,    // Can be driven by a dimension
        direction: ExtrudeDir,  // Blind, symmetric, to-face, through-all
        draft_angle: Option<Angle>,
    },
    Revolve {
        profile: FeatureRef,
        axis: Axis,
        angle: Parameter,
    },
    Fillet {
        edges: Vec<EdgeRef>,
        radius: Parameter,
    },
    Chamfer {
        edges: Vec<EdgeRef>,
        distance: Parameter,
    },
    BooleanOp {
        op: BooleanType,    // Union, Cut, Intersect
        tool: FeatureRef,
        target: FeatureRef,
    },
    SheetMetalBend {
        face: FaceRef,
        bend_line: Wire,
        angle: Parameter,
        radius: Parameter,
        k_factor: f64,
    },
    Pattern {
        feature: FeatureRef,
        pattern_type: PatternType, // Linear, circular, mirror
        count: Parameter,
        spacing: Parameter,
    },
    Shell {
        faces_to_remove: Vec<FaceRef>,
        thickness: Parameter,
    },
    Import {
        format: FileFormat,
        data: Vec<u8>,
    },
}
```

### 5.4 Constraint Solver

```
2D Sketch Constraints (Newton-Raphson iterative solver):
  • Coincident      — point-on-point, point-on-line, point-on-circle
  • Horizontal      — line/segment parallel to X axis
  • Vertical        — line/segment parallel to Y axis
  • Parallel        — two lines parallel
  • Perpendicular   — two lines at 90°
  • Tangent         — line-to-arc, arc-to-arc
  • Equal           — equal length/radius
  • Symmetric       — mirror about a line
  • Dimension       — distance, angle, radius (driving or driven)
  • Fix             — lock point/line in place

3D Assembly Constraints (iterative position solver):
  • Mate (face flush)
  • Align (axis collinear)
  • Offset (face distance)
  • Angle (between planes)
  • Gear (rotational coupling)
  • Tangent (surface-to-surface)

Solver tech: Rust implementation with Rayon parallelism for
large systems, GPU fallback for >10K constraint equations.
```

---

## 6. CAM/Manufacturing Layer

### 6.1 Existing Physics Models (Preserved + Enhanced)

#### CNC Machining (from current `estimator.rs`)

| Model | Formula | Application |
|-------|---------|-------------|
| **Kienzle** | $F_c = k_{c1.1} \cdot b \cdot h^{1-m_c}$ | Cutting force prediction |
| **Power-limited MRR** | $MRR = \min(MRR_{geom}, \frac{P_{spindle} \cdot \eta}{k_c})$ | Material removal rate |
| **Taylor** | $V \cdot T^n = C$ | Tool life prediction |
| **Loewen-Shaw** | $\theta = \frac{0.754 \cdot \mu \cdot V \cdot F_c}{k \cdot \sqrt{l_c}}$ | Thermal analysis |
| **Altintas** | $a_{lim} = \frac{-1}{2 K_f \cdot Re[G(j\omega_c)]}$ | Chatter stability |
| **Surface finish** | $R_a = \frac{f^2}{32 \cdot r_{nose}}$ | Ra prediction |

#### Sheet Metal Cutting (from current `sheet_estimator.rs`)

| Method | Speed Model | Application |
|--------|-------------|-------------|
| **Fiber Laser** | $v = \frac{P}{t^{1.6}} \cdot k_{mat}$ | High-speed thin metal |
| **CO₂ Laser** | $v = \frac{P}{t^{1.6}} \cdot k_{mat} \cdot 0.75$ | Thick steel, non-metals |
| **Plasma** | $v = \frac{I}{t^{0.8}} \cdot k_{mat}$ | Heavy plate cutting |
| **Waterjet** | $v = \frac{P}{t^{1.2} \cdot H_{BHN}} \cdot k_{mat}$ | No HAZ, any material |

#### Press Brake Bending (from current `sheet_estimator.rs`)

| Parameter | Formula |
|-----------|---------|
| **Tonnage** | $T = \frac{C \cdot L \cdot t^2 \cdot \sigma_u}{W \cdot 1000}$ |
| **Bend allowance** | $BA = (\frac{\pi}{180}) \cdot \theta \cdot (r + k \cdot t)$ |
| **Springback** | $\alpha_{actual} = \alpha_{target} + \frac{\sigma_y \cdot t}{2 \cdot E \cdot r}$ |

### 6.2 New CAM Capabilities

```
Toolpath Generation Pipeline:
  ┌─ B-Rep geometry ──────────────────────────────────────┐
  │                                                        │
  ├─→ CNC Milling                                         │
  │   ├─ Roughing: Adaptive clearing (Trochoidal/HSM)     │
  │   ├─ Semi-finish: Constant stepover waterline          │
  │   ├─ Finish: Parallel, spiral, pencil, scallop         │
  │   ├─ Drilling: Peck, chip-break, deep-hole             │
  │   └─ G-code post-processor (Fanuc, Haas, Mazak, etc.) │
  │                                                        │
  ├─→ Sheet Metal Cutting                                  │
  │   ├─ 2D nesting (rectangular + true-shape NFP)         │
  │   ├─ Lead-in/lead-out strategies                       │
  │   ├─ Kerf compensation                                 │
  │   ├─ Tab/micro-joint placement                         │
  │   ├─ Common-line cutting optimization                  │
  │   └─ NC code generation (G-code, EIA, ESSI)           │
  │                                                        │
  ├─→ Bending                                              │
  │   ├─ Bend sequence optimization                        │
  │   ├─ Collision detection (tool/part interference)      │
  │   ├─ Flat pattern generation                           │
  │   └─ Press brake program generation                    │
  │                                                        │
  └─→ 3D Printing (future)                                 │
      ├─ Slicing (adaptive layer height)                   │
      ├─ Support generation                                │
      ├─ Infill patterns                                   │
      └─ G-code (Marlin, Klipper)                          │
  └────────────────────────────────────────────────────────┘
```

### 6.3 17 Sheet Materials + 6 CNC Materials (Current Catalog)

**Sheet Materials:**

| ID | Material | Group | Available Thicknesses (in) |
|----|----------|-------|---------------------------|
| `al5052` | Aluminum 5052-H32 | Aluminum | 0.032 – 0.250 |
| `al6061` | Aluminum 6061-T6 | Aluminum | 0.040 – 0.250 |
| `al7075` | Aluminum 7075-T6 | Aluminum | 0.040 – 0.190 |
| `mild_steel` | Mild Steel A36 | Steel | 0.030 – 0.500 |
| `ar500` | AR500 Armor Steel | Steel | 0.188 – 0.500 |
| `spring_1075` | Spring Steel 1075 | Steel | 0.015 – 0.125 |
| `steel_1095` | High Carbon 1095 | Steel | 0.025 – 0.125 |
| `ss304_sheet` | Stainless 304 | Stainless | 0.024 – 0.250 |
| `ss316_sheet` | Stainless 316L | Stainless | 0.030 – 0.250 |
| `ti_grade2` | Titanium Grade 2 | Titanium | 0.020 – 0.125 |
| `ti_grade5` | Titanium Grade 5 | Titanium | 0.032 – 0.190 |
| `copper_110` | Copper 110 | Copper/Brass | 0.021 – 0.125 |
| `brass_260` | Brass 260 | Copper/Brass | 0.025 – 0.125 |
| `carbon_fiber` | Carbon Fiber | Composites | 0.020 – 0.125 |
| `acrylic_clear` | Clear Acrylic | Plastics | 0.060 – 0.500 |
| `polycarbonate` | Polycarbonate | Plastics | 0.060 – 0.250 |
| `neoprene` | Neoprene Rubber | Rubber | 0.063 – 0.250 |

**CNC Materials:**

| ID | Material | Density (g/cm³) | Yield (MPa) | Machinability |
|----|----------|-----------------|-------------|---------------|
| `al6061` | Aluminum 6061-T6 | 2.71 | 276 | Excellent |
| `al7075` | Aluminum 7075-T6 | 2.81 | 503 | Good |
| `ss304` | Stainless 304 | 8.00 | 215 | Moderate |
| `steel1018` | Steel 1018 | 7.87 | 370 | Good |
| `ti64` | Titanium 6Al-4V | 4.43 | 880 | Difficult |
| `pom` | POM/Delrin | 1.41 | 69 | Excellent |

---

## 7. GPU Acceleration Pipeline

### 7.1 GPU Compute Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    GPU COMPUTE (wgpu 28)                     │
│                                                              │
│  Backend Selection (auto-detected):                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Vulkan   │ │ Metal    │ │ DX12     │ │ WebGPU       │   │
│  │ (Linux/  │ │ (macOS/  │ │ (Windows)│ │ (Browser/    │   │
│  │ Windows) │ │  iOS)    │ │          │ │  WASM)       │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                              │
│  Compute Shaders (WGSL):                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  tessellation.wgsl   — NURBS → triangle mesh        │    │
│  │  bvh_build.wgsl      — BVH tree construction        │    │
│  │  raytrace.wgsl       — Ray-triangle intersection    │    │
│  │  boolean_ops.wgsl    — CSG union/cut/intersect      │    │
│  │  nesting.wgsl        — 2D part nesting optimization │    │
│  │  toolpath.wgsl       — Parallel toolpath offset      │    │
│  │  fea_solve.wgsl      — FEA matrix assembly + solve  │    │
│  │  collision.wgsl      — Interference detection        │    │
│  │  culling.wgsl        — Frustum + occlusion culling  │    │
│  │  sdf_eval.wgsl       — Signed distance field eval   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Memory Management:                                          │
│  • Persistent GPU buffers for active model (~256MB budget)   │
│  • Double-buffered vertex/index for zero-stall rendering     │
│  • Staging ring-buffer for CPU→GPU uploads                   │
│  • Readback buffer pool for GPU→CPU results                  │
│  • Bindless textures via storage buffer arrays               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 WGSL Shader Budget

| Shader | Workgroup | Dispatch Strategy | Latency Target |
|--------|-----------|-------------------|----------------|
| `tessellation` | 256×1×1 | 1 dispatch per NURBS patch | < 2ms for 1M tris |
| `bvh_build` | 128×1×1 | Radix sort + LBVH | < 5ms for 1M tris |
| `raytrace` | 8×8×1 | Per-pixel for picking/AO | < 1ms per ray batch |
| `boolean_ops` | 256×1×1 | Per-face pair classification | < 50ms for complex booleans |
| `nesting` | 64×1×1 | Per-candidate-rotation evaluation | < 100ms for 50 parts |
| `fea_solve` | 256×1×1 | Conjugate gradient iterations | < 2s for 100K DOF |
| `culling` | 64×1×1 | Per-instance visibility | < 0.1ms |

### 7.3 GPU Pipeline Architecture

```
                    ┌──────────────────┐
                    │  APPLICATION     │
                    │  (ECS Systems)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
    │  COMPUTE    │ │  COMPUTE     │ │  COMPUTE     │
    │  PASS 1     │ │  PASS 2      │ │  PASS 3      │
    │ Tessellate  │ │ BVH Build    │ │ Culling      │
    │ + Normals   │ │ + Raytrace   │ │ + Sort       │
    └──────┬──────┘ └──────┬───────┘ └──────┬───────┘
           │               │                │
           └───────────────┼────────────────┘
                           ▼
              ┌────────────────────────┐
              │    RENDER PASS         │
              │  ┌──────────────────┐  │
              │  │ Depth Pre-pass   │  │
              │  │ Shadow Maps      │  │
              │  │ G-Buffer (PBR)   │  │
              │  │ Lighting         │  │
              │  │ SSAO + Bloom     │  │
              │  │ Edge Detection   │  │
              │  │ AA (TAA/FXAA)    │  │
              │  │ Gizmo Overlay    │  │
              │  │ UI Overlay (egui)│  │
              │  └──────────────────┘  │
              └────────┬───────────────┘
                       ▼
              ┌────────────────────┐
              │   PRESENT          │
              │   (Swap Chain)     │
              └────────────────────┘
```

---

## 8. Multicore Parallelism Strategy

### 8.1 Three-Level Parallelism

```
Level 1: SYSTEM PARALLELISM (ECS schedule)
  ┌───────────────────────────────────────────────────┐
  │  Independent systems run concurrently:              │
  │  Thread 0: Constraint solver                        │
  │  Thread 1: DFM analysis                             │
  │  Thread 2: Cost estimation                          │
  │  Thread 3: Undo history snapshot                    │
  │  Thread 4: File auto-save                           │
  │  Thread 5: Network sync (CRDT)                      │
  │  Threads 6-N: Render preparation                    │
  └───────────────────────────────────────────────────┘

Level 2: DATA PARALLELISM (Rayon)
  ┌───────────────────────────────────────────────────┐
  │  Within a single system, parallel over data:        │
  │  • par_iter() over faces for tessellation           │
  │  • par_iter() over edges for fillet generation      │
  │  • par_iter() over parts for DFM checks             │
  │  • par_iter() over materials for cost estimation     │
  │  • par_bridge() to chain GPU readback into CPU work │
  └───────────────────────────────────────────────────┘

Level 3: GPU PARALLELISM (wgpu compute shaders)
  ┌───────────────────────────────────────────────────┐
  │  Massively parallel over geometry primitives:       │
  │  • 256 threads per workgroup × thousands of groups  │
  │  • NURBS evaluation: 1 thread per sample point      │
  │  • BVH: 1 thread per triangle for LBVH              │
  │  • Boolean: 1 thread per face-pair classification   │
  │  • Nesting: 1 thread per candidate placement        │
  └───────────────────────────────────────────────────┘
```

### 8.2 Async I/O (Tokio)

```rust
// Non-blocking I/O for file operations, network, database
#[tokio::main]
async fn main() {
    // File import runs async, doesn't block viewport
    let model = tokio::spawn(async { import_step("part.step").await });
    
    // Cloud sync runs in background
    let sync = tokio::spawn(async { crdt_sync_loop().await });
    
    // Redis stream consumer for remote analysis jobs
    let worker = tokio::spawn(async { redis_consumer_loop().await });
    
    // Main thread runs the ECS + render loop
    run_editor_loop().await;
}
```

### 8.3 Thread Budget (Target: 16-core Machine)

| Thread Pool | Threads | Purpose |
|-------------|---------|---------|
| **Rayon global** | N-2 (14) | Data-parallel geometry processing |
| **Tokio runtime** | 4 | Async I/O (file, network, DB) |
| **Render thread** | 1 (dedicated) | wgpu command encoding + submit |
| **Main thread** | 1 | ECS schedule, input, UI |
| **GPU** | — | Thousands of shader invocations |

---

## 9. Rendering Engine

### 9.1 Render Pipeline

| Pass | Description | GPU Cost |
|------|-------------|----------|
| **Z Pre-pass** | Early depth, enables Hi-Z culling | Low |
| **Shadow Maps** | Cascaded shadow maps (4 cascades) | Medium |
| **G-Buffer** | Albedo, normal, metallic-roughness, emission | Medium |
| **Deferred Lighting** | PBR (Cook-Torrance BRDF), IBL, point/spot/directional | Medium |
| **SSAO** | Screen-space ambient occlusion (GTAO variant) | Low |
| **Edge Detection** | Sobel on depth + normal for CAD-style wireframe | Low |
| **Silhouette** | Geometry shader / screen-space edge detection | Low |
| **Bloom** | High dynamic range glow (13-pass progressive) | Low |
| **TAA** | Temporal anti-aliasing with jitter + history | Low |
| **Gizmo Overlay** | Transform handles, dimension labels, snapping indicators | Minimal |
| **egui Overlay** | Immediate-mode UI (toolbars, panels, property sheets) | Minimal |

### 9.2 Visual Modes

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  SHADED     │ │  WIREFRAME  │ │  X-RAY      │ │  TECHNICAL  │
│  PBR+Shadow │ │  Edges only │ │  Transparent │ │  Drawing    │
│  Full color │ │  + silhouette│ │  + edges    │ │  Orthogonal │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  DFM        │ │  STRESS     │ │  TOOLPATH   │ │  SECTION    │
│  Color-coded│ │  FEA heatmap│ │  Show paths │ │  Cross-cut  │
│  by finding │ │  von Mises  │ │  + simulate │ │  clipping   │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### 9.3 Tech Stack for Rendering

```toml
# Rendering dependencies
wgpu          = "28.0"     # Cross-platform GPU (Vulkan/Metal/DX12/WebGPU)
naga          = "28.0"     # Shader translation (WGSL → SPIR-V/MSL/HLSL)
egui          = "0.31"     # Immediate-mode GUI for viewport overlays
egui-wgpu     = "0.31"     # egui backend for wgpu
egui-winit    = "0.31"     # egui input adapter for winit
winit         = "0.30"     # Cross-platform windowing
glam          = "0.29"     # Fast math (SSE/NEON SIMD) — vec2/3/4, mat3/4, quat
image         = "0.25"     # Texture loading (PNG, JPEG, HDR, EXR)
```

---

## 10. User Interface / UX Layer

### 10.1 Dual UI Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    DESKTOP (Tauri 2.x)                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Native Title Bar + Menu                 │    │
│  ├─────────────────┬───────────────────────────────────┤    │
│  │  TREE VIEW      │        3D VIEWPORT                │    │
│  │  (React)        │        (egui + wgpu)              │    │
│  │  ─────────      │        ─────────────              │    │
│  │  ☰ History      │        [Rendered 3D scene]        │    │
│  │  ├─ Sketch 1    │        [Gizmos + handles]         │    │
│  │  ├─ Extrude     │        [Selection highlights]     │    │
│  │  ├─ Fillet      │        [Dimension annotations]    │    │
│  │  ├─ Cut         │        [Toolbar — egui]           │    │
│  │  └─ Shell       │                                   │    │
│  │                  │                                   │    │
│  │  ☰ Assembly     │                                   │    │
│  │  ├─ Part A      │                                   │    │
│  │  └─ Part B      │                                   │    │
│  │                  │                                   │    │
│  │  ☰ Manufacturing│                                   │    │
│  │  ├─ CNC Setup   │                                   │    │
│  │  ├─ Laser Cut   │                                   │    │
│  │  └─ Bending     │                                   │    │
│  ├─────────────────┼───────────────────────────────────┤    │
│  │  PROPERTIES     │  TIMELINE / COMMAND LOG            │    │
│  │  (React)        │  (React)                           │    │
│  └─────────────────┴───────────────────────────────────┘    │
│                                                              │
│  React panels communicate with Rust core via Tauri IPC      │
│  3D viewport is a raw wgpu surface owned by Rust            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Web Version (WASM)

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (WASM)                             │
│                                                              │
│  React 18 (host page, panels, menus)                        │
│   + <canvas> with wgpu WebGPU surface (viewport)            │
│   + egui-web for in-viewport overlays                        │
│                                                              │
│  Shared Rust core compiled to wasm32-unknown-unknown:        │
│  • truck-* geometry kernel                                   │
│  • wasm-meshkit (STL parse, simplify, DFM)                  │
│  • Constraint solver                                         │
│  • Estimator (pricing)                                       │
│  • egui (immediate-mode viewport UI)                         │
│                                                              │
│  Heavy operations offloaded to server workers:               │
│  • STEP import (OpenCascade — not WASM-portable)            │
│  • Full FEA simulation                                       │
│  • CNC toolpath generation                                   │
│  • True-shape nesting optimization                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 UI Framework Stack

```toml
# Desktop shell
tauri        = "2.2"        # Native window, system tray, file dialogs
tauri-plugin-store = "2.0"  # Local settings persistence

# In-viewport immediate-mode UI (Rust)
egui         = "0.31"       # Panels, toolbars, property sheets inside 3D view
egui-gizmo   = "0.18"       # 3D transform gizmos (translate, rotate, scale)

# Panel / sidebar UI (Web technologies via Tauri webview)
react        = "18.3"       # Component framework
typescript   = "5.6"        # Type safety
tailwindcss  = "3.4"        # Utility CSS
framer-motion = "11.11"     # Smooth animations
lucide-react = "0.460"      # Icons
@react-three/fiber = "8.17" # 3D preview thumbnails (optional)
```

### 10.4 Keyboard Shortcuts & Command Palette

```
CAD Modeling:
  S         → Start Sketch (on face)
  E         → Extrude
  R         → Revolve
  F         → Fillet
  C         → Chamfer
  B         → Boolean (union/cut/intersect)
  H         → Shell (hollow)
  M         → Mirror
  P         → Pattern (linear/circular)
  Ctrl+Z    → Undo
  Ctrl+Y    → Redo
  Ctrl+S    → Save
  Ctrl+Shift+S → Save As

Navigation:
  MMB Drag  → Orbit
  Scroll    → Zoom
  Shift+MMB → Pan
  Numpad    → Standard views (Front/Back/Left/Right/Top/Bottom/Iso)
  F         → Fit All
  Z         → Zoom to Selection

Manufacturing:
  Ctrl+M    → New Manufacturing Setup
  Ctrl+G    → Generate G-code
  Ctrl+N    → Nest Parts
  Ctrl+Q    → Get Quote

  Ctrl+Shift+P → Command Palette (fuzzy search all commands)
```

---

## 11. File Format & Data Exchange

### 11.1 Native Format

```
.manu — ManuShop native project file
  ├─ manifest.json         — Version, metadata, dependencies
  ├─ bodies/
  │   ├─ part-001.brep     — B-Rep topology + geometry (truck binary format)
  │   ├─ part-001.mesh     — Tessellated mesh cache
  │   └─ part-001.params   — Parametric feature tree (JSON)
  ├─ assemblies/
  │   └─ main.asm          — Assembly structure + constraints
  ├─ manufacturing/
  │   ├─ setup-001.json    — Process, material, machine config
  │   ├─ toolpath-001.tp   — Computed toolpath (binary)
  │   └─ quote-001.json    — Estimation breakdown
  ├─ sketches/
  │   └─ sketch-001.svg    — 2D sketch (importable/exportable)
  ├─ thumbnails/
  │   └─ preview.png       — 256×256 preview
  └─ history/
      └─ undo-stack.bin    — Full undo history (binary diff)
```

### 11.2 Import/Export Matrix

| Format | Import | Export | Engine | Notes |
|--------|--------|--------|--------|-------|
| **STEP** (.step/.stp) | ✅ | ✅ | OpenCascade (server) + truck-stepio | AP214, AP242 |
| **IGES** (.igs/.iges) | ✅ | ✅ | OpenCascade | Legacy format |
| **STL** (.stl) | ✅ | ✅ | wasm-meshkit (client) | ASCII + binary |
| **OBJ** (.obj) | ✅ | ✅ | Native Rust parser | With materials |
| **3MF** (.3mf) | ✅ | ✅ | Native Rust (XML + ZIP) | 3D printing |
| **glTF** (.gltf/.glb) | ✅ | ✅ | OpenCascade + native | Visualization |
| **SVG** (.svg) | ✅ | ✅ | Native Rust (usvg) | 2D sketches |
| **DXF** (.dxf) | ✅ | ✅ | Native Rust (dxf crate) | 2D flat patterns |
| **G-code** (.nc/.gcode) | — | ✅ | Native Rust generator | CNC + 3D print |
| **PDF** (.pdf) | — | ✅ | Native Rust (printpdf) | 2D drawings |
| **Parasolid** (.x_t) | 🔜 | — | Planned via OCCT | Future |
| **ACIS/SAT** (.sat) | 🔜 | — | Planned via OCCT | Future |

---

## 12. Plugin / Extension Architecture

### 12.1 WASM Plugin Runtime

```
┌─────────────────────────────────────────────────────────┐
│                  PLUGIN HOST (Editor Core)                │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  wasmtime runtime (sandboxed WASM execution)       │  │
│  │                                                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │
│  │  │Plugin: A │ │Plugin: B │ │Plugin: C │           │  │
│  │  │DFM rules │ │Custom    │ │Machine   │           │  │
│  │  │for aero  │ │material  │ │post-     │           │  │
│  │  │parts     │ │library   │ │processor │           │  │
│  │  └──────────┘ └──────────┘ └──────────┘           │  │
│  │                                                     │  │
│  │  WIT Interface (Component Model):                   │  │
│  │  • read-geometry(entity) → BRepData                │  │
│  │  • add-dfm-finding(entity, finding)                │  │
│  │  • register-material(material)                     │  │
│  │  • register-post-processor(name, fn)               │  │
│  │  • subscribe-event(event_type, callback)           │  │
│  │  • ui-add-panel(name, render_fn)                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Plugins can be written in: Rust, C/C++, Go, Python,    │
│  JavaScript, or any language targeting WASM + WIT.       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 12.2 Plugin Categories

| Category | Example Plugins | Interface |
|----------|----------------|-----------|
| **DFM Rules** | Aerospace tolerances, medical device checks | `DfmPlugin` trait |
| **Materials** | Custom alloys, composites, wood species | `MaterialPlugin` trait |
| **Post-Processors** | Fanuc, Haas, Mazak, Siemens, custom machines | `PostProcessorPlugin` trait |
| **File Formats** | Proprietary CAD format importers | `FileFormatPlugin` trait |
| **Simulation** | Custom FEA solvers, thermal analysis | `SimulationPlugin` trait |
| **UI Panels** | Custom property editors, dashboards | `UiPlugin` trait |
| **Platform Adapters** | Shopify, WooCommerce, BigCommerce, Magento, Wix | `PlatformPlugin` trait |

---

## 13. Deployment Topology

### 13.1 Desktop Mode (Offline)

```
┌──────────────────────────────────────────────┐
│          TAURI DESKTOP APPLICATION             │
│  ┌──────────────────────────────────────────┐ │
│  │  Rust Core (single binary, ~50MB)        │ │
│  │  • CAD kernel (truck + OCCT static link) │ │
│  │  • Renderer (wgpu + egui)                │ │
│  │  • CAM engine + estimator                │ │
│  │  • DFM analyzer                          │ │
│  │  • SQLite for local persistence          │ │
│  │  • WASM plugin runtime (wasmtime)        │ │
│  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │  Web Frontend (Tauri webview)            │ │
│  │  • React panels + property editors       │ │
│  │  • Tree views + history                  │ │
│  └──────────────────────────────────────────┘ │
│  GPU: Direct Vulkan/Metal/DX12               │
│  Storage: Local filesystem                    │
│  No internet required                         │
└──────────────────────────────────────────────┘
```

### 13.2 Cloud Mode (SaaS — Current DFM Quote Suite Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUD DEPLOYMENT                           │
│                                                              │
│  Browser Client (WASM)                                       │
│  ├─ React 18 UI panels                                       │
│  ├─ wasm-meshkit (client-side geometry)                      │
│  ├─ truck WASM (parametric modeling)                         │
│  └─ WebGPU viewport (wgpu WASM target)                      │
│                                                              │
│  ──── HTTPS / WSS / SSE ────                                │
│                                                              │
│  API Gateway (Axum 0.7)          ── Port 8080                │
│  ├─ REST API (upload, jobs, quotes)                          │
│  ├─ SSE (real-time analysis events)                          │
│  ├─ JWT auth + multi-tenancy                                 │
│  └─ Swagger (utoipa)                                         │
│                                                              │
│  Workers (Redis Stream consumers)                            │
│  ├─ worker-cad (STEP→mesh, OCCT)                            │
│  ├─ worker-analysis (DFM + estimation, GPU optional)         │
│  └─ worker-cam (toolpath gen — NEW)                          │
│                                                              │
│  Infrastructure                                              │
│  ├─ PostgreSQL 16 (persistent state)                         │
│  ├─ Redis 7 (job queue + cache)                              │
│  ├─ MinIO/S3 (file storage)                                  │
│  ├─ Prometheus + Grafana (monitoring)                        │
│  └─ Nginx (reverse proxy, rate limiting, TLS)               │
│                                                              │
│  Kubernetes (prod)                                           │
│  ├─ api-gateway: 2 replicas, 512Mi                          │
│  ├─ worker-cad: 2 replicas, 2Gi + OCCT sidecar             │
│  ├─ worker-analysis: 1 replica, 4Gi + 1× NVIDIA GPU        │
│  └─ Ingress: cert-manager + Let's Encrypt                   │
└─────────────────────────────────────────────────────────────┘
```

### 13.3 Hybrid Mode (Desktop + Cloud)

```
Desktop app handles:
  • Parametric modeling (local, instant)
  • Viewport rendering (local GPU)
  • Basic DFM analysis (local)
  • File management (local + cloud sync)

Cloud handles:
  • STEP import (OpenCascade heavy lifting)
  • Full CNC toolpath generation
  • FEA simulation (GPU farm)
  • Collaboration (CRDT sync server)
  • Quoting (live pricing database)
  • Platform integrations (Shopify, WooCommerce, etc.)
```

---

## 14. Complete Technology Matrix

### 14.1 Core Engine (Rust)

| Layer | Crate | Version | Purpose | Multicore | GPU |
|-------|-------|---------|---------|-----------|-----|
| **Math** | `glam` | 0.29 | SIMD vec/mat/quat | SSE4.2/NEON intrinsics | — |
| **Math** | `nalgebra` | 0.33 | Dense linear algebra for FEA | Rayon parallel | — |
| **Math** | `nalgebra-sparse` | 0.10 | Sparse matrices for FEA | — | — |
| **Geometry** | `truck-base` | 0.6 | Tolerance, curve/surface traits | — | — |
| **Geometry** | `truck-geometry` | 0.6 | B-Spline, NURBS curves & surfaces | — | — |
| **Topology** | `truck-topology` | 0.6 | Vertex, Edge, Wire, Face, Shell, Solid | — | — |
| **Modeling** | `truck-modeling` | 0.6 | Extrude, revolve, sweep, loft, blend | Rayon | — |
| **Booleans** | `truck-shapeops` | 0.6 | CSG union, cut, intersect | Rayon | GPU planned |
| **Meshing** | `truck-meshalgo` | 0.6 | Tessellation from B-Rep | Rayon par_iter | GPU planned |
| **Mesh** | `truck-polymesh` | 0.6 | Polygon mesh data + algorithms | Rayon | — |
| **STEP I/O** | `truck-stepio` | 0.6 | STEP file read/write | — | — |
| **GPU lib** | `wgpu` | 28.0 | Cross-platform GPU API | — | ✅ Vulkan/Metal/DX12/WebGPU |
| **GPU render** | `truck-platform` | 0.6 | wgpu render pipeline abstraction | — | ✅ |
| **GPU visual** | `truck-rendimpl` | 0.6 | Shape + mesh rendering | — | ✅ |
| **Shading** | `naga` | 28.0 | WGSL → SPIR-V/MSL/HLSL compiler | — | — |
| **OCCT** | `opencascade-rs` | 0.2 | OCCT bindings for STEP/IGES/Booleans | — | — |
| **CAD kernel** | `fj-core` | 0.49 | Pure Rust B-Rep (experimental) | — | — |
| **Parallelism** | `rayon` | 1.10 | Data-parallel iterators | ✅ work-stealing | — |
| **Async** | `tokio` | 1.0 | Async runtime (file I/O, network) | ✅ multi-thread | — |
| **Web** | `axum` | 0.7 | HTTP framework (API gateway) | ✅ via tokio | — |
| **DB** | `sqlx` | 0.7 | Async PostgreSQL driver | ✅ connection pool | — |
| **Cache** | `redis` | 0.25 | Redis client (streams, pub/sub) | ✅ via tokio | — |
| **S3** | `aws-sdk-s3` | 1.0 | S3-compatible object storage | ✅ via tokio | — |
| **Serialization** | `serde` | 1.0 | Serialize/deserialize (JSON, bincode) | — | — |
| **Tracing** | `tracing` | 0.1 | Structured logging + spans | — | — |
| **Metrics** | `metrics` | 0.24 | Prometheus metrics export | — | — |
| **UUID** | `uuid` | 1.0 | Entity + job identifiers | — | — |
| **Time** | `chrono` | 0.4 | Timestamps | — | — |
| **Error** | `anyhow` + `thiserror` | 1.0 | Error handling | — | — |
| **API docs** | `utoipa` | 4.0 | OpenAPI/Swagger generation | — | — |
| **Hashing** | `sha2` | 0.10 | File content hashing | — | — |
| **WASM** | `wasm-bindgen` | 0.2 | Rust↔JS FFI | — | — |
| **WASM** | `js-sys` + `web-sys` | 0.3 | Browser API access | — | — |
| **Plugins** | `wasmtime` | 28.0 | WASM plugin runtime (sandboxed) | ✅ | — |
| **Bench** | `criterion` | 0.5 | Performance benchmarks | — | — |
| **Constraint** | Custom (Newton-Raphson) | — | 2D sketch constraint solver | Rayon | GPU fallback |

### 14.2 Frontend (TypeScript/React)

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 18.3 | UI framework |
| `react-dom` | 18.3 | DOM rendering |
| `typescript` | 5.6 | Type safety |
| `vite` | 6.0 | Build tool (dev server + bundler) |
| `tailwindcss` | 3.4 | Utility-first CSS |
| `framer-motion` | 11.11 | Animation |
| `lucide-react` | 0.460 | Icon library |
| `three` | 0.170 | 3D preview thumbnails |
| `@react-three/fiber` | 8.17 | React Three.js wrapper |
| `@react-three/drei` | 9.114 | Three.js helpers |
| `clsx` | 2.1 | Conditional classnames |
| `postcss` | 8.4 | CSS processing |
| `autoprefixer` | 10.4 | CSS vendor prefixes |

### 14.3 Desktop Shell

| Technology | Version | Purpose |
|------------|---------|---------|
| `tauri` | 2.2 | Native window shell (WebView2/WKWebView) |
| `tauri-plugin-store` | 2.0 | Persistent settings |
| `tauri-plugin-dialog` | 2.0 | Native file open/save dialogs |
| `tauri-plugin-fs` | 2.0 | File system access |
| `tauri-plugin-shell` | 2.0 | Spawn subprocesses (OCCT bridge) |

### 14.4 Infrastructure

| Technology | Version/Image | Purpose |
|------------|---------------|---------|
| PostgreSQL | `postgres:16-alpine` | Persistent project/job/quote storage |
| Redis | `redis:7-alpine` | Job queue (streams) + cache |
| MinIO | `minio/minio:latest` | S3-compatible file storage |
| Nginx | `nginx:alpine` | Reverse proxy, TLS, rate limiting |
| Prometheus | `prom/prometheus:latest` | Metrics collection |
| Grafana | `grafana/grafana:latest` | Dashboards |
| Docker | Multi-stage builds | Containerization |
| Kubernetes | 1.28+ | Orchestration (GPU node pools) |
| cert-manager | Latest | TLS certificate automation |

---

## 15. Crate / Package Dependency Map

```
                            ┌──────────────┐
                            │  APPLICATION │
                            │  (main.rs)   │
                            └──────┬───────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │  editor-shell    │ │  api-gateway     │ │  tauri-app       │
    │  (ECS + UI)      │ │  (REST + SSE)    │ │  (Desktop shell) │
    └────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
             │                    │                    │
    ┌────────┼────────┐           │                    │
    ▼        ▼        ▼           ▼                    │
  ┌─────┐ ┌─────┐ ┌────────┐  ┌────────────┐          │
  │egui │ │wgpu │ │renderer│  │shared-types│◄─────────┘
  │     │ │     │ │(truck- │  │(api, dfm,  │
  │     │ │     │ │rendimpl│  │ estimation,│
  │     │ │     │ │+ plat- │  │ materials, │
  │     │ │     │ │ form)  │  │ platform)  │
  └─────┘ └─────┘ └────────┘  └─────┬──────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │  cad-kernel      │  │  cam-engine      │  │  dfm-analyzer    │
    │  ─────────────   │  │  ──────────      │  │  ────────────    │
    │  truck-modeling  │  │  toolpath gen    │  │  wall thickness  │
    │  truck-shapeops  │  │  nesting         │  │  draft angles    │
    │  constraint-     │  │  G-code post     │  │  undercuts       │
    │  solver          │  │  feeds/speeds    │  │  cost estimation │
    │  history tree    │  │  sheet-estimator │  │  sheet-estimator │
    │  opencascade-rs  │  │  laser/plasma/wj │  │  laser/plasma/wj │
    └──────────────────┘  └──────────────────┘  └──────────────────┘
              │                      │                      │
              ▼                      ▼                      ▼
    ┌─────────────────────────────────────────────────────────┐
    │                    truck-* crate family                  │
    │  base │ geotrait │ geometry │ topology │ polymesh        │
    │  meshalgo │ stepio │ platform │ rendimpl │ shapeops      │
    └──────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
         ┌────────┐  ┌─────────┐     ┌──────────┐
         │  glam  │  │  wgpu   │     │  rayon   │
         │ (SIMD) │  │ (GPU)   │     │ (par)    │
         └────────┘  └─────────┘     └──────────┘
```

---

## 16. Performance Targets

### 16.1 Geometry Operations

| Operation | Target | Method |
|-----------|--------|--------|
| NURBS evaluation (1M points) | < 2ms | GPU compute shader |
| Tessellation (100K-triangle part) | < 10ms | GPU + CPU Rayon hybrid |
| Boolean union (two 50K-tri solids) | < 100ms | GPU-accelerated classification |
| Fillet (100 edges, r=2mm) | < 200ms | CPU Rayon parallel per-edge |
| Constraint solve (200 equations) | < 5ms | Newton-Raphson + sparse LU |
| BVH build (1M triangles) | < 3ms | GPU LBVH (Morton codes) |
| Ray pick (screen click) | < 0.5ms | GPU BVH traversal |
| STL import (50MB, 1M triangles) | < 500ms | WASM + SIMD |
| STEP import (complex assembly) | < 10s | OpenCascade (server worker) |

### 16.2 Rendering

| Metric | Target | Method |
|--------|--------|--------|
| Frame rate (< 1M triangles) | 60 FPS | Deferred PBR, GPU culling |
| Frame rate (1M–10M triangles) | 30 FPS | LOD + occlusion culling |
| Frame rate (> 10M triangles) | 15 FPS | Aggressive LOD + streaming |
| First paint after load | < 200ms | Progressive mesh loading |
| Viewport resize response | < 16ms | Resize swap chain only |
| Shadow map resolution | 4 × 2048² | Cascaded shadow maps |

### 16.3 Manufacturing

| Operation | Target | Method |
|-----------|--------|--------|
| DFM analysis (full part) | < 2s | Rayon par_iter over checks |
| CNC cost estimate | < 100ms | Physics models (Kienzle etc.) |
| Sheet metal cost estimate | < 50ms | Physics models (laser/plasma/wj) |
| 2D rectangular nesting (50 parts) | < 500ms | GPU parallel candidate eval |
| True-shape nesting (50 parts) | < 5s | GPU NFP + simulated annealing |
| G-code generation (roughing) | < 10s | Parallel toolpath offset |
| Bend sequence optimization | < 1s | Branch-and-bound |

### 16.4 Memory Budget

| Component | Budget | Notes |
|-----------|--------|-------|
| GPU VRAM (viewport) | 256–512 MB | Meshes + textures + framebuffers |
| GPU VRAM (compute) | 256 MB | Staging + result buffers |
| CPU RAM (kernel) | 1–2 GB | B-Rep + history tree + undo stack |
| CPU RAM (browser WASM) | 512 MB | Emscripten memory limit |
| CPU RAM (desktop) | 4–8 GB | Full feature set + large assemblies |

---

## 17. Migration Path from Current Stack

### Phase 1 — Foundation (Weeks 1–4)

```
✅ Already done:
  • Rust workspace structure
  • wgpu integration
  • Physics-based estimators (CNC + sheet metal)
  • 17+6 material catalog
  • Docker + K8s deployment
  • React GUI with Three.js viewport
  • WASM mesh processing
  • PostgreSQL + Redis + MinIO infra

🔧 Add:
  • truck-* crates to Cargo workspace
  • Tauri desktop shell (alongside existing web GUI)
  • egui viewport overlay (replace Three.js for CAD viewport)
  • glam math library (replace ad-hoc f64 vectors)
```

### Phase 2 — CAD Kernel Integration (Weeks 5–12)

```
🔧 Add:
  • Parametric feature tree (history-based modeling)
  • 2D sketch entity + constraint solver
  • Extrude, revolve, fillet, chamfer operations via truck-modeling
  • Boolean operations via truck-shapeops
  • STEP import/export via truck-stepio + opencascade-rs
  • Undo/redo command pattern
```

### Phase 3 — GPU Acceleration (Weeks 13–20)

```
🔧 Add:
  • WGSL compute shaders for tessellation
  • GPU BVH construction + ray picking
  • GPU-accelerated nesting
  • PBR deferred renderer (replace Three.js)
  • Edge detection + silhouette rendering
  • Multi-viewport support
```

### Phase 4 — CAM Engine (Weeks 21–28)

```
🔧 Add:
  • CNC toolpath generation (roughing + finishing)
  • G-code post-processors (Fanuc, Haas, Mazak)
  • Sheet metal flat pattern generation
  • Bend sequence optimizer
  • 2D nesting (rectangular + true-shape)
  • Toolpath simulation / verification
```

### Phase 5 — Polish & Platform (Weeks 29–36)

```
🔧 Add:
  • WASM plugin system (wasmtime)
  • Real-time collaboration (CRDT)
  • FEA stress analysis (basic)
  • Desktop installer (Tauri bundle)
  • Documentation + tutorials
  • CI/CD pipeline (GitHub Actions)
  • Performance optimization pass
```

---

## Appendix A — Full Current Stack Inventory

### A.1 Rust Workspace Dependencies

| Crate | Version | Features |
|-------|---------|----------|
| tokio | 1 | `full` |
| axum | 0.7 | `multipart` |
| axum-extra | 0.9 | — |
| tower | 0.4 | — |
| tower-http | 0.5 | `cors`, `trace`, `fs` |
| serde | 1 | `derive` |
| serde_json | 1 | — |
| sqlx | 0.7 | `runtime-tokio-rustls`, `postgres`, `uuid`, `chrono`, `migrate` |
| redis | 0.25 | `tokio-comp`, `streams` |
| aws-sdk-s3 | 1 | — |
| aws-config | 1 | — |
| wgpu | 0.19 | — |
| wgpu-core | 0.1 | — |
| tracing | 0.1 | — |
| tracing-subscriber | 0.3 | `fmt`, `env-filter` |
| utoipa | 4 | `axum_extras`, `chrono` |
| utoipa-swagger-ui | 6 | `axum` |
| uuid | 1 | `v4`, `serde` |
| chrono | 0.4 | `serde` |
| sha2 | 0.10 | — |
| hex | 0.4 | — |
| anyhow | 1 | — |
| thiserror | 1 | — |

### A.2 Frontend npm Dependencies

| Package | Version | Type |
|---------|---------|------|
| react | ^18.3.1 | dep |
| react-dom | ^18.3.1 | dep |
| three | ^0.170.0 | dep |
| @react-three/fiber | ^8.17.0 | dep |
| @react-three/drei | ^9.114.0 | dep |
| framer-motion | ^11.11.0 | dep |
| lucide-react | ^0.460.0 | dep |
| clsx | ^2.1.1 | dep |
| typescript | ^5.6.3 | devDep |
| vite | ^6.0.0 | devDep |
| @vitejs/plugin-react | ^4.3.4 | devDep |
| tailwindcss | ^3.4.15 | devDep |
| postcss | ^8.4.49 | devDep |
| autoprefixer | ^10.4.20 | devDep |
| @types/react | ^18.3.12 | devDep |
| @types/react-dom | ^18.3.1 | devDep |
| @types/three | ^0.170.0 | devDep |

### A.3 Docker Services

| Service | Image | Ports |
|---------|-------|-------|
| postgres | `postgres:16-alpine` | 5432 |
| redis | `redis:7-alpine` | 6379 |
| minio | `minio/minio:latest` | 9000, 9002 |
| api-gateway | `rust:latest` → `debian:trixie-slim` | 8080 |
| worker-cad | `rust:latest` → `debian:trixie-slim` | — |
| worker-analysis | `rust:latest` → `debian:trixie-slim` (+ vulkan) | — |
| gui | `node:20-alpine` → `nginx:alpine` | 3001 |
| prometheus | `prom/prometheus:latest` | 9090 |
| grafana | `grafana/grafana:latest` | 3030 |

### A.4 Database Schema

4 tables: `uploads`, `jobs`, `dfm_findings`, `quotes`
4 indexes: `idx_jobs_upload_id`, `idx_jobs_tenant_id`, `idx_findings_job_id`, `idx_quotes_job_id`

### A.5 Platform Adapters

| Platform | Technology | Status |
|----------|-----------|--------|
| Shopify | Remix + Theme App Extension | Scaffolded |
| BigCommerce | Next.js 14 + Storefront Script | Scaffolded |
| WooCommerce | PHP Plugin | Scaffolded |
| Magento 2 | PHP Module | Scaffolded |
| Wix | Custom Element + Velo Backend | Scaffolded |

---

## Appendix B — Recommended Crate Versions

```toml
# ─── Cargo.toml (workspace root) ───

[workspace]
resolver = "2"
members = [
    "packages/api-gateway",
    "packages/worker-analysis",
    "packages/worker-cad",
    "packages/worker-cam",           # NEW: Toolpath generation worker
    "packages/shared-types",
    "packages/wasm-meshkit",
    "packages/cad-kernel",           # NEW: Truck-based parametric kernel
    "packages/cam-engine",           # NEW: Toolpath + nesting + G-code
    "packages/constraint-solver",    # NEW: 2D/3D constraint solver
    "packages/renderer",             # NEW: wgpu PBR renderer
    "packages/editor-shell",         # NEW: ECS orchestrator
    "packages/plugin-runtime",       # NEW: wasmtime plugin host
    "apps/desktop",                  # NEW: Tauri desktop app
    "bench",
]

[workspace.package]
version = "0.2.0"
edition = "2021"
license = "MIT OR Apache-2.0"
repository = "https://github.com/manushop/cad-cam-editor"

[workspace.dependencies]
# ─── Async Runtime ───
tokio = { version = "1", features = ["full"] }
rayon = "1.10"

# ─── Web Framework ───
axum = { version = "0.7", features = ["multipart"] }
axum-extra = "0.9"
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace", "fs"] }

# ─── Serialization ───
serde = { version = "1", features = ["derive"] }
serde_json = "1"
bincode = "1"

# ─── Database ───
sqlx = { version = "0.7", features = ["runtime-tokio-rustls", "postgres", "uuid", "chrono", "migrate"] }
redis = { version = "0.25", features = ["tokio-comp", "streams"] }

# ─── Storage ───
aws-sdk-s3 = "1"
aws-config = "1"

# ─── GPU ───
wgpu = "28.0"
naga = "28.0"

# ─── Math ───
glam = { version = "0.29", features = ["serde"] }
nalgebra = { version = "0.33", features = ["rayon"] }
nalgebra-sparse = "0.10"

# ─── Geometry (Truck CAD Kernel) ───
truck-base = "0.6"
truck-geotrait = "0.6"
truck-geometry = "0.6"
truck-topology = "0.6"
truck-modeling = "0.6"
truck-shapeops = "0.6"
truck-meshalgo = "0.6"
truck-polymesh = "0.6"
truck-platform = "0.6"
truck-rendimpl = "0.6"
truck-stepio = "0.6"

# ─── CAD (OpenCascade backup) ───
opencascade = "0.2"

# ─── UI ───
egui = "0.31"
egui-wgpu = "0.31"
egui-winit = "0.31"
winit = "0.30"

# ─── Desktop Shell ───
tauri = "2.2"
tauri-plugin-store = "2.0"
tauri-plugin-dialog = "2.0"
tauri-plugin-fs = "2.0"
tauri-plugin-shell = "2.0"

# ─── Plugin Runtime ───
wasmtime = "28.0"

# ─── Observability ───
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["fmt", "env-filter"] }
metrics = "0.24"
metrics-exporter-prometheus = "0.16"

# ─── API Documentation ───
utoipa = { version = "4", features = ["axum_extras", "chrono"] }
utoipa-swagger-ui = { version = "6", features = ["axum"] }

# ─── Utilities ───
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
sha2 = "0.10"
hex = "0.4"
anyhow = "1"
thiserror = "1"
image = "0.25"

# ─── File Formats ───
dxf = "0.6"
printpdf = "0.7"

# ─── WASM ───
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console", "Performance", "Window"] }

# ─── Benchmarks ───
criterion = { version = "0.5", features = ["html_reports"] }

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
strip = true

[profile.dev]
opt-level = 1     # Faster dev builds with some optimization

[profile.dev.package."*"]
opt-level = 2     # Optimize dependencies even in dev mode
```

---

## Summary

This architecture transforms the existing DFM Quote Suite (a browser-based upload → analyze → quote pipeline) into a **full-featured open-source 3D CAD/CAM editor** with:

- **Pure-Rust CAD kernel** (Truck) with NURBS/B-Rep, OpenCascade as fallback
- **GPU-accelerated** geometry processing via wgpu 28 compute shaders (Vulkan/Metal/DX12/WebGPU)
- **Multicore** data parallelism via Rayon + async I/O via Tokio + ECS parallel schedules
- **Intuitive UI** — egui for viewport, React + Tailwind for panels, Tauri for desktop
- **Integrated manufacturing** — CNC toolpaths, sheet metal cutting/bending, nesting, G-code
- **Physics-based pricing** — preserving all 10+ estimation models already built
- **Plugin ecosystem** — WASM sandboxed plugins via wasmtime
- **Cross-platform** — Desktop (Windows/Mac/Linux), Web (WASM + WebGPU), Cloud (K8s)
- **17 sheet materials + 6 CNC materials** with real-world physical properties

The migration path is incremental: each phase adds capability while preserving the existing working system.

---

*Document generated: March 4, 2026*
*Project: ManuShop CAD/CAM Editor*
*License: MIT OR Apache-2.0*
