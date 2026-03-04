//! API types for REST endpoints, jobs, and quotes.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique identifier for an upload
pub type UploadId = Uuid;
/// Unique identifier for a job
pub type JobId = Uuid;
/// Unique identifier for a quote
pub type QuoteId = Uuid;
/// Unique identifier for a tenant
pub type TenantId = Uuid;

/// Job status in the processing pipeline
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

/// An upload record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Upload {
    pub id: UploadId,
    pub tenant_id: TenantId,
    pub filename: String,
    pub content_type: String,
    pub file_hash: String,
    pub s3_key: String,
    pub file_size: i64,
    pub created_at: DateTime<Utc>,
}

/// A processing job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: JobId,
    pub upload_id: UploadId,
    pub tenant_id: TenantId,
    pub status: JobStatus,
    pub job_type: JobType,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Types of processing jobs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobType {
    MeshConversion,
    DfmAnalysis,
    CostEstimation,
    ToolpathGeneration,
    StepImport,
    Nesting,
}

/// A manufacturing quote
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quote {
    pub id: QuoteId,
    pub job_id: JobId,
    pub tenant_id: TenantId,
    pub process: String,
    pub material: String,
    pub quantity: i32,
    pub unit_price_cents: i64,
    pub total_price_cents: i64,
    pub lead_time_days: i32,
    pub breakdown: QuoteBreakdown,
    pub created_at: DateTime<Utc>,
}

/// Detailed cost breakdown for a quote
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteBreakdown {
    pub material_cost_cents: i64,
    pub cutting_cost_cents: i64,
    pub bending_cost_cents: i64,
    pub machining_cost_cents: i64,
    pub finishing_cost_cents: i64,
    pub setup_cost_cents: i64,
    pub overhead_cents: i64,
}

/// API error response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}
