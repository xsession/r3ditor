//! Lightweight ECS (Entity-Component-System) world.

use std::collections::HashMap;

use cad_kernel::brep::BRepBody;
use cad_kernel::features::FeatureTree;
use cad_kernel::history::HistoryManager;
use cad_kernel::sketch::Sketch;
use cad_kernel::snap::{SnapConfig, PickingColorMap};
use cad_kernel::snapshot::{ToolSnapshotManager, ClipboardBuffer};
use cad_kernel::tessellation::TessellationParams;
use cad_kernel::tools::{ToolStateMachine, ToolInput, ToolModalResult, StatefulTool};
use renderer::scene::{RenderObject, RenderScene};
use shared_types::geometry::{Transform3D, TriMesh};
use shared_types::materials::Appearance;
use uuid::Uuid;

/// An entity in the ECS world
#[derive(Debug)]
pub struct Entity {
    pub id: Uuid,
    pub name: String,
    pub brep: Option<BRepBody>,
    pub mesh: Option<TriMesh>,
    pub dirty: bool,
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
            brep: None,
            mesh: None,
            dirty: false,
            feature_tree: FeatureTree::new(),
            transform: Transform3D::default(),
            appearance: Appearance::default(),
            visible: true,
            locked: false,
        }
    }

    pub fn with_brep(mut self, body: BRepBody) -> Self {
        self.brep = Some(body);
        self.dirty = true;
        self
    }

    pub fn with_mesh(mut self, mesh: TriMesh) -> Self {
        self.mesh = Some(mesh);
        self.dirty = false;
        self
    }
}

/// The ECS world containing all entities and global state
pub struct World {
    pub entities: Vec<Entity>,
    pub history: HistoryManager,
    pub tessellation_params: TessellationParams,

    // ── Sketch System ──
    /// Active sketches indexed by ID
    pub sketches: HashMap<Uuid, Sketch>,
    /// Currently active (being edited) sketch
    pub active_sketch: Option<Uuid>,
    /// Tool-level snapshot manager (for in-tool undo)
    pub sketch_snapshots: ToolSnapshotManager,
    /// Clipboard buffer for copy/paste
    pub clipboard: Option<ClipboardBuffer>,
    /// Snap configuration
    pub snap_config: SnapConfig,
    /// GPU picking color map
    pub picking_map: PickingColorMap,
}

impl World {
    pub fn new() -> Self {
        Self {
            entities: Vec::new(),
            history: HistoryManager::default(),
            tessellation_params: TessellationParams::default(),
            sketches: HashMap::new(),
            active_sketch: None,
            sketch_snapshots: ToolSnapshotManager::default(),
            clipboard: None,
            snap_config: SnapConfig::default(),
            picking_map: PickingColorMap::new(),
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

    // ── Sketch Management ──

    /// Create a new sketch and return its ID
    pub fn create_sketch(&mut self, name: impl Into<String>) -> Uuid {
        let sketch = Sketch::new(name);
        let id = sketch.id;
        self.sketches.insert(id, sketch);
        id
    }

    /// Get a reference to a sketch by ID
    pub fn get_sketch(&self, id: Uuid) -> Option<&Sketch> {
        self.sketches.get(&id)
    }

    /// Get a mutable reference to a sketch by ID
    pub fn get_sketch_mut(&mut self, id: Uuid) -> Option<&mut Sketch> {
        self.sketches.get_mut(&id)
    }

    /// Get the currently active sketch (if any)
    pub fn active_sketch(&self) -> Option<&Sketch> {
        self.active_sketch.and_then(|id| self.sketches.get(&id))
    }

    /// Get mutable ref to the currently active sketch
    pub fn active_sketch_mut(&mut self) -> Option<&mut Sketch> {
        let id = self.active_sketch?;
        self.sketches.get_mut(&id)
    }

    /// Set the active sketch
    pub fn set_active_sketch(&mut self, id: Option<Uuid>) {
        self.active_sketch = id;
    }

    /// Remove a sketch by ID
    pub fn remove_sketch(&mut self, id: Uuid) -> Option<Sketch> {
        if self.active_sketch == Some(id) {
            self.active_sketch = None;
        }
        self.sketches.remove(&id)
    }

    /// List all sketch IDs and names
    pub fn list_sketches(&self) -> Vec<(Uuid, String)> {
        self.sketches.iter()
            .map(|(&id, s)| (id, s.name.clone()))
            .collect()
    }

    /// Rebuild dirty geometry (stage 3 of frame loop)
    pub fn rebuild_geometry(&mut self) {
        // TODO: For dirty entities with a BRepBody, tessellate into TriMesh
        // Currently, meshes are created directly by commands (box/cylinder primitives)
        // Future: iterate features → execute → tessellate BRepBody → TriMesh
    }

    /// Sync ECS entities to the render scene (stage 4 of frame loop)
    pub fn sync_render_scene(&self, scene: &mut RenderScene) {
        scene.objects.clear();

        for entity in &self.entities {
            if !entity.visible {
                continue;
            }
            if let Some(ref mesh) = entity.mesh {
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

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_entity_new() {
        let entity = Entity::new("My Box");
        assert_eq!(entity.name, "My Box");
        assert!(entity.visible);
        assert!(!entity.locked);
        assert!(!entity.dirty);
        assert!(entity.brep.is_none());
        assert!(entity.mesh.is_none());
    }

    #[test]
    fn test_entity_with_brep() {
        let entity = Entity::new("Box").with_brep(BRepBody::new());
        assert!(entity.brep.is_some());
        assert!(entity.dirty, "Adding BRep should mark entity as dirty");
    }

    #[test]
    fn test_world_new() {
        let world = World::new();
        assert!(world.entities.is_empty());
    }

    #[test]
    fn test_world_spawn() {
        let mut world = World::new();
        let entity = Entity::new("Test");
        let id = entity.id;
        let spawned_id = world.spawn(entity);
        assert_eq!(spawned_id, id);
        assert_eq!(world.entities.len(), 1);
    }

    #[test]
    fn test_world_get() {
        let mut world = World::new();
        let entity = Entity::new("Findme");
        let id = entity.id;
        world.spawn(entity);
        let found = world.get(id);
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "Findme");
    }

    #[test]
    fn test_world_get_nonexistent() {
        let world = World::new();
        let fake_id = Uuid::new_v4();
        assert!(world.get(fake_id).is_none());
    }

    #[test]
    fn test_world_get_mut() {
        let mut world = World::new();
        let entity = Entity::new("Mutable");
        let id = entity.id;
        world.spawn(entity);
        {
            let found = world.get_mut(id).unwrap();
            found.name = "Changed".to_string();
        }
        assert_eq!(world.get(id).unwrap().name, "Changed");
    }

    #[test]
    fn test_world_despawn() {
        let mut world = World::new();
        let entity = Entity::new("ToDelete");
        let id = entity.id;
        world.spawn(entity);
        assert_eq!(world.entities.len(), 1);
        world.despawn(id);
        assert_eq!(world.entities.len(), 0);
        assert!(world.get(id).is_none());
    }

    #[test]
    fn test_world_multiple_entities() {
        let mut world = World::new();
        let id1 = world.spawn(Entity::new("A"));
        let id2 = world.spawn(Entity::new("B"));
        let id3 = world.spawn(Entity::new("C"));
        assert_eq!(world.entities.len(), 3);
        world.despawn(id2);
        assert_eq!(world.entities.len(), 2);
        assert!(world.get(id1).is_some());
        assert!(world.get(id2).is_none());
        assert!(world.get(id3).is_some());
    }
}
