#import "../template.typ": *

= Appendices

== Appendix A: Workspace Crate Reference

#align(center)[
  #image("../assets/crate-dependency-graph.svg", width: 100%)
]

The complete Cargo workspace comprises 15 crates organized in four layers:

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Crate*], [*Path*], [*Lines / Tests*], [*Description*]),
  [`shared-types`], [`packages/shared-types`], [1,130 / —], [Cross-cutting data types: geometry, materials, DFM, manufacturing, estimation, units, API contracts],
  [`cad-kernel`], [`packages/cad-kernel`], [10,269 / 125], [Truck B-Rep kernel, 20 feature types, sketch system (7 entities, tools, snap), tessellation, history],
  [`cam-engine`], [`packages/cam-engine`], [1,555 / 64], [CNC physics, sheet metal, toolpath, nesting, 8 G-code post-processors],
  [`constraint-solver`], [`packages/constraint-solver`], [1,915 / 30], [4-stage cascade solver (DogLeg→LM→BFGS→NR), 19 constraint types, 3D assembly solver],
  [`dfm-analyzer`], [`packages/dfm-analyzer`], [561 / 27], [Design-for-manufacturability analysis, rule engine, severity scoring],
  [`renderer`], [`packages/renderer`], [553 / —], [Rendering infrastructure: scene management, camera, mesh display],
  [`editor-shell`], [`packages/editor-shell`], [1,301 / 22], [World struct, 22 EditorCommand variants, 21 tool types, StatefulTool lifecycle],
  [`plugin-runtime`], [`packages/plugin-runtime`], [463 / 7], [wasmtime 28 plugin host, manifest parsing, capability-based security],
  [`wasm-meshkit`], [`packages/wasm-meshkit`], [531 / 20], [WASM mesh toolkit: STL parsing, mesh simplification, geometry queries],
  [`api-gateway`], [`packages/api-gateway`], [— / —], [Axum 0.7 REST API, JWT auth, file upload, job queue, SSE],
  [`worker-analysis`], [`packages/worker-analysis`], [— / —], [Redis Stream consumer for DFM analysis jobs],
  [`worker-cad`], [`packages/worker-cad`], [— / —], [Redis Stream consumer for geometry import jobs],
  [`worker-cam`], [`packages/worker-cam`], [— / —], [Redis Stream consumer for toolpath/nesting computation],
  [`bench`], [`packages/bench`], [— / —], [Criterion benchmark suite: tessellation, constraints, CNC, nesting],
  [`desktop`], [`apps/desktop/src-tauri`], [~800 / —], [Tauri 2.2 shell: main.rs + commands.rs (37 IPC handlers, 692 lines)],
)

== Appendix B: Technology Matrix

#align(center)[
  #image("../assets/technology-matrix.svg", width: 100%)
]

#table(
  columns: (auto, auto, auto),
  table.header([*Technology*], [*Version*], [*Purpose*]),
  [Rust], [1.93+], [Primary systems language],
  [TypeScript], [5.6+], [Frontend application language],
  [React], [18.3], [UI component framework],
  [Tailwind CSS], [3.4+], [Utility-first CSS framework],
  [Vite], [6.4.1], [Frontend build tool],
  [Tauri], [2.2], [Desktop shell (Rust + WebView)],
  [Three.js], [0.170], [3D rendering in webview viewport],
  [Zustand], [5.0], [React state management],
  [truck], [0.6], [B-Rep geometry kernel (pure Rust)],
  [nalgebra], [0.33], [Linear algebra and sparse matrices],
  [glam], [0.29], [Fast 3D math (Vec3, Mat4)],
  [Axum], [0.7], [Async HTTP framework],
  [SQLx], [0.8], [Async PostgreSQL driver],
  [Tokio], [1.42], [Async runtime],
  [Rayon], [1.10], [Data parallelism (work-stealing)],
  [wasmtime], [28.0], [WASM plugin runtime],
  [serde], [1.0], [Serialization framework],
  [Vitest], [3.2], [Frontend test framework],
  [PostgreSQL], [16], [Primary database],
  [Redis], [7], [Job queue + session cache],
  [MinIO], [latest], [S3-compatible object storage],
  [Docker], [27+], [Containerization],
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
  [G-code], [Numerical control programming language for CNC machine tools (ISO 6983)],
  [IPC], [Inter-Process Communication — Tauri's typed invoke system between React frontend and Rust backend],
  [Kerf], [Width of material removed by a cutting tool (laser, plasma, waterjet)],
  [K-factor], [Ratio of neutral axis position to sheet thickness for bend calculations],
  [Nesting], [Optimal arrangement of parts on a sheet to minimize material waste],
  [PBR], [Physically Based Rendering — lighting model using metallic/roughness workflow],
  [PMI], [Product Manufacturing Information — annotations embedded in 3D models (STEP)],
  [SSE], [Server-Sent Events — HTTP-based push protocol for real-time job status updates],
  [StatefulTool], [Blender-inspired tool lifecycle pattern with state machine (Idle → Active → Complete)],
  [Sketch], [2D drawing plane with entities (lines, circles, arcs) and geometric constraints],
  [Snap], [Automatic alignment to grid points, endpoints, midpoints, or intersections during drawing],
  [Tessellation], [Conversion of B-Rep surfaces to triangle meshes for rendering],
  [WASM], [WebAssembly — portable binary format for sandboxed plugin execution],
)
