#import "../template.typ": *

= GPU Acceleration & Renderer

== Current Implementation Status

#warning-box(title: "Implementation Note")[
  The renderer crate currently provides *foundational infrastructure* (6 files, 553 lines) built on Three.js via the React/Tauri frontend. The advanced wgpu-based GPU pipeline described in this chapter represents the *target architecture* for future phases. The current implementation handles basic scene management, camera control (orbit/pan/zoom), and mesh display through the Three.js/React Three Fiber stack.
]

== Target Rendering Architecture

The r3ditor renderer is built on *wgpu 28*, providing a cross-platform GPU abstraction over Vulkan 1.3, Metal 3, DirectX 12, and WebGPU. The rendering pipeline consists of *11 passes* orchestrated by the render engine.

#align(center)[
  #image("../assets/gpu-render-pipeline.svg", width: 100%)
]

== 11-Pass Render Pipeline

#table(
  columns: (auto, auto, 1fr, auto),
  table.header([*Pass*], [*Type*], [*Description*], [*Cost*]),
  [1. Z-Prepass], [Depth], [Populate depth buffer for early-Z rejection in later passes], [Low],
  [2. Shadow Map], [Depth], [Cascaded shadow maps (4 levels) from directional light], [Medium],
  [3. PBR Shading], [Color], [Cook-Torrance BRDF with metallic-roughness workflow], [High],
  [4. DFM Overlay], [Color], [Severity heat map visualization from DFM analysis], [Low],
  [5. Toolpath], [Color], [Animated CNC toolpath with feed-rate color coding], [Low],
  [6. Grid / Axes], [Color], [Infinite ground grid with anti-aliased lines], [Low],
  [7. Edge Outline], [Post], [Sobel edge detection for selection highlighting], [Medium],
  [8. SSAO], [Post], [Screen-space ambient occlusion for depth perception], [Medium],
  [9. Bloom], [Post], [HDR bloom extraction + Gaussian blur composite], [Low],
  [10. FXAA], [Post], [Fast approximate anti-aliasing (subpixel quality)], [Low],
  [11. UI Overlay], [Blit], [egui immediate-mode UI rendering over the 3D viewport], [Low],
)

== PBR Shading Model

The primary shading pass implements the *Cook-Torrance microfacet BRDF*:

$ f_r = (D dot F dot G) / (4 dot (omega_o dot n) dot (omega_i dot n)) $

Where:
- $D$ = GGX/Trowbridge-Reitz normal distribution function
- $F$ = Fresnel-Schlick approximation: $F_0 + (1 - F_0)(1 - cos theta)^5$
- $G$ = Smith's Geometry function with Schlick-GGX

The shader applies *ACES filmic tone mapping* for HDR to LDR conversion and outputs in sRGB color space.

== WGSL Shader Modules

Five WGSL shader files power the rendering:

#table(
  columns: (auto, auto, 1fr),
  table.header([*Shader*], [*Lines*], [*Purpose*]),
  [`pbr.wgsl`], [~200], [Cook-Torrance BRDF, point/directional lighting, ACES tone mapping, shadow sampling],
  [`grid.wgsl`], [~80], [Infinite ground grid with configurable scale, anti-aliased line rendering, depth fade],
  [`outline.wgsl`], [~60], [Sobel edge detection from depth/normal buffer, selection highlight with configurable color],
  [`dfm_viz.wgsl`], [~70], [Severity-to-color ramp (green → yellow → red), opacity blending, threshold filtering],
  [`toolpath.wgsl`], [~90], [Animated line rendering with time-based progress, feed rate to color mapping, depth testing],
)

=== Shader Budget

#table(
  columns: (auto, auto, auto, auto),
  table.header([*Shader*], [*ALU Ops*], [*Texture Reads*], [*Budget*]),
  [PBR], [~120], [4 (albedo, normal, metal-rough, shadow)], [\< 2 ms],
  [Grid], [~30], [0], [\< 0.5 ms],
  [Outline], [~40], [2 (depth, normal)], [\< 0.5 ms],
  [DFM Viz], [~25], [1 (severity buffer)], [\< 0.3 ms],
  [Toolpath], [~35], [0], [\< 0.3 ms],
)

== Visual Modes

The renderer supports *8 distinct visual modes*, switchable at runtime:

#grid(
  columns: (1fr, 1fr),
  column-gutter: 16pt,
  row-gutter: 8pt,
  [*Shaded* — Full PBR with shadows and AO],
  [*Wireframe* — Edge-only display with hidden-line removal],
  [*X-Ray* — Semi-transparent solid with visible edges],
  [*DFM Heatmap* — Severity color overlay on geometry],
  [*Toolpath* — Animated CNC path visualization],
  [*Section View* — Clipping plane with cross-section fill],
  [*Exploded* — Assembly parts separated along axes],
  [*Draft / Technical* — Engineering drawing style (line art)],
)

== GPU Compute Strategy

Beyond rendering, wgpu compute shaders accelerate geometry operations:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Operation*], [*Description*], [*Speedup*]),
  [Tessellation], [NURBS surface → triangle mesh on GPU], [3–5×],
  [BVH Build], [Bounding volume hierarchy for ray casting], [2–4×],
  [Mesh Simplification], [Edge collapse with quadric error metrics], [2–3×],
  [Nesting], [Part placement optimization (future)], [5–10×],
)

== Camera System

The viewport camera supports multiple interaction modes:

- *Orbit* — rotate around focus point (middle mouse / Alt+LMB)
- *Pan* — translate parallel to view plane (Shift+MMB)
- *Zoom* — dolly in/out (scroll wheel / Ctrl+MMB)
- *Standard Views* — Front, Back, Top, Bottom, Left, Right, Isometric (keyboard shortcuts)
- *Fit All* — zoom to encompass all geometry (Home key)

=== 3-Point Lighting

The default scene uses a professional 3-point lighting setup:

#table(
  columns: (auto, auto, auto, auto),
  table.header([*Light*], [*Position*], [*Intensity*], [*Color*]),
  [Key], [(5, 10, 5)], [1.0], [Warm white (6500K)],
  [Fill], [(-5, 5, 3)], [0.4], [Cool blue tint],
  [Back], [(0, 5, -5)], [0.3], [Neutral white],
)

== Uniform Buffer Layout

GPU uniform data is structured for efficient access:

```rust
#[repr(C)]
pub struct SceneUniforms {
    pub view_projection: Mat4,  // Combined VP matrix
    pub camera_position: Vec4,  // Eye position
    pub light_direction: Vec4,  // Directional light
    pub light_color: Vec4,      // Light RGB + intensity
    pub time: f32,              // Elapsed seconds (animation)
    pub viewport_size: [f32; 2], // Width, height
}
```
