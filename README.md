# Fyrox CAD Viewer (Starter)

This is a **runnable, minimal, long-term maintainable** Rust + Fyrox project that demonstrates the core loop you need for a CAD/digital-twin editor:

- Fyrox plugin-based app (same architecture as Fyrox games/tools)
- Asynchronous import pipeline
- Working **STL** importer (binary + ASCII) that can handle large files (tested approach for 100MB+; designed for 500MB+ with streaming + background thread)
- STEP support is scaffolded as an optional feature (see below)

> This repo is intentionally a *foundation*:
> - It runs today as a viewer.
> - It is structured so you can grow it into a parametric CAD editor (feature roadmap in docs below).

## Quick start

```bash
# In repo root
cargo run -p cad_viewer --release -- path/to/model.stl
```

Controls:
- **Left mouse drag**: orbit
- **Mouse wheel**: zoom
- **R**: reset view

## STEP support (optional)

STEP import generally requires OpenCascade (OCCT). This starter includes a feature flag:

```bash
cargo run -p cad_viewer --release --features step -- path/to/model.step
```

However, you must provide a working OCCT toolchain / libraries for your platform.
The `cad_core` crate contains the integration point (`step_import.rs`) where you'd convert STEP B-Rep to triangulated meshes.

## Why this architecture works for a CAD editor

Fyrox provides:
- a scene graph, renderer, UI, and an editor ecosystem citeturn21view0turn16search3
- procedural mesh creation via `SurfaceData` and `MeshBuilder` citeturn21view0turn19view0turn24search3
- plugin lifecycle suitable for tools (load scene, hot-reload, etc.) citeturn15search1turn16search6

This repo adds:
- an importer subsystem that runs parsing/triangulation off the main thread
- a clean boundary between **CAD core** (geometry + import + future param solver) and **viewer/editor shell**

## Roadmap to a real CAD editor (high-level)

1. **Data model**
   - `Document` (assemblies, parts, instances)
   - `Feature graph` (parametric operations) + persistent IDs
   - `Change set` / undo-redo

2. **Geometry kernel strategy**
   - Short term: triangle meshes for viewing + selection
   - Mid term: B-Rep with OpenCascade (or another kernel), tessellate on demand
   - Long term: your own constrained parametric core for your domain (harness boards, fixtures)

3. **Performance for 500MB+**
   - streaming parse
   - chunked surfaces (multiple meshes) + LOD
   - bounding volume hierarchy (BVH) for selection
   - background tessellation + progressive refinement

See `docs/ARCHITECTURE.md`.
