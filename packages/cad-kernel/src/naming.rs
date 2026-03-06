//! # Topological Naming Service — Salome SHAPER Selector Pattern
//!
//! When a parametric model recomputes, topology changes (faces/edges/vertices
//! get new internal IDs). The naming service tracks which sub-shape was selected
//! across recomputations using a **cascading algorithm**:
//!
//! | Priority | Type | Strategy |
//! |----------|------|----------|
//! | 1 | Primitive | Direct reference to generating feature |
//! | 2 | Modify | Track through shape evolution history |
//! | 3 | FilterByNeighbors | Identify by adjacent shapes |
//! | 4 | Intersect | Intersection of higher-dim shapes |
//! | 5 | WeakName | Fallback: geometrical index |
//!
//! ## Architecture
//! - `ShapeName` — a persistent identifier for a topological entity
//! - `ShapeEvolution` — tracks how shapes change across feature executions
//! - `TopologicalNamingService` — resolves names to current shapes

use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};


use crate::features::{FeatureId, FeatureResult};

// ─── Shape References ─────────────────────────────────────────────────────────

/// Unique identifier for a topological shape (face, edge, or vertex)
pub type ShapeId = u64;

/// Type of topological entity
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ShapeType {
    Vertex,
    Edge,
    Face,
    Shell,
    Solid,
}

/// Evolution type — how a shape was created or modified
/// (From OCCT TNaming: PRIMITIVE, GENERATED, MODIFY, DELETE, SELECTED)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EvolutionType {
    /// Shape was directly created by a feature (e.g., extrude creates faces)
    Primitive,
    /// Shape was generated from another shape (e.g., fillet generates face from edge)
    Generated,
    /// Shape was modified (e.g., boolean modifies face geometry)
    Modify,
    /// Shape was deleted
    Delete,
    /// Shape was explicitly selected by user
    Selected,
}

/// A persistent name for a topological entity that survives recomputation.
/// This is the core of the naming service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeName {
    /// The naming algorithm used (cascading priority)
    pub algorithm: NamingAlgorithm,
    /// Human-readable name string
    pub name: String,
    /// The shape type this name refers to
    pub shape_type: ShapeType,
}

/// Naming algorithm types — tried in cascading priority order
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NamingAlgorithm {
    /// Priority 1: Direct reference to the generating feature
    /// Format: "FeatureName/ShapeIndex"
    Primitive {
        feature_id: FeatureId,
        shape_index: u32,
    },
    /// Priority 2: Track through shape evolution history
    /// Format: "Name1&Name2" (intersection of modified shapes)
    Modify {
        /// The original shape names that were modified
        source_names: Vec<String>,
    },
    /// Priority 3: Identify by adjacent/neighbor shapes
    /// Format: "(Neighbor1)(Neighbor2)..."
    FilterByNeighbors {
        /// Names of neighboring shapes used for identification
        neighbor_names: Vec<String>,
        /// Number of common neighbors required for unique ID
        neighbor_count: u32,
        /// Shape type of the target
        target_type: ShapeType,
    },
    /// Priority 4: Intersection of higher-dimensional shapes
    /// Format: "[Face1][Face2]v" (for vertex as intersection of faces)
    Intersect {
        /// Names of shapes whose intersection identifies this shape
        shape_names: Vec<String>,
        /// Result shape type
        result_type: ShapeType,
    },
    /// Priority 5: Fallback geometrical index
    /// Format: "_weak_name_N"
    WeakName {
        /// The feature that contains this shape
        feature_id: FeatureId,
        /// Index within the feature's output shapes of this type
        index: u32,
        /// Geometric center for fuzzy matching
        center: [f64; 3],
        /// Geometric tolerance for matching
        tolerance: f64,
    },
}

impl fmt::Display for ShapeName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name)
    }
}

// ─── Shape Evolution ──────────────────────────────────────────────────────────

/// A single evolution record: tracks how one shape changed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShapeEvolutionRecord {
    /// The feature that caused this evolution
    pub feature_id: FeatureId,
    /// Evolution type
    pub evolution: EvolutionType,
    /// Old shape ID (None for Primitive)
    pub old_shape: Option<ShapeId>,
    /// New shape ID (None for Delete)
    pub new_shape: Option<ShapeId>,
    /// Shape type
    pub shape_type: ShapeType,
}

/// Complete evolution history for a shape
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShapeHistory {
    /// Ordered list of evolution records
    pub records: Vec<ShapeEvolutionRecord>,
}

impl ShapeHistory {
    /// Get the most recent shape ID (following the evolution chain)
    /// Returns None if the shape was deleted
    pub fn current_shape(&self) -> Option<ShapeId> {
        // If the last record is a deletion, the shape no longer exists
        if self.is_deleted() {
            return None;
        }
        self.records
            .iter()
            .rev()
            .find(|r| r.new_shape.is_some())
            .and_then(|r| r.new_shape)
    }

    /// Check if this shape was deleted
    pub fn is_deleted(&self) -> bool {
        self.records
            .last()
            .map(|r| r.evolution == EvolutionType::Delete)
            .unwrap_or(false)
    }
}

// ─── Naming Service ───────────────────────────────────────────────────────────

/// Adjacency information for neighbor-based naming
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AdjacencyMap {
    /// Face → set of adjacent faces
    pub face_adjacency: HashMap<ShapeId, Vec<ShapeId>>,
    /// Edge → set of adjacent faces
    pub edge_faces: HashMap<ShapeId, Vec<ShapeId>>,
    /// Vertex → set of adjacent edges
    pub vertex_edges: HashMap<ShapeId, Vec<ShapeId>>,
}

/// The topological naming service.
///
/// Tracks shape evolution across feature recomputations and provides
/// persistent naming using the cascading algorithm pattern from Salome SHAPER.
pub struct TopologicalNamingService {
    /// Named shapes: persistent name → current shape ID
    named_shapes: HashMap<String, ShapeId>,
    /// Evolution history per named shape
    evolution: HashMap<String, ShapeHistory>,
    /// Shape to name reverse mapping
    shape_to_name: HashMap<ShapeId, String>,
    /// Adjacency information for the current state
    adjacency: AdjacencyMap,
    /// Per-feature output shape registry
    feature_shapes: HashMap<FeatureId, Vec<(ShapeId, ShapeType, ShapeName)>>,
    /// Next shape ID counter
    next_shape_id: ShapeId,
    /// Geometric centers for weak naming fallback
    shape_centers: HashMap<ShapeId, [f64; 3]>,
}

impl TopologicalNamingService {
    pub fn new() -> Self {
        Self {
            named_shapes: HashMap::new(),
            evolution: HashMap::new(),
            shape_to_name: HashMap::new(),
            adjacency: AdjacencyMap::default(),
            feature_shapes: HashMap::new(),
            next_shape_id: 1,
            shape_centers: HashMap::new(),
        }
    }

    /// Allocate a new unique shape ID
    pub fn allocate_shape_id(&mut self) -> ShapeId {
        let id = self.next_shape_id;
        self.next_shape_id += 1;
        id
    }

    /// Register a primitive shape (directly created by a feature)
    pub fn register_primitive(
        &mut self,
        feature_id: FeatureId,
        shape_id: ShapeId,
        shape_type: ShapeType,
        shape_index: u32,
        center: [f64; 3],
    ) -> String {
        let name = format!("{}_{}{}", feature_id, shape_type_prefix(shape_type), shape_index);
        let shape_name = ShapeName {
            algorithm: NamingAlgorithm::Primitive {
                feature_id,
                shape_index,
            },
            name: name.clone(),
            shape_type,
        };

        self.named_shapes.insert(name.clone(), shape_id);
        self.shape_to_name.insert(shape_id, name.clone());
        self.shape_centers.insert(shape_id, center);

        // Record evolution
        self.evolution.entry(name.clone()).or_default().records.push(
            ShapeEvolutionRecord {
                feature_id,
                evolution: EvolutionType::Primitive,
                old_shape: None,
                new_shape: Some(shape_id),
                shape_type,
            },
        );

        // Register in feature shapes
        self.feature_shapes
            .entry(feature_id)
            .or_default()
            .push((shape_id, shape_type, shape_name));

        name
    }

    /// Record a shape modification (shape was modified by a feature)
    pub fn record_modification(
        &mut self,
        feature_id: FeatureId,
        old_shape_id: ShapeId,
        new_shape_id: ShapeId,
        shape_type: ShapeType,
        center: [f64; 3],
    ) {
        // Find the name of the old shape
        if let Some(name) = self.shape_to_name.get(&old_shape_id).cloned() {
            // Update mappings
            self.named_shapes.insert(name.clone(), new_shape_id);
            self.shape_to_name.remove(&old_shape_id);
            self.shape_to_name.insert(new_shape_id, name.clone());
            self.shape_centers.insert(new_shape_id, center);

            // Record evolution
            self.evolution.entry(name).or_default().records.push(
                ShapeEvolutionRecord {
                    feature_id,
                    evolution: EvolutionType::Modify,
                    old_shape: Some(old_shape_id),
                    new_shape: Some(new_shape_id),
                    shape_type,
                },
            );
        }
    }

    /// Record that a shape was generated from another shape
    pub fn record_generation(
        &mut self,
        feature_id: FeatureId,
        source_shape_id: ShapeId,
        new_shape_id: ShapeId,
        new_shape_type: ShapeType,
        shape_index: u32,
        center: [f64; 3],
    ) -> String {
        let source_name = self
            .shape_to_name
            .get(&source_shape_id)
            .cloned()
            .unwrap_or_else(|| format!("unknown_{}", source_shape_id));

        let name = format!(
            "{}&{}_{}{}",
            source_name,
            feature_id,
            shape_type_prefix(new_shape_type),
            shape_index
        );

        self.named_shapes.insert(name.clone(), new_shape_id);
        self.shape_to_name.insert(new_shape_id, name.clone());
        self.shape_centers.insert(new_shape_id, center);

        self.evolution.entry(name.clone()).or_default().records.push(
            ShapeEvolutionRecord {
                feature_id,
                evolution: EvolutionType::Generated,
                old_shape: Some(source_shape_id),
                new_shape: Some(new_shape_id),
                shape_type: new_shape_type,
            },
        );

        let shape_name = ShapeName {
            algorithm: NamingAlgorithm::Modify {
                source_names: vec![source_name],
            },
            name: name.clone(),
            shape_type: new_shape_type,
        };

        self.feature_shapes
            .entry(feature_id)
            .or_default()
            .push((new_shape_id, new_shape_type, shape_name));

        name
    }

    /// Record shape deletion
    pub fn record_deletion(&mut self, feature_id: FeatureId, shape_id: ShapeId, shape_type: ShapeType) {
        if let Some(name) = self.shape_to_name.get(&shape_id).cloned() {
            self.named_shapes.remove(&name);
            self.shape_to_name.remove(&shape_id);

            self.evolution.entry(name).or_default().records.push(
                ShapeEvolutionRecord {
                    feature_id,
                    evolution: EvolutionType::Delete,
                    old_shape: Some(shape_id),
                    new_shape: None,
                    shape_type,
                },
            );
        }
    }

    /// Resolve a shape name to a current shape ID using the cascading algorithm
    ///
    /// Tries in order:
    /// 1. Direct name lookup (Primitive/Modify)
    /// 2. Evolution history tracking
    /// 3. Neighbor-based resolution
    /// 4. Geometric proximity (WeakName)
    pub fn resolve(&self, name: &str) -> Option<ShapeId> {
        // Priority 1+2: Direct lookup (handles Primitive and Modify)
        if let Some(&shape_id) = self.named_shapes.get(name) {
            return Some(shape_id);
        }

        // Priority 2: Follow evolution history
        if let Some(history) = self.evolution.get(name) {
            if let Some(current) = history.current_shape() {
                return Some(current);
            }
        }

        // Priority 3: FilterByNeighbors — not implemented in simple resolver
        // Would need current adjacency info to find by neighbor pattern

        // Priority 4: Intersect — not implemented in simple resolver

        // Priority 5: WeakName — try to find by geometric proximity
        // Parse weak name format: "_weak_name_<feature>_<index>"
        // Not applicable for string-based lookup

        None
    }

    /// Resolve a shape name with geometric fallback
    pub fn resolve_with_fallback(
        &self,
        name: &str,
        target_center: [f64; 3],
        tolerance: f64,
        shape_type: ShapeType,
    ) -> Option<ShapeId> {
        // Try standard resolve first
        if let Some(id) = self.resolve(name) {
            return Some(id);
        }

        // Geometric proximity fallback (WeakName)
        let mut best_id = None;
        let mut best_dist = f64::MAX;

        for (&shape_id, &center) in &self.shape_centers {
            // Check if this shape has the right type
            if let Some(_shape_name) = self.shape_to_name.get(&shape_id) {
                let correct_type = self
                    .feature_shapes
                    .values()
                    .flat_map(|v| v.iter())
                    .any(|(sid, st, _)| *sid == shape_id && *st == shape_type);

                if !correct_type {
                    continue;
                }
            }

            let dist = distance_3d(center, target_center);
            if dist < tolerance && dist < best_dist {
                best_dist = dist;
                best_id = Some(shape_id);
            }
        }

        best_id
    }

    /// Update adjacency information for the current state
    pub fn update_adjacency(&mut self, adjacency: AdjacencyMap) {
        self.adjacency = adjacency;
    }

    /// Get the name of a shape by its ID
    pub fn get_name(&self, shape_id: ShapeId) -> Option<&str> {
        self.shape_to_name.get(&shape_id).map(|s| s.as_str())
    }

    /// Get all shapes produced by a feature
    pub fn get_feature_shapes(&self, feature_id: FeatureId) -> &[(ShapeId, ShapeType, ShapeName)] {
        self.feature_shapes
            .get(&feature_id)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    /// Track result shapes after a feature execution
    /// Called by the recomputation engine after each feature executes
    pub fn track_feature_result(
        &mut self,
        _feature_id: FeatureId,
        _results: &HashMap<FeatureId, FeatureResult>,
    ) {
        // Integration point: when the actual geometry engine runs,
        // this method will extract faces/edges/vertices from the result
        // and register them with the naming service.
        //
        // For now this is a no-op — actual tracking happens when
        // operations.rs calls register_primitive/record_modification
        // during feature execution.
    }

    /// Remove all shapes associated with a feature
    pub fn remove_feature_shapes(&mut self, feature_id: FeatureId) {
        if let Some(shapes) = self.feature_shapes.remove(&feature_id) {
            for (shape_id, shape_type, _) in shapes {
                self.record_deletion(feature_id, shape_id, shape_type);
            }
        }
    }

    /// Get statistics about the naming service state
    pub fn stats(&self) -> NamingStats {
        NamingStats {
            named_shapes: self.named_shapes.len(),
            evolution_entries: self.evolution.len(),
            feature_count: self.feature_shapes.len(),
            total_shapes: self.shape_to_name.len(),
        }
    }
}

impl Default for TopologicalNamingService {
    fn default() -> Self {
        Self::new()
    }
}

/// Statistics about the naming service
#[derive(Debug, Clone)]
pub struct NamingStats {
    pub named_shapes: usize,
    pub evolution_entries: usize,
    pub feature_count: usize,
    pub total_shapes: usize,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn shape_type_prefix(shape_type: ShapeType) -> &'static str {
    match shape_type {
        ShapeType::Vertex => "v",
        ShapeType::Edge => "e",
        ShapeType::Face => "f",
        ShapeType::Shell => "s",
        ShapeType::Solid => "d",
    }
}

fn distance_3d(a: [f64; 3], b: [f64; 3]) -> f64 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    (dx * dx + dy * dy + dz * dz).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_primitive_naming() {
        let mut svc = TopologicalNamingService::new();
        let fid = Uuid::new_v4();
        let sid = svc.allocate_shape_id();

        let name = svc.register_primitive(fid, sid, ShapeType::Face, 0, [0.0, 0.0, 0.0]);
        assert!(name.contains("f0"));
        assert_eq!(svc.resolve(&name), Some(sid));
    }

    #[test]
    fn test_modification_tracking() {
        let mut svc = TopologicalNamingService::new();
        let fid1 = Uuid::new_v4();
        let fid2 = Uuid::new_v4();
        let sid1 = svc.allocate_shape_id();
        let sid2 = svc.allocate_shape_id();

        let name = svc.register_primitive(fid1, sid1, ShapeType::Face, 0, [0.0, 0.0, 0.0]);
        svc.record_modification(fid2, sid1, sid2, ShapeType::Face, [0.0, 0.0, 1.0]);

        // Name should now resolve to the new shape
        assert_eq!(svc.resolve(&name), Some(sid2));
    }

    #[test]
    fn test_deletion() {
        let mut svc = TopologicalNamingService::new();
        let fid1 = Uuid::new_v4();
        let fid2 = Uuid::new_v4();
        let sid = svc.allocate_shape_id();

        let name = svc.register_primitive(fid1, sid, ShapeType::Face, 0, [0.0, 0.0, 0.0]);
        svc.record_deletion(fid2, sid, ShapeType::Face);

        // Name should not resolve anymore
        assert_eq!(svc.resolve(&name), None);
    }

    #[test]
    fn test_generation_tracking() {
        let mut svc = TopologicalNamingService::new();
        let fid1 = Uuid::new_v4();
        let fid2 = Uuid::new_v4();
        let sid1 = svc.allocate_shape_id();
        let sid2 = svc.allocate_shape_id();

        let _name1 = svc.register_primitive(fid1, sid1, ShapeType::Edge, 0, [0.0, 0.0, 0.0]);
        let name2 = svc.record_generation(fid2, sid1, sid2, ShapeType::Face, 0, [0.0, 0.0, 0.5]);

        assert!(name2.contains("&"));
        assert_eq!(svc.resolve(&name2), Some(sid2));
    }

    #[test]
    fn test_weak_name_fallback() {
        let mut svc = TopologicalNamingService::new();
        let fid = Uuid::new_v4();
        let sid = svc.allocate_shape_id();

        svc.register_primitive(fid, sid, ShapeType::Face, 0, [1.0, 2.0, 3.0]);

        // Try resolving a non-existent name with geometric fallback
        let result = svc.resolve_with_fallback(
            "nonexistent",
            [1.0, 2.0, 3.01], // very close
            0.1,
            ShapeType::Face,
        );
        assert_eq!(result, Some(sid));
    }
}
