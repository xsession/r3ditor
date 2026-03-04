//! Scene graph for rendering.

use glam::Mat4;
use shared_types::geometry::TriMesh;
use shared_types::materials::Appearance;
use uuid::Uuid;

/// A renderable object in the scene
#[derive(Debug, Clone)]
pub struct RenderObject {
    pub id: Uuid,
    pub name: String,
    pub mesh: TriMesh,
    pub transform: Mat4,
    pub appearance: Appearance,
    pub visible: bool,
    pub selected: bool,
    /// Whether this object participates in shadow casting
    pub cast_shadows: bool,
}

/// The complete render scene
#[derive(Debug, Clone)]
pub struct RenderScene {
    pub objects: Vec<RenderObject>,
    pub lights: Vec<Light>,
    pub environment: Environment,
}

/// Light types
#[derive(Debug, Clone)]
pub enum Light {
    Directional {
        direction: [f32; 3],
        color: [f32; 3],
        intensity: f32,
        cast_shadows: bool,
    },
    Point {
        position: [f32; 3],
        color: [f32; 3],
        intensity: f32,
        range: f32,
    },
    Spot {
        position: [f32; 3],
        direction: [f32; 3],
        color: [f32; 3],
        intensity: f32,
        inner_cone: f32,
        outer_cone: f32,
        range: f32,
    },
}

/// Environment settings (IBL, background)
#[derive(Debug, Clone)]
pub struct Environment {
    pub ambient_color: [f32; 3],
    pub ambient_intensity: f32,
    pub background_color: [f32; 4],
    pub grid_enabled: bool,
    pub grid_size: f32,
    pub grid_divisions: u32,
}

impl Default for Environment {
    fn default() -> Self {
        Self {
            ambient_color: [1.0, 1.0, 1.0],
            ambient_intensity: 0.3,
            background_color: [0.18, 0.20, 0.25, 1.0],
            grid_enabled: true,
            grid_size: 100.0,
            grid_divisions: 10,
        }
    }
}

impl RenderScene {
    pub fn new() -> Self {
        Self {
            objects: Vec::new(),
            lights: vec![
                // Default 3-point lighting
                Light::Directional {
                    direction: [-0.5, -0.8, -0.3],
                    color: [1.0, 0.98, 0.95],
                    intensity: 1.5,
                    cast_shadows: true,
                },
                Light::Directional {
                    direction: [0.4, -0.3, 0.6],
                    color: [0.7, 0.8, 1.0],
                    intensity: 0.5,
                    cast_shadows: false,
                },
            ],
            environment: Environment::default(),
        }
    }

    pub fn add_object(&mut self, obj: RenderObject) {
        self.objects.push(obj);
    }

    pub fn remove_object(&mut self, id: Uuid) {
        self.objects.retain(|o| o.id != id);
    }

    pub fn get_object(&self, id: Uuid) -> Option<&RenderObject> {
        self.objects.iter().find(|o| o.id == id)
    }

    pub fn get_object_mut(&mut self, id: Uuid) -> Option<&mut RenderObject> {
        self.objects.iter_mut().find(|o| o.id == id)
    }
}

impl Default for RenderScene {
    fn default() -> Self {
        Self::new()
    }
}
