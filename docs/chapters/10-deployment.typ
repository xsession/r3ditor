#import "../template.typ": *

= Deployment & Distribution

== Deployment Modes

R3ditor supports three deployment topologies, each optimized for different use cases:

#align(center)[
  #image("../assets/deployment-topology.svg", width: 100%)
]

#table(
  columns: (auto, auto, 1fr),
  table.header([*Mode*], [*Target*], [*Description*]),
  [Desktop], [Engineers & Designers], [Full standalone application via Tauri 2.2. All computation runs locally. No internet required after activation. Best for proprietary designs.],
  [Cloud], [E-commerce & SaaS], [Headless API server (Docker / Kubernetes). Web frontend connects via REST + SSE. Scales horizontally with Redis job queue.],
  [Hybrid], [Enterprise Teams], [Desktop app for CAD modeling; cloud for heavy analysis, nesting, and collaboration. Sync via API.],
)

== Desktop Distribution

=== Tauri 2.2 Packaging

#table(
  columns: (auto, auto, auto),
  table.header([*Platform*], [*Installer*], [*Size (est.)*]),
  [Windows 10/11], [`.msi` + `.exe` (NSIS)], [~45 MB],
  [macOS 12+], [`.dmg` + `.app` bundle], [~40 MB],
  [Linux (Ubuntu 22+)], [`.deb` + `.AppImage`], [~42 MB],
)

=== Auto-Update

Tauri's built-in updater with signed update manifests:

```json
{
  "endpoints": ["https://releases.r3ditor.io/{{target}}/{{current_version}}"],
  "dialog": true,
  "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ..."
}
```

- *Differential updates* — only changed binary segments are downloaded
- *Rollback* — previous version preserved; automatic rollback on crash-on-start
- *Channel selection* — Stable / Beta / Nightly channels

== Cloud Deployment

=== Docker Compose (Development / Small Teams)

Nine services compose the full cloud stack:

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Service*], [*Image*], [*Port*], [*Role*]),
  [`api-gateway`], [`r3ditor/api:latest`], [3001], [Axum REST API + SSE endpoint],
  [`worker-cad`], [`r3ditor/worker-cad:latest`], [—], [Geometry operations (B-Rep, boolean, tessellation)],
  [`worker-analysis`], [`r3ditor/worker-analysis:latest`], [—], [DFM checks, cost estimation, quoting],
  [`worker-cam`], [`r3ditor/worker-cam:latest`], [—], [Toolpath generation, nesting, G-code post],
  [`postgres`], [`postgres:16-alpine`], [5432], [Primary database (users, projects, materials)],
  [`redis`], [`redis:7-alpine`], [6379], [Job queue (Redis Streams) + session cache],
  [`minio`], [`minio/minio:latest`], [9000], [S3-compatible object storage for files],
  [`jaeger`], [`jaegertracing/all-in-one`], [16686], [Distributed tracing (OpenTelemetry)],
  [`prometheus`], [`prom/prometheus`], [9090], [Metrics collection and alerting],
)

=== Docker Compose File

```yaml
version: "3.9"
services:
  api-gateway:
    image: r3ditor/api:latest
    ports: ["3001:3001"]
    environment:
      DATABASE_URL: postgres://r3ditor:r3ditor@postgres/r3ditor
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
    depends_on: [postgres, redis, minio]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/health"]
      interval: 10s

  worker-cad:
    image: r3ditor/worker-cad:latest
    environment:
      REDIS_URL: redis://redis:6379
      QUEUE: cad
    deploy:
      replicas: 2

  worker-analysis:
    image: r3ditor/worker-analysis:latest
    environment:
      REDIS_URL: redis://redis:6379
      QUEUE: analysis

  worker-cam:
    image: r3ditor/worker-cam:latest
    environment:
      REDIS_URL: redis://redis:6379
      QUEUE: cam

  postgres:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: r3ditor
      POSTGRES_USER: r3ditor
      POSTGRES_PASSWORD: r3ditor

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    volumes: ["miniodata:/data"]

volumes:
  pgdata:
  redisdata:
  miniodata:
```

=== Kubernetes (Production)

For production deployments, r3ditor provides Helm charts:

```
helm repo add r3ditor https://charts.r3ditor.io
helm install r3ditor r3ditor/r3ditor-stack \
  --set api.replicas=3 \
  --set worker.cad.replicas=4 \
  --set worker.analysis.replicas=2 \
  --set worker.cam.replicas=2 \
  --set postgres.storageClass=gp3 \
  --set ingress.host=api.r3ditor.example.com
```

=== Horizontal Scaling Strategy

#table(
  columns: (auto, auto, 1fr),
  table.header([*Component*], [*Scaling Axis*], [*Strategy*]),
  [API Gateway], [Horizontal], [Stateless; add replicas behind load balancer. Target: <100ms p99.],
  [Worker CAD], [Horizontal], [CPU-bound; scale by pending queue depth. Each replica handles 1 job.],
  [Worker Analysis], [Horizontal], [Memory-bound (DFM models); scale by memory pressure.],
  [Worker CAM], [Horizontal], [CPU-bound (nesting is O(n²)); scale by job backlog.],
  [PostgreSQL], [Vertical + Read Replicas], [Primary for writes; read replicas for queries. PgBouncer for connection pooling.],
  [Redis], [Vertical], [Single node with AOF persistence. Redis Cluster for >100K jobs/min.],
  [MinIO], [Horizontal], [Erasure coding across nodes for durability. CDN for file delivery.],
)

== Platform Adapters

R3ditor includes e-commerce platform adapters for embedded quoting:

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Platform*], [*Integration*], [*Status*], [*Method*]),
  [Shopify], [Storefront API + App Bridge], [Production], [Embedded iframe + webhook for order sync],
  [WooCommerce], [REST API v3 + Webhook], [Production], [WordPress plugin + React widget embed],
  [BigCommerce], [Storefront API + Webhooks], [Beta], [Custom widget via Script API injection],
  [Magento 2], [REST API + GraphQL], [Planned], [Module with admin panel integration],
  [Wix], [Velo API + Blocks], [Planned], [Wix Blocks app with custom element],
)

#info-box(title: "Monitoring & Observability")[
  All services emit *OpenTelemetry traces* and *Prometheus metrics*. The default stack includes:
  - *Jaeger* — distributed trace visualization
  - *Prometheus* — metrics collection (request latency, queue depth, error rate)
  - *Grafana* — dashboards (add `grafana/grafana` service for production)
  - *Structured logging* — JSON logs via `tracing` crate with `tracing-opentelemetry` export
]
