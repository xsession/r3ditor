//! # worker-analysis
//!
//! DFM analysis worker. Consumes jobs from a Redis stream,
//! runs DFM checks on uploaded geometry, and stores results.

use anyhow::Result;
use tracing::info;

pub mod consumer;

/// Run the analysis worker
pub async fn run(database_url: &str, redis_url: &str) -> Result<()> {
    info!("Starting DFM analysis worker...");
    let consumer = consumer::AnalysisConsumer::new(database_url, redis_url).await?;
    consumer.run().await
}
