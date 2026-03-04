//! Application state shared across handlers.

use sqlx::PgPool;
use std::sync::Arc;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub jwt_secret: String,
    pub upload_dir: String,
}

impl AppState {
    pub async fn new(
        database_url: &str,
        redis_url: &str,
        jwt_secret: String,
        upload_dir: String,
    ) -> anyhow::Result<Self> {
        let db = PgPool::connect(database_url).await?;
        let redis_client = redis::Client::open(redis_url)?;
        let redis = redis_client.get_connection_manager().await?;

        Ok(Self {
            db,
            redis,
            jwt_secret,
            upload_dir,
        })
    }
}
