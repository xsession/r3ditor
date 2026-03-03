use std::path::Path;

use anyhow::{anyhow, Result};

use crate::mesh::TriangleMesh;

/// STEP import placeholder (feature `step`).
///
/// In a production CAD app, you would:
/// 1) read STEP into a B-Rep (OCCT)
/// 2) tessellate faces (deflection settings, angular tolerance)
/// 3) generate triangle chunks and stream them to the renderer
pub fn load_step(_path: &Path) -> Result<TriangleMesh> {
    Err(anyhow!(
        "STEP import is scaffolded but not implemented in this starter.\n\
        Enable your OCCT pipeline here: cad_core/src/import/step_import.rs"
    ))
}
