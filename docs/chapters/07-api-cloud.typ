#import "../template.typ": *

= API Gateway & Cloud Services

== API Gateway

The `api-gateway` crate provides a *RESTful API* built on Axum 0.7 with JWT authentication, file upload handling, and Server-Sent Events for real-time job status updates.

=== Route Map

#table(
  columns: (auto, auto, 1fr, auto),
  table.header([*Method*], [*Path*], [*Description*], [*Auth*]),
  [`GET`], [`/api/health`], [Health check — returns service status, version, uptime], [None],
  [`POST`], [`/api/uploads`], [Upload CAD file (multipart) → store in MinIO → return upload ID], [JWT],
  [`GET`], [`/api/uploads/:id`], [Retrieve upload metadata and download URL], [JWT],
  [`POST`], [`/api/jobs`], [Create analysis job → push to Redis stream → return job ID], [JWT],
  [`GET`], [`/api/jobs/:id`], [Get job status and results], [JWT],
  [`GET`], [`/api/jobs/:id/stream`], [SSE stream for real-time job progress updates], [JWT],
  [`GET`], [`/api/materials`], [List all materials (sheet + CNC) with properties], [Optional],
  [`GET`], [`/api/materials/:id`], [Get detailed material properties], [Optional],
  [`POST`], [`/api/quotes`], [Generate manufacturing quote from job results], [JWT],
  [`GET`], [`/api/quotes/:id`], [Retrieve generated quote], [JWT],
)

=== Authentication

JWT-based authentication with configurable secret:

- *Token format*: Bearer token in Authorization header
- *Claims*: `sub` (tenant ID), `exp` (expiration), `iat` (issued at)
- *Middleware*: Tower layer applied to protected routes
- *Tenant isolation*: All queries scoped by `tenant_id` from JWT claims

=== Application State

```rust
pub struct AppState {
    pub db: PgPool,           // PostgreSQL connection pool
    pub redis: redis::Client, // Redis for job queues
    pub s3: aws_sdk_s3::Client, // MinIO S3-compatible storage
    pub jwt_secret: String,    // JWT signing key
}
```

== Worker Services

Three stateless worker services consume jobs from Redis streams:

=== Worker Architecture

#table(
  columns: (auto, 1fr, auto, auto),
  table.header([*Worker*], [*Function*], [*Input*], [*Output*]),
  [`worker-cad`], [Import CAD files (STEP/STL/DXF) → parse → extract geometry → store mesh], [File bytes], [Mesh + metadata],
  [`worker-analysis`], [Run DFM analysis → score geometry → find manufacturing issues], [Mesh + material], [DFM findings + score],
  [`worker-cam`], [Generate toolpaths → optimize nesting → produce G-code], [Mesh + material + config], [Toolpath + G-code],
)

All workers follow the same pattern:

+ *Read* from Redis stream (`XREADGROUP`)
+ *Download* file from MinIO
+ *Process* using core crates (cad-kernel / dfm-analyzer / cam-engine)
+ *Store* results in PostgreSQL
+ *Acknowledge* message (`XACK`)
+ *Publish* status update (triggers SSE to client)

=== Redis Stream Protocol

```
Stream: jobs:pending
Consumer Group: workers
Message Format:
{
  "job_id": "uuid",
  "upload_id": "uuid",
  "tenant_id": "uuid",
  "job_type": "analysis|cad_import|cam_generate",
  "parameters": { ... }
}
```

== Database Schema

PostgreSQL 16 with 4 core tables:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Table*], [*Description*], [*Key Indexes*]),
  [`uploads`], [File metadata: name, hash, size, S3 key, tenant_id, timestamps], [PK: `id`],
  [`jobs`], [Job status: upload_id, tenant_id, type, status, result_json, timestamps], [`idx_jobs_upload_id`, `idx_jobs_tenant_id`],
  [`dfm_findings`], [DFM analysis results: job_id, rule_id, severity, description, location], [`idx_findings_job_id`],
  [`quotes`], [Generated quotes: job_id, tenant_id, line items, total, currency], [`idx_quotes_job_id`],
)

== Object Storage

MinIO (S3-compatible) stores binary assets:

#table(
  columns: (auto, 1fr),
  table.header([*Bucket*], [*Contents*]),
  [`cad-uploads`], [Original uploaded CAD files (STEP, STL, DXF, 3MF)],
  [`meshes`], [Processed triangle meshes (binary format)],
  [`gcode`], [Generated G-code files],
  [`thumbnails`], [Rendered preview images],
)

== API Documentation

The API is documented via *OpenAPI 3.0* using `utoipa`:

- Interactive Swagger UI at `/swagger-ui`
- OpenAPI JSON spec at `/api-doc/openapi.json`
- All types annotated with `#[derive(ToSchema)]`
- Request/response examples for every endpoint

== Error Handling

Consistent error responses across all endpoints:

```json
{
  "error": {
    "code": "UPLOAD_TOO_LARGE",
    "message": "File size exceeds 100 MB limit",
    "details": { "max_bytes": 104857600, "actual_bytes": 157286400 }
  }
}
```

Error types:
- `400` — Validation errors (bad request body, invalid parameters)
- `401` — Authentication required (missing/expired JWT)
- `403` — Authorization denied (wrong tenant)
- `404` — Resource not found
- `413` — Payload too large
- `500` — Internal server error
