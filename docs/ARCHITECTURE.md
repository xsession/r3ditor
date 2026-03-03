# Architecture Notes (CAD/Digital Twin)

This project is deliberately split:

- `cad_core`: domain + import + (future) parametric modeling kernel boundaries
- `cad_viewer`: Fyrox-based front-end (renderer, input, scene, UI)

## Modules

### cad_core

- `import/mod.rs`
  - `ImportJob` (path + format hints)
  - `ImportResult` (triangle mesh + metadata)
  - `Importer` trait (STL, STEP, ...)

- `mesh.rs`
  - `TriangleMesh` (positions, normals, indices, AABB)
  - future: `MeshChunks` for huge models, progressive loading

### cad_viewer

- `app.rs`
  - Fyrox plugin
  - orbit camera controller
  - async import + scene update

## Parametric modeling in Rust (pragmatic)

For a long-lived CAD tool, separate concerns:

1. **Kernel** (B-Rep, booleans, fillets)
2. **Parametric feature system** (sketch -> extrude -> fillet)
3. **Tessellation/meshing** (view model, selection)
4. **UI + UX** (workbenches, tool modes)
5. **Persistence** (versioned schema, stable IDs)

A maintainable approach is:
- Keep the parametric feature graph in `cad_core` with a stable serialization format
- Treat the Fyrox scene as a *cache* of renderable results

## Handling 500MB+ STL/STEP

**STL:**
- STL is a triangle soup, often with massive duplication.
- Use a deduplicating builder (we use `RawMeshBuilder`) to reduce memory footprint.
- Keep parsing off the main thread.

**STEP:**
- STEP is a boundary-rep; tessellation can be expensive.
- Use background tessellation and stream triangle chunks into the scene.
- For assemblies, keep instances (transform + part reference) rather than flattening.
