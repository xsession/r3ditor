//! # api-gateway
//!
//! Axum-based REST API gateway for the r3ditor platform.
//!
//! ## Endpoints
//! - `POST /api/v1/uploads` — Upload STL/STEP/3MF files
//! - `GET  /api/v1/uploads/:id` — Get upload status
//! - `POST /api/v1/jobs` — Create analysis/manufacturing job
//! - `GET  /api/v1/jobs/:id` — Get job status & results
//! - `GET  /api/v1/jobs/:id/events` — SSE event stream
//! - `GET  /api/v1/materials` — List available materials
//! - `POST /api/v1/quotes` — Generate manufacturing quote

pub mod auth;
pub mod errors;
pub mod routes;
pub mod state;

pub use state::AppState;

use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tower_http::compression::CompressionLayer;

/// Build the Axum router with all routes
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .merge(routes::uploads::router())
        .merge(routes::jobs::router())
        .merge(routes::materials::router())
        .merge(routes::quotes::router())
        .merge(routes::health::router())
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(cors)
        .with_state(state)
}
