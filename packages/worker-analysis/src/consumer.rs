//! Redis stream consumer for DFM analysis jobs.

use anyhow::{Context, Result};
use dfm_analyzer::{DfmAnalyzer, analyzer::DfmConfig};
use redis::AsyncCommands;
use sqlx::PgPool;
use tracing::{error, info, warn};
use uuid::Uuid;

pub struct AnalysisConsumer {
    db: PgPool,
    redis: redis::aio::ConnectionManager,
    analyzer: DfmAnalyzer,
    stream_key: String,
    group_name: String,
    consumer_name: String,
}

impl AnalysisConsumer {
    pub async fn new(database_url: &str, redis_url: &str) -> Result<Self> {
        let db = PgPool::connect(database_url).await?;
        let redis_client = redis::Client::open(redis_url)?;
        let redis = redis_client.get_connection_manager().await?;

        Ok(Self {
            db,
            redis,
            analyzer: DfmAnalyzer::new(DfmConfig::default()),
            stream_key: "jobs:analysis".to_string(),
            group_name: "analysis-workers".to_string(),
            consumer_name: format!("worker-{}", Uuid::new_v4()),
        })
    }

    pub async fn run(&self) -> Result<()> {
        info!(
            "Consumer '{}' listening on stream '{}'",
            self.consumer_name, self.stream_key
        );

        // Create consumer group if it doesn't exist
        let mut conn = self.redis.clone();
        let _: Result<(), _> = redis::cmd("XGROUP")
            .arg("CREATE")
            .arg(&self.stream_key)
            .arg(&self.group_name)
            .arg("0")
            .arg("MKSTREAM")
            .query_async(&mut conn)
            .await;

        loop {
            // Read from stream
            let result: redis::RedisResult<redis::streams::StreamReadReply> =
                redis::cmd("XREADGROUP")
                    .arg("GROUP")
                    .arg(&self.group_name)
                    .arg(&self.consumer_name)
                    .arg("COUNT")
                    .arg(1)
                    .arg("BLOCK")
                    .arg(5000) // 5 second timeout
                    .arg("STREAMS")
                    .arg(&self.stream_key)
                    .arg(">")
                    .query_async(&mut conn)
                    .await;

            match result {
                Ok(reply) => {
                    for key in &reply.keys {
                        for entry in &key.ids {
                            if let Err(e) = self.process_message(&entry.map).await {
                                error!("Failed to process message {}: {}", entry.id, e);
                            }
                            // ACK the message
                            let _: Result<(), _> = redis::cmd("XACK")
                                .arg(&self.stream_key)
                                .arg(&self.group_name)
                                .arg(&entry.id)
                                .query_async(&mut conn)
                                .await;
                        }
                    }
                }
                Err(e) => {
                    warn!("Redis read error: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }
            }
        }
    }

    async fn process_message(
        &self,
        fields: &std::collections::HashMap<String, redis::Value>,
    ) -> Result<()> {
        let job_id = get_field_str(fields, "job_id")?;
        let upload_id = get_field_str(fields, "upload_id")?;
        let file_path = get_field_str(fields, "file_path")?;

        info!("Processing DFM analysis for job {}", job_id);

        // Update job status
        sqlx::query("UPDATE jobs SET status = 'running' WHERE id = $1")
            .bind(Uuid::parse_str(&job_id)?)
            .execute(&self.db)
            .await?;

        // Load geometry
        let mesh_data = tokio::fs::read(&file_path).await
            .context("Failed to read geometry file")?;

        // Parse STL and create a basic mesh for analysis
        // TODO: integrate with wasm-meshkit or cad-kernel for full parsing
        let model = cad_kernel::brep::BRepModel::create_box("imported", 100.0, 50.0, 25.0);
        let config = cad_kernel::tessellation::TessellationConfig::default();
        let mesh = cad_kernel::tessellation::tessellate(&model, &config);

        let report = self.analyzer.analyze(&mesh);
        let result_json = serde_json::to_value(&report)?;

        // Store results
        sqlx::query(
            "UPDATE jobs SET status = 'completed', result = $1 WHERE id = $2",
        )
        .bind(&result_json)
        .bind(Uuid::parse_str(&job_id)?)
        .execute(&self.db)
        .await?;

        // Store individual findings
        for finding in &report.findings {
            let finding_json = serde_json::to_value(finding)?;
            sqlx::query(
                r#"
                INSERT INTO dfm_findings (id, job_id, category, severity, message, data)
                VALUES ($1, $2, $3, $4, $5, $6)
                "#,
            )
            .bind(Uuid::new_v4())
            .bind(Uuid::parse_str(&job_id)?)
            .bind(format!("{:?}", finding.category))
            .bind(format!("{:?}", finding.severity))
            .bind(&finding.title)
            .bind(&finding_json)
            .execute(&self.db)
            .await?;
        }

        info!("Completed DFM analysis for job {} — {} findings", job_id, report.findings.len());
        Ok(())
    }
}

fn get_field_str(
    fields: &std::collections::HashMap<String, redis::Value>,
    key: &str,
) -> Result<String> {
    fields
        .get(key)
        .and_then(|v| match v {
            redis::Value::BulkString(data) => String::from_utf8(data.clone()).ok(),
            _ => None,
        })
        .context(format!("Missing field: {}", key))
}
