//! # renderer
//!
//! GPU-accelerated PBR renderer using wgpu 28.
//!
//! ## Render Pipeline
//! 1. Z Pre-pass (early depth)
//! 2. Shadow Maps (4 cascades)
//! 3. G-Buffer (albedo, normal, metallic-roughness, emission)
//! 4. Deferred Lighting (Cook-Torrance BRDF, IBL)
//! 5. SSAO (screen-space ambient occlusion)
//! 6. Edge Detection (CAD-style wireframe)
//! 7. Bloom (HDR glow)
//! 8. TAA (temporal anti-aliasing)
//! 9. Gizmo Overlay
//! 10. egui Overlay

pub mod camera;
pub mod gpu;
pub mod pipeline;
pub mod scene;
pub mod viewport;

pub use camera::Camera;
pub use scene::{RenderScene, RenderObject};
pub use viewport::Viewport;
