//! # Feature System — Salome SHAPER ModelAPI_Feature Pattern
//!
//! Every modeling operation is a **Feature** with a well-defined lifecycle:
//!
//! ```text
//! Feature
//!   ├── kind              → unique FeatureKind enum
//!   ├── attributes        → all input data (initAttributes pattern)
//!   ├── execute()         → computes results from attributes
//!   ├── collect_references() → dependency graph derivation
//!   ├── conceals()        → boolean concealment pattern
//!   └── status            → Pending / Valid / Error / Disabled
//! ```
//!
//! ## Result Types
//! - `FeatureResult::Body` — solid/shell from Extrude, Boolean, etc.
//! - `FeatureResult::Construction` — sketch/construction geometry
//! - `FeatureResult::Empty` — no geometry (e.g., Import)
//!
//! ## Concealment Pattern (Salome)
//! Boolean operations conceal consumed inputs — they disappear from the tree.

use std::collections::{HashMap, HashSet};
use std::fmt;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use shared_types::units::Parameter;

/// Unique feature identifier
pub type FeatureId = Uuid;

/// Feature reference — points to another feature's output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureRef {
    pub feature_id: FeatureId,
    /// Optional shape name within the feature's result (topological naming)
    pub shape_name: Option<String>,
}

// ─── Feature Status ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum FeatureStatus {
    Pending,
    Valid,
    Disabled,
    Error(String),
    Outdated,
}

// ─── Feature Result ───────────────────────────────────────────────────────────

/// Result of executing a feature — the output geometry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FeatureResult {
    Body(BodyResult),
    Construction(ConstructionResult),
    Empty,
}

/// Solid body result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyResult {
    pub vertices: Vec<[f64; 3]>,
    pub edges: Vec<(usize, usize)>,
    pub faces: Vec<Vec<usize>>,
    pub face_normals: Vec<[f64; 3]>,
    pub is_solid: bool,
    pub bounds: [f64; 6],
}

/// Construction geometry result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstructionResult {
    pub curves: Vec<ConstructionCurve>,
    pub plane: [f64; 6],
    pub is_closed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConstructionCurve {
    Line { start: [f64; 2], end: [f64; 2] },
    Arc { center: [f64; 2], radius: f64, start_angle: f64, end_angle: f64 },
    Circle { center: [f64; 2], radius: f64 },
    Spline { control_points: Vec<[f64; 2]>, weights: Vec<f64>, knots: Vec<f64>, degree: u32 },
}

// ─── Feature Kind ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FeatureKind {
    Sketch2D,
    Extrusion,
    ExtrusionCut,
    ExtrusionFuse,
    Revolution,
    RevolutionCut,
    RevolutionFuse,
    Boolean,
    Fillet,
    Chamfer,
    Shell,
    Pattern,
    Mirror,
    Pipe,
    Loft,
    SheetMetalBend,
    Import,
    DatumPlane,
    DatumAxis,
    DatumPoint,
}

impl fmt::Display for FeatureKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sketch2D => write!(f, "Sketch"),
            Self::Extrusion => write!(f, "Extrusion"),
            Self::ExtrusionCut => write!(f, "Extrusion Cut"),
            Self::ExtrusionFuse => write!(f, "Extrusion Fuse"),
            Self::Revolution => write!(f, "Revolution"),
            Self::RevolutionCut => write!(f, "Revolution Cut"),
            Self::RevolutionFuse => write!(f, "Revolution Fuse"),
            Self::Boolean => write!(f, "Boolean"),
            Self::Fillet => write!(f, "Fillet"),
            Self::Chamfer => write!(f, "Chamfer"),
            Self::Shell => write!(f, "Shell"),
            Self::Pattern => write!(f, "Pattern"),
            Self::Mirror => write!(f, "Mirror"),
            Self::Pipe => write!(f, "Pipe"),
            Self::Loft => write!(f, "Loft"),
            Self::SheetMetalBend => write!(f, "Sheet Metal Bend"),
            Self::Import => write!(f, "Import"),
            Self::DatumPlane => write!(f, "Datum Plane"),
            Self::DatumAxis => write!(f, "Datum Axis"),
            Self::DatumPoint => write!(f, "Datum Point"),
        }
    }
}

// ─── Attribute Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SketchPlane {
    XY { offset: f64 },
    XZ { offset: f64 },
    YZ { offset: f64 },
    Custom { origin: [f64; 3], normal: [f64; 3], x_dir: [f64; 3] },
    OnFace(FeatureRef),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExtrudeDirection {
    Blind { distance: Parameter },
    Symmetric { distance: Parameter },
    ToFace(FeatureRef),
    ThroughAll,
    TwoDirections { forward: Parameter, backward: Parameter },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Axis {
    X,
    Y,
    Z,
    Custom { origin: [f64; 3], direction: [f64; 3] },
    Edge(FeatureRef),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BooleanType {
    Union,
    Cut,
    Intersect,
    Partition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatternType {
    Linear { direction: [f64; 3], count: u32, spacing: Parameter },
    Circular { axis: Axis, count: u32, angle: Parameter },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChamferType {
    EqualDistance { distance: Parameter },
    TwoDistances { d1: Parameter, d2: Parameter },
    DistanceAngle { distance: Parameter, angle: Parameter },
}

// ─── Feature Attributes ───────────────────────────────────────────────────────

/// Feature-specific attribute data (Salome: initAttributes() declares these)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FeatureAttributes {
    Sketch2D {
        plane: SketchPlane,
        sketch_id: Uuid,
    },
    Extrusion {
        profile: FeatureRef,
        direction: ExtrudeDirection,
        draft_angle: Option<f64>,
    },
    ExtrusionCut {
        profile: FeatureRef,
        target: FeatureRef,
        direction: ExtrudeDirection,
        draft_angle: Option<f64>,
    },
    ExtrusionFuse {
        profile: FeatureRef,
        target: FeatureRef,
        direction: ExtrudeDirection,
        draft_angle: Option<f64>,
    },
    Revolution {
        profile: FeatureRef,
        axis: Axis,
        angle: Parameter,
    },
    RevolutionCut {
        profile: FeatureRef,
        target: FeatureRef,
        axis: Axis,
        angle: Parameter,
    },
    RevolutionFuse {
        profile: FeatureRef,
        target: FeatureRef,
        axis: Axis,
        angle: Parameter,
    },
    Boolean {
        operation: BooleanType,
        target: FeatureRef,
        tools: Vec<FeatureRef>,
    },
    Fillet {
        target: FeatureRef,
        edges: Vec<String>,
        radius: Parameter,
        variable_radii: Option<Vec<(String, Parameter)>>,
    },
    Chamfer {
        target: FeatureRef,
        edges: Vec<String>,
        chamfer_type: ChamferType,
    },
    Shell {
        target: FeatureRef,
        faces_to_remove: Vec<String>,
        thickness: Parameter,
        inward: bool,
    },
    Pattern {
        target: FeatureRef,
        pattern: PatternType,
    },
    Mirror {
        target: FeatureRef,
        plane: SketchPlane,
    },
    Pipe {
        profile: FeatureRef,
        path: FeatureRef,
        bi_normal: Option<[f64; 3]>,
    },
    Loft {
        profiles: Vec<FeatureRef>,
        is_solid: bool,
    },
    SheetMetalBend {
        target: FeatureRef,
        bend_face: String,
        angle: Parameter,
        radius: Parameter,
        k_factor: f64,
    },
    Import {
        format: String,
        file_path: String,
    },
    DatumPlane {
        plane: SketchPlane,
    },
    DatumAxis {
        axis: Axis,
    },
    DatumPoint {
        position: [f64; 3],
    },
}

// ─── Feature ──────────────────────────────────────────────────────────────────

/// A parametric modeling feature — the fundamental unit of the feature tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: FeatureId,
    pub kind: FeatureKind,
    pub name: String,
    pub attributes: FeatureAttributes,
    pub status: FeatureStatus,
    pub is_macro: bool,
    pub preview_needed: bool,
}

impl Feature {
    pub fn new(kind: FeatureKind, name: impl Into<String>, attributes: FeatureAttributes) -> Self {
        Self {
            id: Uuid::new_v4(),
            kind,
            name: name.into(),
            attributes,
            status: FeatureStatus::Pending,
            is_macro: matches!(kind, FeatureKind::Import),
            preview_needed: true,
        }
    }

    /// Collect all feature IDs this feature references (for dependency graph).
    /// Salome: `referencesToObjects()` where `isArgument() == true`
    pub fn collect_references(&self) -> HashSet<FeatureId> {
        let mut refs = HashSet::new();
        match &self.attributes {
            FeatureAttributes::Sketch2D { plane, .. } => {
                if let SketchPlane::OnFace(r) = plane { refs.insert(r.feature_id); }
            }
            FeatureAttributes::Extrusion { profile, direction, .. } => {
                refs.insert(profile.feature_id);
                if let ExtrudeDirection::ToFace(r) = direction { refs.insert(r.feature_id); }
            }
            FeatureAttributes::ExtrusionCut { profile, target, direction, .. } => {
                refs.insert(profile.feature_id);
                refs.insert(target.feature_id);
                if let ExtrudeDirection::ToFace(r) = direction { refs.insert(r.feature_id); }
            }
            FeatureAttributes::ExtrusionFuse { profile, target, direction, .. } => {
                refs.insert(profile.feature_id);
                refs.insert(target.feature_id);
                if let ExtrudeDirection::ToFace(r) = direction { refs.insert(r.feature_id); }
            }
            FeatureAttributes::Revolution { profile, axis, .. } => {
                refs.insert(profile.feature_id);
                if let Axis::Edge(r) = axis { refs.insert(r.feature_id); }
            }
            FeatureAttributes::RevolutionCut { profile, target, axis, .. } => {
                refs.insert(profile.feature_id);
                refs.insert(target.feature_id);
                if let Axis::Edge(r) = axis { refs.insert(r.feature_id); }
            }
            FeatureAttributes::RevolutionFuse { profile, target, axis, .. } => {
                refs.insert(profile.feature_id);
                refs.insert(target.feature_id);
                if let Axis::Edge(r) = axis { refs.insert(r.feature_id); }
            }
            FeatureAttributes::Boolean { target, tools, .. } => {
                refs.insert(target.feature_id);
                for t in tools { refs.insert(t.feature_id); }
            }
            FeatureAttributes::Fillet { target, .. } |
            FeatureAttributes::Chamfer { target, .. } |
            FeatureAttributes::Shell { target, .. } |
            FeatureAttributes::SheetMetalBend { target, .. } => {
                refs.insert(target.feature_id);
            }
            FeatureAttributes::Pattern { target, pattern } => {
                refs.insert(target.feature_id);
                if let PatternType::Circular { axis: Axis::Edge(r), .. } = pattern {
                    refs.insert(r.feature_id);
                }
            }
            FeatureAttributes::Mirror { target, plane } => {
                refs.insert(target.feature_id);
                if let SketchPlane::OnFace(r) = plane { refs.insert(r.feature_id); }
            }
            FeatureAttributes::Pipe { profile, path, .. } => {
                refs.insert(profile.feature_id);
                refs.insert(path.feature_id);
            }
            FeatureAttributes::Loft { profiles, .. } => {
                for p in profiles { refs.insert(p.feature_id); }
            }
            FeatureAttributes::Import { .. } |
            FeatureAttributes::DatumPoint { .. } => {}
            FeatureAttributes::DatumPlane { plane } => {
                if let SketchPlane::OnFace(r) = plane { refs.insert(r.feature_id); }
            }
            FeatureAttributes::DatumAxis { axis } => {
                if let Axis::Edge(r) = axis { refs.insert(r.feature_id); }
            }
        }
        refs
    }

    /// Execute the feature — compute results from attributes
    pub fn execute(
        &self,
        _features: &HashMap<FeatureId, Feature>,
        results: &HashMap<FeatureId, FeatureResult>,
    ) -> Result<FeatureResult, FeatureError> {
        crate::operations::execute_feature(self, results)
    }

    /// Check if this feature conceals (hides) another feature (Salome concealment pattern)
    pub fn conceals(&self, other_id: &FeatureId) -> bool {
        match &self.attributes {
            FeatureAttributes::Boolean { tools, .. } => {
                tools.iter().any(|t| &t.feature_id == other_id)
            }
            FeatureAttributes::ExtrusionCut { target, .. } |
            FeatureAttributes::ExtrusionFuse { target, .. } |
            FeatureAttributes::RevolutionCut { target, .. } |
            FeatureAttributes::RevolutionFuse { target, .. } => {
                &target.feature_id == other_id
            }
            _ => false,
        }
    }
}

// ─── Feature Tree ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FeatureTree {
    features: Vec<Feature>,
    current_index: usize,
}

impl FeatureTree {
    pub fn new() -> Self { Self::default() }
    pub fn push(&mut self, feature: Feature) {
        self.features.truncate(self.current_index);
        self.features.push(feature);
        self.current_index = self.features.len();
    }
    pub fn features(&self) -> &[Feature] { &self.features }
    pub fn active_features(&self) -> &[Feature] { &self.features[..self.current_index] }
    pub fn rollback_to(&mut self, index: usize) { self.current_index = index.min(self.features.len()); }
    pub fn current_index(&self) -> usize { self.current_index }
    pub fn len(&self) -> usize { self.features.len() }
    pub fn is_empty(&self) -> bool { self.features.is_empty() }
    pub fn get(&self, id: FeatureId) -> Option<&Feature> { self.features.iter().find(|f| f.id == id) }
    pub fn get_mut(&mut self, id: FeatureId) -> Option<&mut Feature> { self.features.iter_mut().find(|f| f.id == id) }
}

// ─── Feature Error ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, thiserror::Error)]
pub enum FeatureError {
    #[error("Missing reference: feature {0} not found")]
    MissingReference(FeatureId),
    #[error("Invalid attribute: {0}")]
    InvalidAttribute(String),
    #[error("Geometry computation failed: {0}")]
    GeometryError(String),
    #[error("Boolean operation failed: {0}")]
    BooleanError(String),
    #[error("Sketch not solved: {0}")]
    SketchNotSolved(String),
    #[error("Topological naming error: shape '{0}' not found")]
    NamingError(String),
    #[error("Validation failed: {0}")]
    ValidationError(String),
    #[error("Cycle detected in feature dependencies")]
    CycleDetected,
    #[error("Not implemented: {0}")]
    NotImplemented(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feature_creation() {
        let feature = Feature::new(
            FeatureKind::Sketch2D,
            "Sketch 1",
            FeatureAttributes::Sketch2D {
                plane: SketchPlane::XY { offset: 0.0 },
                sketch_id: Uuid::new_v4(),
            },
        );
        assert_eq!(feature.kind, FeatureKind::Sketch2D);
        assert_eq!(feature.status, FeatureStatus::Pending);
    }

    #[test]
    fn test_collect_references() {
        let sketch_id = Uuid::new_v4();
        let f = Feature::new(
            FeatureKind::Extrusion,
            "Extrude 1",
            FeatureAttributes::Extrusion {
                profile: FeatureRef { feature_id: sketch_id, shape_name: None },
                direction: ExtrudeDirection::Blind { distance: Parameter::Value(10.0) },
                draft_angle: None,
            },
        );
        let refs = f.collect_references();
        assert!(refs.contains(&sketch_id));
        assert_eq!(refs.len(), 1);
    }

    #[test]
    fn test_concealment() {
        let tool_id = Uuid::new_v4();
        let f = Feature::new(
            FeatureKind::Boolean,
            "Cut",
            FeatureAttributes::Boolean {
                operation: BooleanType::Cut,
                target: FeatureRef { feature_id: Uuid::new_v4(), shape_name: None },
                tools: vec![FeatureRef { feature_id: tool_id, shape_name: None }],
            },
        );
        assert!(f.conceals(&tool_id));
    }
}
