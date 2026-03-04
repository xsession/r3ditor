#import "../template.typ": *

= Appendices

== Appendix A: Workspace Crate Reference

#align(center)[
  #image("../assets/crate-dependency-graph.svg", width: 100%)
]

The complete Cargo workspace comprises 15 crates organized in four layers:

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Crate*], [*Path*], [*Type*], [*Description*]),
  [`r3ditor-core`], [`crates/core`], [lib], [ECS world, entity management, shared types, error handling],
  [`r3ditor-geometry`], [`crates/geometry`], [lib], [Truck B-Rep kernel, parametric features, constraint solver, tessellation],
  [`r3ditor-mesh`], [`crates/mesh`], [lib], [Mesh operations, STL/OBJ import, wasm-meshkit integration],
  [`r3ditor-manufacturing`], [`crates/manufacturing`], [lib], [DFM analysis, cost estimation, material catalog, quoting],
  [`r3ditor-cam`], [`crates/cam`], [lib], [Toolpath generation, nesting, G-code post-processors, sheet metal],
  [`r3ditor-renderer`], [`crates/renderer`], [lib], [wgpu 28 renderer, 11-pass pipeline, 5 WGSL shaders, view modes],
  [`r3ditor-ui`], [`crates/ui`], [lib], [egui panels, 3D viewport overlay, gizmos, selection],
  [`r3ditor-plugin-host`], [`crates/plugin-host`], [lib], [wasmtime 28 WASM runtime, plugin loading, capability enforcement],
  [`r3ditor-plugin-sdk`], [`crates/plugin-sdk`], [lib], [Plugin development SDK, proc-macros, trait definitions],
  [`r3ditor-api`], [`crates/api`], [lib], [Axum 0.7 REST API, JWT auth, SSE endpoints],
  [`r3ditor-worker`], [`crates/worker`], [lib], [Redis Stream workers (CAD, Analysis, CAM)],
  [`r3ditor-storage`], [`crates/storage`], [lib], [PostgreSQL (SQLx), Redis, MinIO S3 clients],
  [`r3ditor-server`], [`apps/server`], [bin], [Cloud server binary; composes API + workers],
  [`r3ditor-desktop`], [`apps/desktop/src-tauri`], [bin], [Tauri 2.2 desktop shell; composes renderer + UI],
  [`r3ditor-bench`], [`packages/bench`], [bench], [Criterion.rs benchmark suite],
)

== Appendix B: Technology Matrix

#align(center)[
  #image("../assets/technology-matrix.svg", width: 100%)
]

#table(
  columns: (auto, auto, auto),
  table.header([*Technology*], [*Version*], [*Purpose*]),
  [Rust], [1.82+], [Primary systems language],
  [TypeScript], [5.6+], [Frontend application language],
  [React], [19+], [UI component framework],
  [Tailwind CSS], [4.0], [Utility-first CSS framework],
  [Vite], [6.0], [Frontend build tool],
  [Tauri], [2.2], [Desktop shell (Rust + WebView)],
  [wgpu], [28.0], [GPU abstraction layer (WebGPU/Vulkan/Metal/DX12)],
  [WGSL], [1.0], [GPU shader language],
  [hecs], [0.10], [Entity Component System],
  [truck], [0.17], [B-Rep geometry kernel],
  [Axum], [0.7], [Async HTTP framework],
  [SQLx], [0.8], [Async PostgreSQL driver],
  [Tokio], [1.42], [Async runtime],
  [Rayon], [1.10], [Data parallelism (work-stealing)],
  [wasmtime], [28.0], [WASM plugin runtime],
  [egui], [0.30], [Immediate-mode GUI (viewport overlay)],
  [serde], [1.0], [Serialization framework],
  [PostgreSQL], [16], [Primary database],
  [Redis], [7], [Job queue + session cache],
  [MinIO], [latest], [S3-compatible object storage],
  [Docker], [27+], [Containerization],
  [Kubernetes], [1.30+], [Container orchestration],
)

== Appendix C: Database Schema

Five primary tables store application data:

```sql
-- Users & Authentication
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role        VARCHAR(50) DEFAULT 'user',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Projects (CAD models)
CREATE TABLE projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    file_key    VARCHAR(512),  -- MinIO object key
    file_size   BIGINT,
    format      VARCHAR(50),   -- 'manu', 'step', 'stl', etc.
    thumbnail   VARCHAR(512),  -- MinIO thumbnail key
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Analysis Jobs
CREATE TABLE jobs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    job_type    VARCHAR(50) NOT NULL,  -- 'dfm', 'cost', 'nest', 'gcode'
    status      VARCHAR(50) DEFAULT 'pending',
    params      JSONB DEFAULT '{}',
    result      JSONB,
    error       TEXT,
    started_at  TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Material Catalog
CREATE TABLE materials (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) UNIQUE NOT NULL,
    category    VARCHAR(50) NOT NULL,  -- 'metal', 'plastic', 'composite'
    density     FLOAT NOT NULL,        -- g/cm³
    tensile_strength FLOAT,            -- MPa
    yield_strength   FLOAT,            -- MPa
    thermal_conductivity FLOAT,        -- W/m·K
    hardness    FLOAT,                 -- HB
    cost_per_kg FLOAT,                 -- USD
    specific_cutting_force FLOAT,      -- N/mm² (Kienzle kc1.1)
    taylor_n    FLOAT,                 -- Taylor exponent
    properties  JSONB DEFAULT '{}',    -- Extended properties
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Quotes
CREATE TABLE quotes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id),
    quantity    INTEGER NOT NULL DEFAULT 1,
    unit_cost   FLOAT,
    setup_cost  FLOAT,
    material_cost FLOAT,
    total_cost  FLOAT,
    lead_time_days INTEGER,
    breakdown   JSONB DEFAULT '{}',    -- Detailed cost breakdown
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_jobs_project ON jobs(project_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_materials_category ON materials(category);
```

== Appendix D: Docker Services Inventory

#table(
  columns: (auto, auto, auto, auto, auto),
  table.header([*Service*], [*Image*], [*Port*], [*CPU*], [*Memory*]),
  [`api-gateway`], [`r3ditor/api:latest`], [3001], [0.5], [512 MB],
  [`worker-cad`], [`r3ditor/worker-cad:latest`], [—], [2.0], [1 GB],
  [`worker-analysis`], [`r3ditor/worker-analysis:latest`], [—], [1.0], [512 MB],
  [`worker-cam`], [`r3ditor/worker-cam:latest`], [—], [2.0], [1 GB],
  [`postgres`], [`postgres:16-alpine`], [5432], [1.0], [1 GB],
  [`redis`], [`redis:7-alpine`], [6379], [0.25], [256 MB],
  [`minio`], [`minio/minio:latest`], [9000/9001], [0.5], [512 MB],
  [`jaeger`], [`jaegertracing/all-in-one`], [16686], [0.25], [256 MB],
  [`prometheus`], [`prom/prometheus`], [9090], [0.25], [256 MB],
)

*Total resource requirements:* ~7.75 CPU cores, ~5.3 GB RAM (development profile)

== Appendix E: Platform Adapter Configuration

=== Shopify Adapter

```toml
[shopify]
api_version = "2024-10"
scopes = ["read_products", "write_products", "read_orders"]
webhook_topics = ["orders/create", "orders/paid"]
embed_mode = "app_bridge"  # iframe in Shopify admin
storefront_widget = true
```

=== WooCommerce Adapter

```toml
[woocommerce]
api_version = "wc/v3"
auth_method = "oauth1"     # Consumer key/secret
webhook_events = ["order.created", "order.completed"]
widget_shortcode = "[r3ditor_configurator]"
rest_namespace = "r3ditor/v1"
```

== Appendix F: Keyboard Shortcuts Reference

#table(
  columns: (auto, auto, 1fr),
  table.header([*Shortcut*], [*macOS*], [*Action*]),
  [`Ctrl+N`], [`⌘+N`], [New project],
  [`Ctrl+O`], [`⌘+O`], [Open project (.manu, .step, .stl)],
  [`Ctrl+S`], [`⌘+S`], [Save project],
  [`Ctrl+Z`], [`⌘+Z`], [Undo],
  [`Ctrl+Y`], [`⌘+⇧+Z`], [Redo],
  [`Ctrl+Shift+E`], [`⌘+⇧+E`], [Export (format dialog)],
  [`1–8`], [`1–8`], [Switch view mode (Shaded, Wireframe, X-Ray, etc.)],
  [`F`], [`F`], [Fit model to viewport],
  [`G`], [`G`], [Toggle grid],
  [`Ctrl+Shift+A`], [`⌘+⇧+A`], [Run DFM analysis],
  [`Ctrl+Shift+C`], [`⌘+⇧+C`], [Generate cost estimate],
  [`Ctrl+Shift+P`], [`⌘+⇧+P`], [Command palette],
  [`Delete`], [`⌫`], [Delete selected feature],
  [`Escape`], [`Escape`], [Cancel current operation / deselect],
  [`Middle Mouse`], [`Middle Mouse`], [Orbit viewport],
  [`Shift+Middle Mouse`], [`Shift+Middle Mouse`], [Pan viewport],
  [`Scroll Wheel`], [`Scroll Wheel`], [Zoom viewport],
)

== Appendix G: Glossary

#table(
  columns: (auto, 1fr),
  table.header([*Term*], [*Definition*]),
  [B-Rep], [Boundary Representation — solid model defined by vertices, edges, faces, shells],
  [DFM], [Design for Manufacturability — analysis of part geometry for manufacturing feasibility],
  [ECS], [Entity Component System — data-oriented architecture pattern for game/simulation engines],
  [G-code], [Numerical control programming language for CNC machine tools (ISO 6983)],
  [Kerf], [Width of material removed by a cutting tool (laser, plasma, waterjet)],
  [K-factor], [Ratio of neutral axis position to sheet thickness for bend calculations],
  [LOD], [Level of Detail — progressive mesh simplification for rendering performance],
  [Nesting], [Optimal arrangement of parts on a sheet to minimize material waste],
  [PBR], [Physically Based Rendering — lighting model using metallic/roughness workflow],
  [PMI], [Product Manufacturing Information — annotations embedded in 3D models (STEP)],
  [SSE], [Server-Sent Events — HTTP-based push protocol for real-time job status updates],
  [Tessellation], [Conversion of B-Rep surfaces to triangle meshes for rendering],
  [WASM], [WebAssembly — portable binary format for sandboxed plugin execution],
  [WGSL], [WebGPU Shading Language — shader language for the wgpu graphics API],
  [wgpu], [Rust implementation of the WebGPU API (Vulkan/Metal/DX12/OpenGL backends)],
)
