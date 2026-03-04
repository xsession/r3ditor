//! # wasm-meshkit
//!
//! Browser-side mesh toolkit compiled to WASM via wasm-bindgen.
//!
//! ## Features
//! - STL binary/ASCII parsing
//! - Mesh simplification (quadric error decimation)
//! - LOD generation (3 levels)
//! - Bounding box / volume computation
//! - Vertex welding & normal recomputation

use wasm_bindgen::prelude::*;

mod mesh;
mod parser;
mod simplify;

pub use mesh::WasmMesh;

/// Initialize panic hook for better error messages in browser console
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Parse an STL file from bytes and return a WasmMesh
#[wasm_bindgen]
pub fn parse_stl(data: &[u8]) -> Result<WasmMesh, JsError> {
    let mesh = parser::parse_stl_bytes(data).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(mesh)
}

/// Simplify a mesh to target vertex count
#[wasm_bindgen]
pub fn simplify_mesh(mesh: &WasmMesh, target_ratio: f32) -> WasmMesh {
    simplify::simplify(mesh, target_ratio)
}

/// Generate LOD levels (returns array of 3 meshes: high, medium, low)
#[wasm_bindgen]
pub fn generate_lods(mesh: &WasmMesh) -> Vec<WasmMesh> {
    vec![
        mesh.clone(),                    // LOD 0: full
        simplify::simplify(mesh, 0.5),   // LOD 1: 50%
        simplify::simplify(mesh, 0.15),  // LOD 2: 15%
    ]
}
