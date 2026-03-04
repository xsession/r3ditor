//! # worker-cad
//!
//! CAD geometry worker. Handles file import, tessellation,
//! format detection, and B-Rep construction from uploaded files.

use anyhow::Result;
use tracing::info;

/// Run the CAD worker
pub async fn run(database_url: &str, redis_url: &str) -> Result<()> {
    info!("Starting CAD geometry worker...");

    // TODO: Similar Redis stream consumer as worker-analysis
    // - Parse STL/STEP/3MF/OBJ files
    // - Generate tessellated mesh
    // - Compute bounding box, volume, surface area
    // - Store processed geometry metadata

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}
