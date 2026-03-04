//! # worker-cam
//!
//! CAM manufacturing worker. Generates toolpaths, nesting layouts,
//! G-code programs, and cost estimations.

use anyhow::Result;
use tracing::info;

/// Run the CAM worker
pub async fn run(database_url: &str, redis_url: &str) -> Result<()> {
    info!("Starting CAM manufacturing worker...");

    // TODO: Similar Redis stream consumer as worker-analysis
    // - Generate CNC toolpaths (roughing, finishing, drilling)
    // - Generate sheet nesting layouts
    // - Post-process to G-code
    // - Compute cost estimations

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}
