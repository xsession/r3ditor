//! Job endpoints — create, status, SSE events.

use axum::{
    extract::{Path, State},
    response::sse::{Event, Sse},
    routing::{get, post},
    Json, Router,
};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::errors::ApiError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/jobs", post(create_job))
        .route("/api/v1/jobs/:id", get(get_job))
        .route("/api/v1/jobs/:id/events", get(job_events))
}

#[derive(Debug, Deserialize)]
struct CreateJobRequest {
    upload_id: Uuid,
    job_type: String, // "dfm_analysis", "cam_toolpath", "quote"
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct JobResponse {
    id: Uuid,
    upload_id: Uuid,
    job_type: String,
    status: String,
    result: Option<serde_json::Value>,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn create_job(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateJobRequest>,
) -> Result<Json<JobResponse>, ApiError> {
    let job_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    sqlx::query(
        r#"
        INSERT INTO jobs (id, org_id, user_id, upload_id, job_type, parameters, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)
        "#,
    )
    .bind(job_id)
    .bind(auth.org_id)
    .bind(auth.user_id)
    .bind(req.upload_id)
    .bind(&req.job_type)
    .bind(&req.parameters)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    // TODO: Publish to Redis stream for worker processing

    Ok(Json(JobResponse {
        id: job_id,
        upload_id: req.upload_id,
        job_type: req.job_type,
        status: "queued".to_string(),
        result: None,
        created_at: now,
    }))
}

async fn get_job(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<JobResponse>, ApiError> {
    let row = sqlx::query(
        r#"
        SELECT id, upload_id, job_type, status, result, created_at
        FROM jobs
        WHERE id = $1 AND org_id = $2
        "#,
    )
    .bind(id)
    .bind(auth.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?
    .ok_or_else(|| ApiError::NotFound(format!("Job {} not found", id)))?;

    use sqlx::Row;
    Ok(Json(JobResponse {
        id: row.get("id"),
        upload_id: row.get("upload_id"),
        job_type: row.get("job_type"),
        status: row.get("status"),
        result: row.get("result"),
        created_at: row.get("created_at"),
    }))
}

/// SSE event stream for job progress
async fn job_events(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // Subscribe to Redis pub/sub for job events
    let stream = async_stream::stream! {
        // TODO: Subscribe to Redis pub/sub channel for job events
        // For now, just send a connected event
        yield Ok(Event::default().event("connected").data(format!("{{\"job_id\":\"{}\"}}", id)));

        // Poll for status changes
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

            let status: Result<Option<String>, _> = sqlx::query_scalar(
                "SELECT status FROM jobs WHERE id = $1 AND org_id = $2",
            )
            .bind(id)
            .bind(auth.org_id)
            .fetch_optional(&state.db)
            .await;

            match status {
                Ok(Some(s)) => {
                    yield Ok(Event::default().event("status").data(
                        serde_json::json!({"job_id": id.to_string(), "status": s}).to_string()
                    ));

                    if s == "completed" || s == "failed" {
                        break;
                    }
                }
                _ => break,
            }
        }
    };

    Sse::new(stream)
}

struct JobRow {
    id: Uuid,
    upload_id: Uuid,
    job_type: String,
    status: String,
    result: Option<serde_json::Value>,
    created_at: chrono::DateTime<chrono::Utc>,
}
