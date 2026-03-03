use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};

use crate::mesh::TriangleMesh;

mod stl_import;
#[cfg(feature = "step")]
mod step_import;

#[derive(Debug, Clone)]
pub struct ImportJob {
    pub path: PathBuf,
}

#[derive(Debug)]
pub struct ImportResult {
    pub mesh: TriangleMesh,
    pub source_path: PathBuf,
}

pub fn import(job: ImportJob) -> Result<ImportResult> {
    let path = job.path;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mesh = match ext.as_str() {
        "stl" => stl_import::load_stl(&path)?,
        "step" | "stp" => {
            #[cfg(feature = "step")]
            {
                step_import::load_step(&path)?
            }
            #[cfg(not(feature = "step"))]
            {
                return Err(anyhow!(
                    "STEP import is disabled. Rebuild with `--features step`."
                ));
            }
        }
        _ => return Err(anyhow!("Unsupported extension: {ext}")),
    };

    Ok(ImportResult {
        mesh,
        source_path: path,
    })
}
