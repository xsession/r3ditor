//! Upload endpoints — file upload, status, download mesh.

use axum::{
    extract::{Multipart, Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::errors::ApiError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/uploads", post(create_upload))
        .route("/api/v1/uploads/:id", get(get_upload))
}

#[derive(Debug, Serialize)]
struct UploadResponse {
    id: Uuid,
    filename: String,
    size_bytes: u64,
    status: String,
}

async fn create_upload(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, ApiError> {
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        ApiError::BadRequest(format!("Multipart error: {}", e))
    })? {
        let filename = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let data = field
            .bytes()
            .await
            .map_err(|e| ApiError::BadRequest(format!("Failed to read file: {}", e)))?;

        let upload_id = Uuid::new_v4();
        let size = data.len() as u64;

        // Save to disk
        let dest = format!("{}/{}/{}", state.upload_dir, auth.org_id, upload_id);
        tokio::fs::create_dir_all(&dest).await.map_err(|e| {
            ApiError::Internal(format!("Failed to create upload dir: {}", e))
        })?;

        let file_path = format!("{}/{}", dest, filename);
        tokio::fs::write(&file_path, &data).await.map_err(|e| {
            ApiError::Internal(format!("Failed to write file: {}", e))
        })?;

        // Record in database
        sqlx::query!(
            r#"
            INSERT INTO uploads (id, org_id, user_id, filename, size_bytes, file_path, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
            "#,
            upload_id,
            auth.org_id,
            auth.user_id,
            filename,
            size as i64,
            file_path,
        )
        .execute(&state.db)
        .await?;

        // TODO: Publish to Redis stream for worker processing

        return Ok(Json(UploadResponse {
            id: upload_id,
            filename,
            size_bytes: size,
            status: "pending".to_string(),
        }));
    }

    Err(ApiError::BadRequest("No file provided".to_string()))
}

async fn get_upload(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<UploadResponse>, ApiError> {
    let upload = sqlx::query_as!(
        UploadRow,
        r#"
        SELECT id, filename, size_bytes, status
        FROM uploads
        WHERE id = $1 AND org_id = $2
        "#,
        id,
        auth.org_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound(format!("Upload {} not found", id)))?;

    Ok(Json(UploadResponse {
        id: upload.id,
        filename: upload.filename,
        size_bytes: upload.size_bytes as u64,
        status: upload.status,
    }))
}

struct UploadRow {
    id: Uuid,
    filename: String,
    size_bytes: i64,
    status: String,
}
