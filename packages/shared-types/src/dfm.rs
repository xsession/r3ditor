//! DFM (Design for Manufacturability) finding types.

use serde::{Deserialize, Serialize};

/// Severity of a DFM finding
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DfmSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

/// Category of DFM finding
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DfmCategory {
    WallThickness,
    DraftAngle,
    Undercut,
    SharpCorner,
    ThinFeature,
    HoleSize,
    HoleSpacing,
    BendRelief,
    BendRadius,
    BendProximity,
    GrainDirection,
    NestingEfficiency,
    MaterialWaste,
    ToolAccess,
    SurfaceFinish,
    Tolerance,
    ThreadDepth,
    PartOrientation,
}

/// A single DFM finding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DfmFinding {
    pub id: uuid::Uuid,
    pub category: DfmCategory,
    pub severity: DfmSeverity,
    pub title: String,
    pub description: String,
    pub recommendation: String,
    /// Affected geometry (face/edge references)
    pub affected_faces: Vec<u64>,
    pub affected_edges: Vec<u64>,
    /// Measured value vs required range
    pub measured_value: Option<f64>,
    pub min_allowed: Option<f64>,
    pub max_allowed: Option<f64>,
    pub unit: String,
}

/// DFM analysis result for a part
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DfmReport {
    pub findings: Vec<DfmFinding>,
    pub score: f64, // 0.0 - 100.0 (higher = more manufacturable)
    pub pass: bool,
    pub analysis_time_ms: u64,
}
