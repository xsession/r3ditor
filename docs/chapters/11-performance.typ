#import "../template.typ": *

= Performance Engineering

== Performance Targets

R3ditor is engineered to meet strict latency and throughput targets across all subsystems:

#align(center)[
  #image("../assets/performance-targets.svg", width: 100%)
]

=== Geometry Operations

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Operation*], [*Target*], [*Budget*], [*Strategy*]),
  [Tessellation (100K faces)], [\< 16 ms], [1 frame], [Parallel tessellation via Rayon; adaptive LOD reduces face count],
  [Boolean union/subtract], [\< 100 ms], [6 frames], [Truck B-Rep kernel with spatial hash acceleration],
  [Fillet/chamfer], [\< 50 ms], [3 frames], [Edge subdivision on GPU; fallback to CPU for complex topology],
  [Feature recognition], [\< 200 ms], [12 frames], [Pattern matching on B-Rep graph; cached results in ECS component],
  [Constraint solving], [\< 10 ms], [\< 1 frame], [Newton-Raphson with Jacobian caching; max 50 iterations],
  [STL import (1M tri)], [\< 500 ms], [30 frames], [`wasm-meshkit` parallel parser; memory-mapped file I/O],
  [STEP import (medium)], [\< 2 s], [—], [Streaming parser; UI remains responsive via async task],
)

=== Rendering

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Metric*], [*Target*], [*GPU Tier*], [*Strategy*]),
  [Frame rate (1M triangles)], [60 fps], [Mid-range], [Frustum culling + LOD + instanced draw calls],
  [Frame rate (5M triangles)], [30 fps], [Mid-range], [Aggressive LOD; GPU occlusion query],
  [Ray pick latency], [\< 5 ms], [Any], [GPU compute pick pass; single-pixel render target],
  [Shader compile], [\< 200 ms], [Any], [WGSL pre-compilation at startup; pipeline cache],
  [Texture upload (4K)], [\< 2 ms], [Any], [Staging buffer + async queue submit],
  [View mode switch], [\< 16 ms], [Any], [Hot-swap pipeline; pre-built pipeline variants],
)

=== Manufacturing

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Operation*], [*Target*], [*Budget*], [*Strategy*]),
  [DFM analysis (full)], [\< 500 ms], [—], [Parallel rule evaluation via Rayon; early-exit on critical findings],
  [Cost estimation], [\< 200 ms], [—], [Cached material lookup; pre-computed machine rates],
  [Tool estimation], [\< 200 ms], [—], [Kienzle model with tabulated specific cutting force],
  [Nesting (20 parts)], [\< 2 s], [—], [Bottom-left fill + Rayon parallel rotation search],
  [G-code generation], [\< 1 s], [—], [Streaming writer; post-processor runs in parallel],
)

== Memory Budget

#table(
  columns: (auto, auto, 1fr),
  table.header([*Pool*], [*Budget*], [*Management Strategy*]),
  [Geometry (B-Rep + mesh)], [512 MB], [Arena allocator; LRU eviction for LOD levels; memory-mapped for large models],
  [GPU buffers], [256 MB], [Staging ring buffer (16 MB) + device-local allocations; shared vertex/index pools],
  [Undo/Redo stack], [128 MB], [Circular buffer of delta snapshots; old entries evicted FIFO],
  [Texture atlas], [64 MB], [Shared material textures; mip chain generation on demand],
  [Plugin WASM heap], [64 MB / plugin], [Configurable per-plugin; wasmtime memory limiter],
  [File I/O buffers], [32 MB], [Memory-mapped files for import; streaming write for export],
  [ECS components], [64 MB], [Archetype storage; component arrays pre-allocated by entity count estimate],
)

*Total desktop budget: ~1.2 GB* (comfortable on 4 GB+ systems with headroom for OS and browser)

== Parallelism Architecture

=== Thread Budget

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Pool*], [*Threads*], [*Runtime*], [*Workload*]),
  [Rayon global], [N-1 (N = CPU cores)], [Rayon], [Parallel geometry, tessellation, nesting, DFM rule evaluation],
  [Tokio runtime], [4], [Tokio], [Async I/O: HTTP handlers, file I/O, database queries, SSE streams],
  [Render thread], [1], [Dedicated], [wgpu command encoding + queue submit; never blocked by compute],
  [UI thread], [1], [Main], [egui/React event loop; 16 ms budget per frame],
  [File watcher], [1], [Dedicated], [Plugin hot-reload, project file sync],
)

=== Rayon Work-Stealing

Geometry operations leverage Rayon's work-stealing thread pool:

```rust
use rayon::prelude::*;

// Parallel tessellation of B-Rep faces
let meshes: Vec<Mesh> = solid.faces()
    .par_iter()
    .map(|face| tessellate_face(face, tolerance))
    .collect();

// Parallel DFM rule evaluation
let findings: Vec<DfmFinding> = rules
    .par_iter()
    .flat_map(|rule| rule.evaluate(&model))
    .collect();
```

=== Tokio Async I/O

All network and file I/O uses Tokio's async runtime:

```rust
// Concurrent file upload + database write
let (upload_result, db_result) = tokio::join!(
    minio.put_object(&bucket, &key, data),
    sqlx::query!("INSERT INTO projects ...")
        .execute(&pool)
);
```

== Benchmarking

R3ditor includes a dedicated benchmark suite in `packages/bench/`:

#table(
  columns: (auto, auto, 1fr),
  table.header([*Benchmark*], [*Framework*], [*What It Measures*]),
  [`tessellation`], [Criterion.rs], [Tessellation throughput: faces/sec at various tolerance levels],
  [`boolean_ops`], [Criterion.rs], [Union/subtract/intersect latency on parameterized model sizes],
  [`dfm_analysis`], [Criterion.rs], [Full DFM pass on reference parts (thin wall, undercut, draft)],
  [`nesting`], [Criterion.rs], [Nesting 5/10/20/50 parts on standard sheet sizes],
  [`stl_import`], [Criterion.rs], [STL parse throughput: MB/s for binary and ASCII],
  [`rendering`], [Custom], [Frame time histogram over 1000 frames at various triangle counts],
)

Run benchmarks:

```bash
cargo bench -p r3ditor-bench
```

Results are output as HTML reports in `target/criterion/` with statistical analysis (mean, median, std dev, throughput).

#warning-box(title: "Performance Regression CI")[
  The CI pipeline runs benchmarks on every merge to `main` and compares against the baseline. A regression > 10% on any critical path triggers a *pipeline failure* and blocks the merge.
]

== Profiling Toolkit

#table(
  columns: (auto, auto, 1fr),
  table.header([*Tool*], [*Target*], [*Usage*]),
  [`tracy`], [CPU + GPU], [Frame profiler with timeline; `#[tracy::instrument]` on hot paths],
  [`puffin`], [CPU], [In-app profiler overlay (egui integration); zero-cost when disabled],
  [`wgpu` timestamps], [GPU], [Per-pass timing via timestamp queries; reported in debug overlay],
  [Tokio Console], [Async], [Runtime inspector for task count, poll times, and waker stats],
  [`cargo flamegraph`], [CPU], [Sampling profiler for full-stack flame graphs],
  [`heaptrack`], [Memory], [Allocation tracking for memory leak detection],
)
