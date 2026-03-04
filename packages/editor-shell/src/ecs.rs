//! Lightweight ECS (Entity-Component-System) world.

use cad_kernel::brep::BRepModel;
use cad_kernel::features::FeatureTree;
use cad_kernel::history::HistoryManager;
use cad_kernel::tessellation::{self, TessellationConfig};
use glam::Mat4;
use renderer::scene::{RenderObject, RenderScene};
use shared_types::geometry::Transform3D;
use shared_types::materials::Appearance;
use uuid::Uuid;

/// An entity in the ECS world
#[derive(Debug)]
pub struct Entity {
    pub id: Uuid,
    pub name: String,
    pub model: Option<BRepModel>,
    pub feature_tree: FeatureTree,
    pub transform: Transform3D,
    pub appearance: Appearance,
    pub visible: bool,
    pub locked: bool,
}

impl Entity {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            model: None,
            feature_tree: FeatureTree::new(),
            transform: Transform3D::default(),
            appearance: Appearance::default(),
            visible: true,
            locked: false,
        }
    }

    pub fn with_model(mut self, model: BRepModel) -> Self {
        self.model = Some(model);
        self
    }
}

/// The ECS world containing all entities and global state
pub struct World {
    pub entities: Vec<Entity>,
    pub history: HistoryManager,
    tessellation_config: TessellationConfig,
}

impl World {
    pub fn new() -> Self {
        Self {
            entities: Vec::new(),
            history: HistoryManager::default(),
            tessellation_config: TessellationConfig::default(),
        }
    }

    /// Add an entity to the world
    pub fn spawn(&mut self, entity: Entity) -> Uuid {
        let id = entity.id;
        self.entities.push(entity);
        id
    }

    /// Remove an entity
    pub fn despawn(&mut self, id: Uuid) {
        self.entities.retain(|e| e.id != id);
    }

    /// Get an entity by ID
    pub fn get(&self, id: Uuid) -> Option<&Entity> {
        self.entities.iter().find(|e| e.id == id)
    }

    /// Get a mutable entity by ID
    pub fn get_mut(&mut self, id: Uuid) -> Option<&mut Entity> {
        self.entities.iter_mut().find(|e| e.id == id)
    }

    /// Solve all constraints (stage 2 of frame loop)
    pub fn solve_constraints(&mut self) {
        // TODO: Run 2D sketch constraint solver for active sketches
        // TODO: Run 3D assembly constraint solver
    }

    /// Rebuild dirty geometry (stage 3 of frame loop)
    pub fn rebuild_geometry(&mut self) {
        for entity in &mut self.entities {
            if let Some(ref mut model) = entity.model {
                if model.dirty {
                    let mesh = tessellation::tessellate(model, &self.tessellation_config);
                    model.mesh = Some(mesh);
                    model.dirty = false;
                }
            }
        }
    }

    /// Sync ECS entities to the render scene (stage 4 of frame loop)
    pub fn sync_render_scene(&self, scene: &mut RenderScene) {
        scene.objects.clear();

        for entity in &self.entities {
            if !entity.visible {
                continue;
            }
            if let Some(ref model) = entity.model {
                if let Some(ref mesh) = model.mesh {
                    scene.add_object(RenderObject {
                        id: entity.id,
                        name: entity.name.clone(),
                        mesh: mesh.clone(),
                        transform: entity.transform.to_matrix(),
                        appearance: entity.appearance.clone(),
                        visible: true,
                        selected: false,
                        cast_shadows: true,
                    });
                }
            }
        }
    }
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}
