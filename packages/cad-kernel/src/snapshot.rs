//! # Serialization & Snapshot System — CAD_Sketcher-inspired
//!
//! Provides scene serialization, snapshot/restore for in-tool undo,
//! and copy/paste with dependency resolution.
//!
//! Based on patterns from CAD_Sketcher's `serialize.py`:
//! - Scene ↔ Dict round-trip serialization
//! - Snapshot buffer for tool-level undo (not document-level)
//! - Copy/paste with entity pointer remapping

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::sketch::{Sketch, SketchEntity, SketchConstraint, SketchEntityId};

// ─── Scene Snapshot (CAD_Sketcher serialize.scene_to_dict / scene_from_dict) ──

/// A complete serializable snapshot of a sketch state.
/// Used for tool-level undo and file save/load.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchSnapshot {
    /// Serialized entities
    pub entities: Vec<SerializedEntity>,
    /// Serialized constraints
    pub constraints: Vec<SerializedConstraint>,
    /// Entity ordering
    pub entity_order: Vec<String>,
    /// Sketch metadata
    pub name: String,
    pub sketch_id: String,
}

/// A serialized entity entry (CAD_Sketcher pg_to_dict for PropertyGroups)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedEntity {
    pub id: String,
    pub entity_type: String,
    pub data: serde_json::Value,
}

/// A serialized constraint entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedConstraint {
    pub id: String,
    pub constraint_type: String,
    pub data: serde_json::Value,
}

impl SketchSnapshot {
    /// Create a snapshot from a sketch (CAD_Sketcher scene_to_dict)
    pub fn from_sketch(sketch: &Sketch) -> Self {
        let entities: Vec<SerializedEntity> = sketch.entity_order.iter()
            .filter_map(|id| sketch.entities.get(id))
            .map(|e| SerializedEntity {
                id: e.id().to_string(),
                entity_type: entity_type_name(e),
                data: serde_json::to_value(e).unwrap_or_default(),
            })
            .collect();

        let constraints: Vec<SerializedConstraint> = sketch.constraints.iter()
            .map(|c| SerializedConstraint {
                id: c.id().to_string(),
                constraint_type: constraint_type_name(c),
                data: serde_json::to_value(c).unwrap_or_default(),
            })
            .collect();

        let entity_order: Vec<String> = sketch.entity_order.iter()
            .map(|id| id.to_string())
            .collect();

        Self {
            entities,
            constraints,
            entity_order,
            name: sketch.name.clone(),
            sketch_id: sketch.id.to_string(),
        }
    }

    /// Restore a sketch from a snapshot (CAD_Sketcher scene_from_dict)
    pub fn restore_to_sketch(&self, sketch: &mut Sketch) {
        // Clear existing data
        sketch.entities.clear();
        sketch.entity_order.clear();
        sketch.constraints.clear();

        // Restore entities
        for se in &self.entities {
            if let Ok(entity) = serde_json::from_value::<SketchEntity>(se.data.clone()) {
                let id = entity.id();
                sketch.entities.insert(id, entity);
                sketch.entity_order.push(id);
            }
        }

        // Restore constraints
        for sc in &self.constraints {
            if let Ok(constraint) = serde_json::from_value::<SketchConstraint>(sc.data.clone()) {
                sketch.constraints.push(constraint);
            }
        }

        sketch.name = self.name.clone();
    }

    /// Serialize to JSON string (for file save)
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Deserialize from JSON string (for file load)
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Serialize to binary (compact for undo buffers)
    pub fn to_bytes(&self) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let json = serde_json::to_vec(self)?;
        Ok(json)
    }

    /// Deserialize from binary
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        let snapshot: Self = serde_json::from_slice(bytes)?;
        Ok(snapshot)
    }
}

fn entity_type_name(entity: &SketchEntity) -> String {
    match entity {
        SketchEntity::Point { .. } => "Point".into(),
        SketchEntity::Line { .. } => "Line".into(),
        SketchEntity::Circle { .. } => "Circle".into(),
        SketchEntity::Arc { .. } => "Arc".into(),
        SketchEntity::Ellipse { .. } => "Ellipse".into(),
        SketchEntity::EllipticArc { .. } => "EllipticArc".into(),
        SketchEntity::BSpline { .. } => "BSpline".into(),
    }
}

fn constraint_type_name(constraint: &SketchConstraint) -> String {
    match constraint {
        SketchConstraint::Coincident { .. } => "Coincident".into(),
        SketchConstraint::PointOnCurve { .. } => "PointOnCurve".into(),
        SketchConstraint::MiddlePoint { .. } => "MiddlePoint".into(),
        SketchConstraint::Distance { .. } => "Distance".into(),
        SketchConstraint::HorizontalDistance { .. } => "HorizontalDistance".into(),
        SketchConstraint::VerticalDistance { .. } => "VerticalDistance".into(),
        SketchConstraint::Radius { .. } => "Radius".into(),
        SketchConstraint::Angle { .. } => "Angle".into(),
        SketchConstraint::Fixed { .. } => "Fixed".into(),
        SketchConstraint::Horizontal { .. } => "Horizontal".into(),
        SketchConstraint::Vertical { .. } => "Vertical".into(),
        SketchConstraint::Parallel { .. } => "Parallel".into(),
        SketchConstraint::Perpendicular { .. } => "Perpendicular".into(),
        SketchConstraint::Symmetric { .. } => "Symmetric".into(),
        SketchConstraint::Equal { .. } => "Equal".into(),
        SketchConstraint::Tangent { .. } => "Tangent".into(),
        SketchConstraint::Collinear { .. } => "Collinear".into(),
        SketchConstraint::PointLineDistance { .. } => "PointLineDistance".into(),
        SketchConstraint::Offset { .. } => "Offset".into(),
    }
}

// ─── Tool-Level Snapshot Buffer (CAD_Sketcher stateful_operator snapshot) ─────

/// Manages snapshot buffers for in-tool undo during interactive operations.
/// Equivalent to CAD_Sketcher's `GenericEntityOp.create_snapshot()` / `restore_snapshot()`.
pub struct ToolSnapshotManager {
    /// Stack of snapshots for nested tool undo
    snapshots: Vec<SketchSnapshot>,
    /// Maximum snapshot depth
    max_depth: usize,
}

impl ToolSnapshotManager {
    pub fn new(max_depth: usize) -> Self {
        Self {
            snapshots: Vec::new(),
            max_depth,
        }
    }

    /// Save current sketch state before a tool operation
    pub fn push_snapshot(&mut self, sketch: &Sketch) {
        if self.snapshots.len() >= self.max_depth {
            self.snapshots.remove(0);
        }
        self.snapshots.push(SketchSnapshot::from_sketch(sketch));
    }

    /// Restore the most recent snapshot (tool undo)
    pub fn pop_and_restore(&mut self, sketch: &mut Sketch) -> bool {
        if let Some(snapshot) = self.snapshots.pop() {
            snapshot.restore_to_sketch(sketch);
            true
        } else {
            false
        }
    }

    /// Get the current snapshot count
    pub fn depth(&self) -> usize {
        self.snapshots.len()
    }

    /// Clear all snapshots
    pub fn clear(&mut self) {
        self.snapshots.clear();
    }

    /// Peek at the most recent snapshot without removing it
    pub fn peek(&self) -> Option<&SketchSnapshot> {
        self.snapshots.last()
    }

    /// Pop the most recent snapshot without restoring it
    pub fn pop_snapshot(&mut self) -> Option<SketchSnapshot> {
        self.snapshots.pop()
    }
}

impl Default for ToolSnapshotManager {
    fn default() -> Self {
        Self::new(50)
    }
}

// ─── Copy/Paste with Dependency Resolution ────────────────────────────────────

/// A clipboard buffer holding entities and constraints for paste operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardBuffer {
    pub entities: Vec<SerializedEntity>,
    pub constraints: Vec<SerializedConstraint>,
}

impl ClipboardBuffer {
    /// Create a clipboard buffer from selected entities.
    /// Resolves all dependencies (constraints referencing selected entities).
    pub fn from_selection(sketch: &Sketch, selected_ids: &[SketchEntityId]) -> Self {
        // Collect entities
        let entities: Vec<SerializedEntity> = selected_ids.iter()
            .filter_map(|id| sketch.entities.get(id))
            .map(|e| SerializedEntity {
                id: e.id().to_string(),
                entity_type: entity_type_name(e),
                data: serde_json::to_value(e).unwrap_or_default(),
            })
            .collect();

        // Collect constraints whose entities are ALL within the selection
        let selected_set: std::collections::HashSet<SketchEntityId> =
            selected_ids.iter().copied().collect();

        let constraints: Vec<SerializedConstraint> = sketch.constraints.iter()
            .filter(|c| constraint_entities_in_set(c, &selected_set))
            .map(|c| SerializedConstraint {
                id: c.id().to_string(),
                constraint_type: constraint_type_name(c),
                data: serde_json::to_value(c).unwrap_or_default(),
            })
            .collect();

        Self { entities, constraints }
    }

    /// Paste entities into a sketch with ID remapping.
    /// Returns the IDs of the newly created entities.
    pub fn paste_into(&self, sketch: &mut Sketch, offset: (f64, f64)) -> Vec<SketchEntityId> {
        let mut id_remap: HashMap<String, Uuid> = HashMap::new();
        let mut new_ids = Vec::new();

        // Create new entities with fresh IDs and offset positions
        for se in &self.entities {
            let new_id = Uuid::new_v4();
            id_remap.insert(se.id.clone(), new_id);

            if let Ok(mut entity) = serde_json::from_value::<SketchEntity>(se.data.clone()) {
                // Assign new ID and apply offset
                remap_entity_id(&mut entity, new_id);
                offset_entity(&mut entity, offset.0, offset.1);
                let id = sketch.add_entity(entity);
                new_ids.push(id);
            }
        }

        // Paste constraints with remapped entity references
        for sc in &self.constraints {
            if let Ok(mut constraint) = serde_json::from_value::<SketchConstraint>(sc.data.clone()) {
                let new_constraint_id = Uuid::new_v4();
                remap_constraint(&mut constraint, new_constraint_id, &id_remap);
                sketch.add_constraint(constraint);
            }
        }

        new_ids
    }
}

/// Check if all entities referenced by a constraint are in the given set
fn constraint_entities_in_set(
    constraint: &SketchConstraint,
    set: &std::collections::HashSet<SketchEntityId>,
) -> bool {
    match constraint {
        SketchConstraint::Coincident { entity_a, entity_b, .. } => {
            set.contains(entity_a) && set.contains(entity_b)
        }
        SketchConstraint::PointOnCurve { point_entity, curve_entity, .. } => {
            set.contains(point_entity) && set.contains(curve_entity)
        }
        SketchConstraint::MiddlePoint { point_entity, line_entity, .. } => {
            set.contains(point_entity) && set.contains(line_entity)
        }
        SketchConstraint::Distance { entity_a, entity_b, .. } |
        SketchConstraint::HorizontalDistance { entity_a, entity_b, .. } |
        SketchConstraint::VerticalDistance { entity_a, entity_b, .. } => {
            set.contains(entity_a) && set.contains(entity_b)
        }
        SketchConstraint::Radius { entity, .. } |
        SketchConstraint::Fixed { entity, .. } |
        SketchConstraint::Horizontal { entity, .. } |
        SketchConstraint::Vertical { entity, .. } => {
            set.contains(entity)
        }
        SketchConstraint::Angle { line_a, line_b, .. } |
        SketchConstraint::Parallel { line_a, line_b, .. } |
        SketchConstraint::Perpendicular { line_a, line_b, .. } |
        SketchConstraint::Collinear { line_a, line_b, .. } => {
            set.contains(line_a) && set.contains(line_b)
        }
        SketchConstraint::Symmetric { entity_a, entity_b, mirror_line, .. } => {
            set.contains(entity_a) && set.contains(entity_b) && set.contains(mirror_line)
        }
        SketchConstraint::Equal { entity_a, entity_b, .. } |
        SketchConstraint::Tangent { entity_a, entity_b, .. } => {
            set.contains(entity_a) && set.contains(entity_b)
        }
        SketchConstraint::PointLineDistance { point_entity, line_entity, .. } => {
            set.contains(point_entity) && set.contains(line_entity)
        }
        SketchConstraint::Offset { source, target, .. } => {
            set.contains(source) && set.contains(target)
        }
    }
}

/// Remap the ID of an entity to a new UUID
fn remap_entity_id(entity: &mut SketchEntity, new_id: Uuid) {
    match entity {
        SketchEntity::Point { id, .. } | SketchEntity::Line { id, .. } |
        SketchEntity::Circle { id, .. } | SketchEntity::Arc { id, .. } |
        SketchEntity::Ellipse { id, .. } | SketchEntity::EllipticArc { id, .. } |
        SketchEntity::BSpline { id, .. } => *id = new_id,
    }
}

/// Apply a position offset to an entity (for paste at cursor)
fn offset_entity(entity: &mut SketchEntity, dx: f64, dy: f64) {
    match entity {
        SketchEntity::Point { position, .. } => {
            position.x += dx;
            position.y += dy;
        }
        SketchEntity::Line { start, end, .. } => {
            start.x += dx;
            start.y += dy;
            end.x += dx;
            end.y += dy;
        }
        SketchEntity::Circle { center, .. } |
        SketchEntity::Arc { center, .. } |
        SketchEntity::Ellipse { center, .. } |
        SketchEntity::EllipticArc { center, .. } => {
            center.x += dx;
            center.y += dy;
        }
        SketchEntity::BSpline { control_points, .. } => {
            for pt in control_points {
                pt.x += dx;
                pt.y += dy;
            }
        }
    }
}

/// Remap constraint references to new entity IDs (CAD_Sketcher fix_pointers)
fn remap_constraint(constraint: &mut SketchConstraint, new_id: Uuid, remap: &HashMap<String, Uuid>) {
    let remap_uuid = |id: &mut Uuid| {
        if let Some(new) = remap.get(&id.to_string()) {
            *id = *new;
        }
    };

    match constraint {
        SketchConstraint::Coincident { id, entity_a, entity_b, .. } => {
            *id = new_id;
            remap_uuid(entity_a);
            remap_uuid(entity_b);
        }
        SketchConstraint::PointOnCurve { id, point_entity, curve_entity, .. } => {
            *id = new_id;
            remap_uuid(point_entity);
            remap_uuid(curve_entity);
        }
        SketchConstraint::MiddlePoint { id, point_entity, line_entity, .. } => {
            *id = new_id;
            remap_uuid(point_entity);
            remap_uuid(line_entity);
        }
        SketchConstraint::Distance { id, entity_a, entity_b, .. } |
        SketchConstraint::HorizontalDistance { id, entity_a, entity_b, .. } |
        SketchConstraint::VerticalDistance { id, entity_a, entity_b, .. } => {
            *id = new_id;
            remap_uuid(entity_a);
            remap_uuid(entity_b);
        }
        SketchConstraint::Radius { id, entity, .. } |
        SketchConstraint::Fixed { id, entity, .. } |
        SketchConstraint::Horizontal { id, entity, .. } |
        SketchConstraint::Vertical { id, entity, .. } => {
            *id = new_id;
            remap_uuid(entity);
        }
        SketchConstraint::Angle { id, line_a, line_b, .. } |
        SketchConstraint::Parallel { id, line_a, line_b, .. } |
        SketchConstraint::Perpendicular { id, line_a, line_b, .. } |
        SketchConstraint::Collinear { id, line_a, line_b, .. } => {
            *id = new_id;
            remap_uuid(line_a);
            remap_uuid(line_b);
        }
        SketchConstraint::Symmetric { id, entity_a, entity_b, mirror_line, .. } => {
            *id = new_id;
            remap_uuid(entity_a);
            remap_uuid(entity_b);
            remap_uuid(mirror_line);
        }
        SketchConstraint::Equal { id, entity_a, entity_b, .. } |
        SketchConstraint::Tangent { id, entity_a, entity_b, .. } => {
            *id = new_id;
            remap_uuid(entity_a);
            remap_uuid(entity_b);
        }
        SketchConstraint::PointLineDistance { id, point_entity, line_entity, .. } => {
            *id = new_id;
            remap_uuid(point_entity);
            remap_uuid(line_entity);
        }
        SketchConstraint::Offset { id, source, target, .. } => {
            *id = new_id;
            remap_uuid(source);
            remap_uuid(target);
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sketch::Point2D;

    #[test]
    fn test_snapshot_round_trip() {
        let mut sketch = Sketch::new("Test");
        let l = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };
        sketch.add_entity(l);
        sketch.add_constraint(SketchConstraint::Horizontal {
            id: Uuid::new_v4(),
            entity: sketch.entity_order[0],
        });

        let snapshot = SketchSnapshot::from_sketch(&sketch);

        // Modify sketch
        sketch.entities.clear();
        sketch.entity_order.clear();
        sketch.constraints.clear();
        assert!(sketch.entities.is_empty());

        // Restore
        snapshot.restore_to_sketch(&mut sketch);
        assert_eq!(sketch.entities.len(), 1);
        assert_eq!(sketch.constraints.len(), 1);
    }

    #[test]
    fn test_snapshot_json_round_trip() {
        let mut sketch = Sketch::new("JSON Test");
        sketch.add_entity(SketchEntity::Circle {
            id: Uuid::new_v4(),
            center: Point2D::new(5.0, 5.0),
            radius: 3.0,
            is_construction: false,
        });

        let snapshot = SketchSnapshot::from_sketch(&sketch);
        let json = snapshot.to_json().unwrap();
        let restored = SketchSnapshot::from_json(&json).unwrap();

        assert_eq!(restored.entities.len(), 1);
        assert_eq!(restored.entities[0].entity_type, "Circle");
    }

    #[test]
    fn test_tool_snapshot_manager() {
        let mut mgr = ToolSnapshotManager::new(10);
        let mut sketch = Sketch::new("Snap");
        sketch.add_entity(SketchEntity::Point {
            id: Uuid::new_v4(),
            position: Point2D::new(1.0, 2.0),
            is_construction: false,
        });

        mgr.push_snapshot(&sketch);
        assert_eq!(mgr.depth(), 1);

        // Modify sketch
        sketch.entities.clear();
        sketch.entity_order.clear();

        // Restore
        assert!(mgr.pop_and_restore(&mut sketch));
        assert_eq!(sketch.entities.len(), 1);
        assert_eq!(mgr.depth(), 0);
    }

    #[test]
    fn test_clipboard_copy_paste() {
        let mut sketch = Sketch::new("CopyPaste");
        let l1 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };
        let l1_id = l1.id();
        let l2 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(10.0, 0.0),
            end: Point2D::new(10.0, 10.0),
            is_construction: false,
        };
        let l2_id = l2.id();
        sketch.add_entity(l1);
        sketch.add_entity(l2);

        // Add a constraint between them
        sketch.add_constraint(SketchConstraint::Perpendicular {
            id: Uuid::new_v4(),
            line_a: l1_id,
            line_b: l2_id,
        });

        // Copy both
        let buffer = ClipboardBuffer::from_selection(&sketch, &[l1_id, l2_id]);
        assert_eq!(buffer.entities.len(), 2);
        assert_eq!(buffer.constraints.len(), 1);

        // Paste with offset
        let new_ids = buffer.paste_into(&mut sketch, (20.0, 0.0));
        assert_eq!(new_ids.len(), 2);
        assert_eq!(sketch.entities.len(), 4);
        assert_eq!(sketch.constraints.len(), 2);

        // Verify offset
        let new_entity = sketch.entities.get(&new_ids[0]).unwrap();
        if let SketchEntity::Line { start, .. } = new_entity {
            assert!((start.x - 20.0).abs() < 1e-10);
        }
    }
}
