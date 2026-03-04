//! Parametric feature tree — history-based modeling.
//!
//! Each feature records the operation + parameters needed to
//! reconstruct the model deterministically.

use serde::{Deserialize, Serialize};
use shared_types::geometry::{EdgeRef, FaceRef};
use shared_types::units::Parameter;
use uuid::Uuid;

/// Reference to a previous feature in the tree
pub type FeatureRef = Uuid;

/// A parametric feature in the history tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Feature {
    /// 2D sketch on a plane or face
    Sketch2D {
        id: Uuid,
        plane: SketchPlane,
        profile: SketchProfile,
    },

    /// Extrude a 2D profile into 3D
    Extrude {
        id: Uuid,
        profile_ref: FeatureRef,
        distance: Parameter,
        direction: ExtrudeDirection,
        draft_angle: Option<f64>,
        symmetric: bool,
    },

    /// Revolve a 2D profile around an axis
    Revolve {
        id: Uuid,
        profile_ref: FeatureRef,
        axis: Axis,
        angle: Parameter,
    },

    /// Fillet (round) edges
    Fillet {
        id: Uuid,
        edges: Vec<EdgeRef>,
        radius: Parameter,
    },

    /// Chamfer edges
    Chamfer {
        id: Uuid,
        edges: Vec<EdgeRef>,
        distance: Parameter,
    },

    /// Boolean operation between two bodies
    BooleanOp {
        id: Uuid,
        op: BooleanType,
        tool_ref: FeatureRef,
        target_ref: FeatureRef,
    },

    /// Shell (hollow out a solid)
    Shell {
        id: Uuid,
        faces_to_remove: Vec<FaceRef>,
        thickness: Parameter,
    },

    /// Pattern (linear or circular array)
    Pattern {
        id: Uuid,
        feature_ref: FeatureRef,
        pattern_type: PatternType,
        count: Parameter,
        spacing: Parameter,
    },

    /// Mirror about a plane
    Mirror {
        id: Uuid,
        feature_ref: FeatureRef,
        plane: SketchPlane,
    },

    /// Sheet metal bend
    SheetMetalBend {
        id: Uuid,
        face: FaceRef,
        bend_angle: Parameter,
        bend_radius: Parameter,
        k_factor: f64,
    },

    /// Import from file
    Import {
        id: Uuid,
        format: shared_types::geometry::FileFormat,
        filename: String,
    },
}

impl Feature {
    /// Get the unique ID of this feature
    pub fn id(&self) -> Uuid {
        match self {
            Feature::Sketch2D { id, .. }
            | Feature::Extrude { id, .. }
            | Feature::Revolve { id, .. }
            | Feature::Fillet { id, .. }
            | Feature::Chamfer { id, .. }
            | Feature::BooleanOp { id, .. }
            | Feature::Shell { id, .. }
            | Feature::Pattern { id, .. }
            | Feature::Mirror { id, .. }
            | Feature::SheetMetalBend { id, .. }
            | Feature::Import { id, .. } => *id,
        }
    }

    /// Get a human-readable name for this feature type
    pub fn type_name(&self) -> &str {
        match self {
            Feature::Sketch2D { .. } => "Sketch",
            Feature::Extrude { .. } => "Extrude",
            Feature::Revolve { .. } => "Revolve",
            Feature::Fillet { .. } => "Fillet",
            Feature::Chamfer { .. } => "Chamfer",
            Feature::BooleanOp { .. } => "Boolean",
            Feature::Shell { .. } => "Shell",
            Feature::Pattern { .. } => "Pattern",
            Feature::Mirror { .. } => "Mirror",
            Feature::SheetMetalBend { .. } => "Bend",
            Feature::Import { .. } => "Import",
        }
    }
}

/// The feature tree: an ordered list of features that build up the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureTree {
    pub features: Vec<Feature>,
    /// Index of the "current" feature (for rollback)
    pub current_index: usize,
}

impl FeatureTree {
    pub fn new() -> Self {
        Self {
            features: Vec::new(),
            current_index: 0,
        }
    }

    /// Add a feature to the end of the tree
    pub fn push(&mut self, feature: Feature) {
        // Remove any features after current_index (they were "undone")
        self.features.truncate(self.current_index);
        self.features.push(feature);
        self.current_index = self.features.len();
    }

    /// Roll back to a specific feature index
    pub fn rollback_to(&mut self, index: usize) {
        self.current_index = index.min(self.features.len());
    }

    /// Get the active features (up to current_index)
    pub fn active_features(&self) -> &[Feature] {
        &self.features[..self.current_index]
    }

    /// Check if we can undo
    pub fn can_undo(&self) -> bool {
        self.current_index > 0
    }

    /// Check if we can redo
    pub fn can_redo(&self) -> bool {
        self.current_index < self.features.len()
    }
}

impl Default for FeatureTree {
    fn default() -> Self {
        Self::new()
    }
}

/// Sketch plane definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SketchPlane {
    XY,
    XZ,
    YZ,
    /// Plane defined by a point and normal
    Custom { origin: [f64; 3], normal: [f64; 3] },
    /// On a face of the model
    OnFace(FaceRef),
}

/// A 2D sketch profile (closed wire)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchProfile {
    pub curves: Vec<SketchCurve>,
    pub closed: bool,
}

/// A 2D sketch curve segment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SketchCurve {
    Line { start: [f64; 2], end: [f64; 2] },
    Arc { center: [f64; 2], radius: f64, start_angle: f64, end_angle: f64 },
    Circle { center: [f64; 2], radius: f64 },
    Spline { control_points: Vec<[f64; 2]>, degree: u32 },
}

/// Extrude direction
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ExtrudeDirection {
    /// Extrude by a fixed distance
    Blind,
    /// Extrude symmetrically both directions
    Symmetric,
    /// Extrude until hitting a face
    ToFace(FaceRef),
    /// Extrude through the entire model
    ThroughAll,
}

/// Axis for revolve operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Axis {
    X,
    Y,
    Z,
    Custom { origin: [f64; 3], direction: [f64; 3] },
}

/// Boolean operation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BooleanType {
    Union,
    Cut,
    Intersect,
}

/// Pattern type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatternType {
    Linear { direction: [f64; 3] },
    Circular { axis: Axis },
    Mirror { plane: SketchPlane },
}
