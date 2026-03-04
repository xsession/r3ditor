//! Viewport management — handles the 3D rendering surface.

use crate::camera::Camera;
use crate::pipeline::ViewMode;
use crate::scene::RenderScene;

/// A viewport into the 3D scene
#[derive(Debug)]
pub struct Viewport {
    pub width: u32,
    pub height: u32,
    pub camera: Camera,
    pub view_mode: ViewMode,
    pub scene: RenderScene,
    pub show_grid: bool,
    pub show_axes: bool,
    pub show_wireframe_overlay: bool,
}

impl Viewport {
    pub fn new(width: u32, height: u32) -> Self {
        let aspect = width as f32 / height as f32;
        Self {
            width,
            height,
            camera: Camera::new_perspective(
                glam::Vec3::new(5.0, 5.0, 5.0),
                glam::Vec3::ZERO,
                45.0,
                aspect,
            ),
            view_mode: ViewMode::Shaded,
            scene: RenderScene::new(),
            show_grid: true,
            show_axes: true,
            show_wireframe_overlay: false,
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.width = width;
        self.height = height;
        self.camera.aspect_ratio = width as f32 / height as f32;
    }

    /// Toggle view mode
    pub fn set_view_mode(&mut self, mode: ViewMode) {
        self.view_mode = mode;
    }
}

impl Default for Viewport {
    fn default() -> Self {
        Self::new(1280, 720)
    }
}
