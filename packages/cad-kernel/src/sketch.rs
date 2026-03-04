//! 2D Sketch entity with constraint support.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::features::{SketchCurve, SketchPlane, SketchProfile};

/// A 2D sketch that lives on a plane or face
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sketch {
    pub id: Uuid,
    pub name: String,
    pub plane: SketchPlane,
    pub curves: Vec<SketchCurve>,
    pub constraints: Vec<SketchConstraint>,
    pub dimensions: Vec<SketchDimension>,
    pub solved: bool,
}

/// Constraint types for 2D sketch solving
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SketchConstraint {
    /// Two points are at the same location
    Coincident { point_a: PointRef, point_b: PointRef },
    /// A line is horizontal
    Horizontal { line: CurveRef },
    /// A line is vertical
    Vertical { line: CurveRef },
    /// Two lines are parallel
    Parallel { line_a: CurveRef, line_b: CurveRef },
    /// Two lines are perpendicular
    Perpendicular { line_a: CurveRef, line_b: CurveRef },
    /// A line is tangent to an arc
    Tangent { curve_a: CurveRef, curve_b: CurveRef },
    /// Two segments have equal length (or two arcs have equal radius)
    Equal { curve_a: CurveRef, curve_b: CurveRef },
    /// Two elements are symmetric about a line
    Symmetric { elem_a: CurveRef, elem_b: CurveRef, axis: CurveRef },
    /// A point is fixed in place
    Fix { point: PointRef },
    /// A point lies on a curve
    PointOnCurve { point: PointRef, curve: CurveRef },
    /// A line passes through a point (midpoint)
    Midpoint { point: PointRef, line: CurveRef },
}

/// Dimension constraints (driving or driven)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SketchDimension {
    /// Distance between two points
    Distance { point_a: PointRef, point_b: PointRef, value: f64, driving: bool },
    /// Angle between two lines
    Angle { line_a: CurveRef, line_b: CurveRef, value: f64, driving: bool },
    /// Radius of a circle/arc
    Radius { curve: CurveRef, value: f64, driving: bool },
    /// Diameter of a circle/arc
    Diameter { curve: CurveRef, value: f64, driving: bool },
    /// Horizontal distance
    HorizontalDistance { point_a: PointRef, point_b: PointRef, value: f64, driving: bool },
    /// Vertical distance
    VerticalDistance { point_a: PointRef, point_b: PointRef, value: f64, driving: bool },
}

/// Reference to a point (vertex index + which end)
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PointRef {
    pub curve_index: usize,
    pub point_type: PointType,
}

/// Which point on a curve
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum PointType {
    Start,
    End,
    Center,
}

/// Reference to a curve in the sketch
pub type CurveRef = usize;

impl Sketch {
    pub fn new(name: impl Into<String>, plane: SketchPlane) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            plane,
            curves: Vec::new(),
            constraints: Vec::new(),
            dimensions: Vec::new(),
            solved: false,
        }
    }

    /// Add a line to the sketch
    pub fn add_line(&mut self, start: [f64; 2], end: [f64; 2]) -> usize {
        let idx = self.curves.len();
        self.curves.push(SketchCurve::Line { start, end });
        self.solved = false;
        idx
    }

    /// Add a circle to the sketch
    pub fn add_circle(&mut self, center: [f64; 2], radius: f64) -> usize {
        let idx = self.curves.len();
        self.curves.push(SketchCurve::Circle { center, radius });
        self.solved = false;
        idx
    }

    /// Add an arc to the sketch
    pub fn add_arc(
        &mut self,
        center: [f64; 2],
        radius: f64,
        start_angle: f64,
        end_angle: f64,
    ) -> usize {
        let idx = self.curves.len();
        self.curves.push(SketchCurve::Arc {
            center,
            radius,
            start_angle,
            end_angle,
        });
        self.solved = false;
        idx
    }

    /// Add a constraint
    pub fn add_constraint(&mut self, constraint: SketchConstraint) {
        self.constraints.push(constraint);
        self.solved = false;
    }

    /// Build a closed profile from the sketch curves
    pub fn to_profile(&self) -> Option<SketchProfile> {
        if self.curves.is_empty() {
            return None;
        }
        Some(SketchProfile {
            curves: self.curves.clone(),
            closed: true, // TODO: verify closure
        })
    }
}
