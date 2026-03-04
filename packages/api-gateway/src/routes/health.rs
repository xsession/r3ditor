//! Health check endpoint.

use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/version", get(version))
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "r3ditor-api"
    }))
}

async fn version() -> Json<Value> {
    Json(json!({
        "name": "r3ditor",
        "version": env!("CARGO_PKG_VERSION"),
        "api_version": "v1"
    }))
}
