//! Quote generation endpoint.

use axum::{
    extract::State,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::errors::ApiError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/v1/quotes", post(generate_quote))
}

#[derive(Debug, Deserialize)]
struct QuoteRequest {
    upload_id: Uuid,
    material_id: String,
    quantity: u32,
    process: String,  // "cnc_milling", "sheet_cutting", "sheet_bending"
    options: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct QuoteResponse {
    id: Uuid,
    upload_id: Uuid,
    material: String,
    quantity: u32,
    unit_cost: f64,
    total_cost: f64,
    lead_time_days: u32,
    breakdown: QuoteCostBreakdown,
}

#[derive(Debug, Serialize)]
struct QuoteCostBreakdown {
    material_cost: f64,
    machine_time_cost: f64,
    setup_cost: f64,
    finishing_cost: f64,
    overhead: f64,
}

async fn generate_quote(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<QuoteRequest>,
) -> Result<Json<QuoteResponse>, ApiError> {
    // TODO: Fetch geometry from upload, run CAM estimation
    // For now return a placeholder
    let quote_id = Uuid::new_v4();

    let breakdown = QuoteCostBreakdown {
        material_cost: 5.0 * req.quantity as f64,
        machine_time_cost: 15.0 * req.quantity as f64,
        setup_cost: 25.0,
        finishing_cost: 3.0 * req.quantity as f64,
        overhead: 8.0 * req.quantity as f64,
    };

    let unit_cost = (breakdown.material_cost
        + breakdown.machine_time_cost
        + breakdown.setup_cost
        + breakdown.finishing_cost
        + breakdown.overhead)
        / req.quantity as f64;

    let total_cost = unit_cost * req.quantity as f64;

    // Store quote in DB
    sqlx::query(
        r#"
        INSERT INTO quotes (id, org_id, user_id, upload_id, material_id, quantity, unit_cost, total_cost, lead_time_days)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(quote_id)
    .bind(auth.org_id)
    .bind(auth.user_id)
    .bind(req.upload_id)
    .bind(&req.material_id)
    .bind(req.quantity as i32)
    .bind(unit_cost)
    .bind(total_cost)
    .bind(5i32)
    .execute(&state.db)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(QuoteResponse {
        id: quote_id,
        upload_id: req.upload_id,
        material: req.material_id,
        quantity: req.quantity,
        unit_cost,
        total_cost,
        lead_time_days: 5,
        breakdown,
    }))
}
