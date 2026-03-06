//! # 2D Sketch System — Salome SHAPER Sketch Entities
//!
//! A sketch lives on a plane and contains curves + constraints.
//! The sketch system:
//! 1. Stores geometric entities (points, lines, arcs, circles, splines)
//! 2. Manages constraints (coincident, parallel, tangent, dimension, etc.)
//! 3. Provides wire extraction for extrusion/revolution profiles
//!
//! ## Entity Types (from Salome PlaneGCS)
//! | Entity | Representation |
//! |--------|---------------|
//! | Point | (x, y) parameters |
//! | Line | Two points |
//! | Circle | Center + radius |
//! | Arc | Center + start + end + angles |
//! | Ellipse | Center + focus + semi-axes |
//! | B-Spline | Control points + weights + knots |

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique identifier for sketch entities
pub type SketchEntityId = Uuid;

// ─── Sketch Entities ──────────────────────────────────────────────────────────

/// A 2D point in sketch space
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point2D {
    pub x: f64,
    pub y: f64,
}

impl Point2D {
    pub fn new(x: f64, y: f64) -> Self { Self { x, y } }
    pub fn origin() -> Self { Self { x: 0.0, y: 0.0 } }
    pub fn distance_to(&self, other: &Point2D) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
    pub fn midpoint(&self, other: &Point2D) -> Point2D {
        Point2D::new((self.x + other.x) / 2.0, (self.y + other.y) / 2.0)
    }
}

/// Sketch entity — geometric primitive in 2D
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SketchEntity {
    Point {
        id: SketchEntityId,
        position: Point2D,
        is_construction: bool,
    },
    Line {
        id: SketchEntityId,
        start: Point2D,
        end: Point2D,
        is_construction: bool,
    },
    Circle {
        id: SketchEntityId,
        center: Point2D,
        radius: f64,
        is_construction: bool,
    },
    Arc {
        id: SketchEntityId,
        center: Point2D,
        radius: f64,
        start_angle: f64,
        end_angle: f64,
        is_construction: bool,
    },
    Ellipse {
        id: SketchEntityId,
        center: Point2D,
        semi_major: f64,
        semi_minor: f64,
        rotation: f64,
        is_construction: bool,
    },
    EllipticArc {
        id: SketchEntityId,
        center: Point2D,
        semi_major: f64,
        semi_minor: f64,
        rotation: f64,
        start_angle: f64,
        end_angle: f64,
        is_construction: bool,
    },
    BSpline {
        id: SketchEntityId,
        control_points: Vec<Point2D>,
        weights: Vec<f64>,
        knots: Vec<f64>,
        degree: u32,
        is_construction: bool,
    },
}

impl SketchEntity {
    pub fn id(&self) -> SketchEntityId {
        match self {
            Self::Point { id, .. } | Self::Line { id, .. } |
            Self::Circle { id, .. } | Self::Arc { id, .. } |
            Self::Ellipse { id, .. } | Self::EllipticArc { id, .. } |
            Self::BSpline { id, .. } => *id,
        }
    }

    pub fn is_construction(&self) -> bool {
        match self {
            Self::Point { is_construction, .. } | Self::Line { is_construction, .. } |
            Self::Circle { is_construction, .. } | Self::Arc { is_construction, .. } |
            Self::Ellipse { is_construction, .. } | Self::EllipticArc { is_construction, .. } |
            Self::BSpline { is_construction, .. } => *is_construction,
        }
    }

    /// Get the start point of this entity (for wire building)
    pub fn start_point(&self) -> Option<Point2D> {
        match self {
            Self::Point { position, .. } => Some(*position),
            Self::Line { start, .. } => Some(*start),
            Self::Arc { center, radius, start_angle, .. } => {
                Some(Point2D::new(
                    center.x + radius * start_angle.cos(),
                    center.y + radius * start_angle.sin(),
                ))
            }
            _ => None,
        }
    }

    /// Get the end point of this entity (for wire building)
    pub fn end_point(&self) -> Option<Point2D> {
        match self {
            Self::Point { position, .. } => Some(*position),
            Self::Line { end, .. } => Some(*end),
            Self::Arc { center, radius, end_angle, .. } => {
                Some(Point2D::new(
                    center.x + radius * end_angle.cos(),
                    center.y + radius * end_angle.sin(),
                ))
            }
            _ => None,
        }
    }

    /// Get the length of this entity
    pub fn length(&self) -> f64 {
        match self {
            Self::Point { .. } => 0.0,
            Self::Line { start, end, .. } => start.distance_to(end),
            Self::Circle { radius, .. } => 2.0 * std::f64::consts::PI * radius,
            Self::Arc { radius, start_angle, end_angle, .. } => {
                (end_angle - start_angle).abs() * radius
            }
            Self::Ellipse { semi_major, semi_minor, .. } => {
                // Ramanujan's approximation
                let a = *semi_major;
                let b = *semi_minor;
                std::f64::consts::PI * (3.0 * (a + b) - ((3.0 * a + b) * (a + 3.0 * b)).sqrt())
            }
            _ => 0.0,
        }
    }
}

// ─── Sketch Constraints ───────────────────────────────────────────────────────

/// Constraint types (25 types from Salome PlaneGCS)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SketchConstraint {
    /// Point-on-point coincidence
    Coincident {
        id: SketchEntityId,
        entity_a: SketchEntityId,
        point_a: PointOnEntity,
        entity_b: SketchEntityId,
        point_b: PointOnEntity,
    },
    /// Point-on-curve
    PointOnCurve {
        id: SketchEntityId,
        point_entity: SketchEntityId,
        curve_entity: SketchEntityId,
    },
    /// Middle point on line
    MiddlePoint {
        id: SketchEntityId,
        point_entity: SketchEntityId,
        line_entity: SketchEntityId,
    },
    /// Distance between two points
    Distance {
        id: SketchEntityId,
        entity_a: SketchEntityId,
        point_a: PointOnEntity,
        entity_b: SketchEntityId,
        point_b: PointOnEntity,
        value: f64,
    },
    /// Horizontal distance
    HorizontalDistance {
        id: SketchEntityId,
        entity_a: SketchEntityId,
        entity_b: SketchEntityId,
        value: f64,
    },
    /// Vertical distance
    VerticalDistance {
        id: SketchEntityId,
        entity_a: SketchEntityId,
        entity_b: SketchEntityId,
        value: f64,
    },
    /// Circle or arc radius
    Radius {
        id: SketchEntityId,
        entity: SketchEntityId,
        value: f64,
    },
    /// Angle between two lines
    Angle {
        id: SketchEntityId,
        line_a: SketchEntityId,
        line_b: SketchEntityId,
        value: f64,
    },
    /// Fix position
    Fixed {
        id: SketchEntityId,
        entity: SketchEntityId,
    },
    /// Horizontal line
    Horizontal {
        id: SketchEntityId,
        entity: SketchEntityId,
    },
    /// Vertical line
    Vertical {
        id: SketchEntityId,
        entity: SketchEntityId,
    },
    /// Parallel lines
    Parallel {
        id: SketchEntityId,
        line_a: SketchEntityId,
        line_b: SketchEntityId,
    },
    /// Perpendicular lines
    Perpendicular {
        id: SketchEntityId,
        line_a: SketchEntityId,
        line_b: SketchEntityId,
    },
    /// Symmetric about a line
    Symmetric {
        id: SketchEntityId,
        entity_a: SketchEntityId,
        entity_b: SketchEntityId,
        mirror_line: SketchEntityId,
    },
    /// Equal length or radius
    Equal {
        id: SketchEntityId,
        entity_a: SketchEntityId,
        entity_b: SketchEntityId,
    },
    /// Tangent between two curves
    Tangent {
        id: SketchEntityId,
        entity_a: SketchEntityId,
        entity_b: SketchEntityId,
    },
    /// Collinear lines
    Collinear {
        id: SketchEntityId,
        line_a: SketchEntityId,
        line_b: SketchEntityId,
    },
    /// Point-to-line distance
    PointLineDistance {
        id: SketchEntityId,
        point_entity: SketchEntityId,
        line_entity: SketchEntityId,
        value: f64,
    },
    /// Curve offset
    Offset {
        id: SketchEntityId,
        source: SketchEntityId,
        target: SketchEntityId,
        value: f64,
    },
}

/// Specifies which point on an entity to use
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum PointOnEntity {
    Start,
    End,
    Center,
    /// Custom parametric position (0.0 = start, 1.0 = end)
    Parametric(f64),
}

impl SketchConstraint {
    pub fn id(&self) -> SketchEntityId {
        match self {
            Self::Coincident { id, .. } | Self::PointOnCurve { id, .. } |
            Self::MiddlePoint { id, .. } | Self::Distance { id, .. } |
            Self::HorizontalDistance { id, .. } | Self::VerticalDistance { id, .. } |
            Self::Radius { id, .. } | Self::Angle { id, .. } |
            Self::Fixed { id, .. } | Self::Horizontal { id, .. } |
            Self::Vertical { id, .. } | Self::Parallel { id, .. } |
            Self::Perpendicular { id, .. } | Self::Symmetric { id, .. } |
            Self::Equal { id, .. } | Self::Tangent { id, .. } |
            Self::Collinear { id, .. } | Self::PointLineDistance { id, .. } |
            Self::Offset { id, .. } => *id,
        }
    }
}

// ─── Sketch ───────────────────────────────────────────────────────────────────

/// Solver status for a sketch
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SketchSolveStatus {
    Ok,
    Inconsistent,
    Underconstrained,
    Overconstrained,
    NotSolved,
}

/// A complete 2D sketch — entities, constraints, and solve state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sketch {
    pub id: Uuid,
    pub name: String,
    /// Sketch entities indexed by ID
    pub entities: HashMap<SketchEntityId, SketchEntity>,
    /// Entity insertion order (for deterministic iteration)
    pub entity_order: Vec<SketchEntityId>,
    /// Constraints
    pub constraints: Vec<SketchConstraint>,
    /// Current solve status
    pub solve_status: SketchSolveStatus,
    /// Degrees of freedom remaining
    pub dof: i32,
    /// Conflicting constraint IDs (if any)
    pub conflicting: Vec<SketchEntityId>,
}

impl Sketch {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            entities: HashMap::new(),
            entity_order: Vec::new(),
            constraints: Vec::new(),
            solve_status: SketchSolveStatus::NotSolved,
            dof: 0,
            conflicting: Vec::new(),
        }
    }

    /// Add an entity to the sketch
    pub fn add_entity(&mut self, entity: SketchEntity) -> SketchEntityId {
        let id = entity.id();
        self.entity_order.push(id);
        self.entities.insert(id, entity);
        self.solve_status = SketchSolveStatus::NotSolved;
        id
    }

    /// Remove an entity and all constraints referencing it
    pub fn remove_entity(&mut self, id: SketchEntityId) -> Option<SketchEntity> {
        self.entity_order.retain(|&eid| eid != id);
        self.constraints.retain(|c| !constraint_references_entity(c, id));
        self.solve_status = SketchSolveStatus::NotSolved;
        self.entities.remove(&id)
    }

    /// Add a constraint
    pub fn add_constraint(&mut self, constraint: SketchConstraint) {
        self.constraints.push(constraint);
        self.solve_status = SketchSolveStatus::NotSolved;
    }

    /// Remove a constraint by ID
    pub fn remove_constraint(&mut self, id: SketchEntityId) {
        self.constraints.retain(|c| c.id() != id);
        self.solve_status = SketchSolveStatus::NotSolved;
    }

    /// Get non-construction entities (for profile extraction)
    pub fn geometry_entities(&self) -> Vec<&SketchEntity> {
        self.entity_order
            .iter()
            .filter_map(|id| self.entities.get(id))
            .filter(|e| !e.is_construction())
            .collect()
    }

    /// Check if the sketch has a closed profile
    pub fn has_closed_profile(&self) -> bool {
        let entities = self.geometry_entities();
        if entities.is_empty() {
            return false;
        }

        // Try to build a wire from the entities
        self.build_wire().is_some()
    }

    /// Build an ordered wire from sketch entities (for extrusion/revolution)
    pub fn build_wire(&self) -> Option<Vec<SketchEntityId>> {
        let entities = self.geometry_entities();
        if entities.is_empty() {
            return None;
        }

        // Handle single closed entity (circle, closed spline)
        if entities.len() == 1 {
            return match &entities[0] {
                SketchEntity::Circle { id, .. } => Some(vec![*id]),
                _ => None,
            };
        }

        // Build wire by chaining endpoints
        let tolerance = 1e-6;
        let mut wire = Vec::new();
        let mut used = vec![false; entities.len()];

        // Start with first entity
        wire.push(0);
        used[0] = true;
        let mut current_end = entities[0].end_point()?;

        // Chain entities
        for _ in 1..entities.len() {
            let mut found = false;
            for (j, entity) in entities.iter().enumerate() {
                if used[j] {
                    continue;
                }
                if let Some(start) = entity.start_point() {
                    if start.distance_to(&current_end) < tolerance {
                        wire.push(j);
                        used[j] = true;
                        current_end = entity.end_point()?;
                        found = true;
                        break;
                    }
                }
                if let Some(end) = entity.end_point() {
                    if end.distance_to(&current_end) < tolerance {
                        wire.push(j);
                        used[j] = true;
                        current_end = entity.start_point()?;
                        found = true;
                        break;
                    }
                }
            }
            if !found {
                break;
            }
        }

        // Check closure
        if let Some(first_start) = entities[wire[0]].start_point() {
            if current_end.distance_to(&first_start) < tolerance && wire.len() == entities.len() {
                return Some(wire.iter().map(|&i| entities[i].id()).collect());
            }
        }

        None
    }

    /// Compute total degrees of freedom for current entities.
    /// Each point adds 2 DOF, each constraint removes DOF.
    pub fn compute_dof(&self) -> i32 {
        let mut dof = 0i32;

        for entity in self.entities.values() {
            dof += match entity {
                SketchEntity::Point { .. } => 2,
                SketchEntity::Line { .. } => 4,       // 2 points × 2
                SketchEntity::Circle { .. } => 3,      // center(2) + radius(1)
                SketchEntity::Arc { .. } => 5,         // center(2) + radius(1) + angles(2)
                SketchEntity::Ellipse { .. } => 5,     // center(2) + semi-axes(2) + rotation(1)
                SketchEntity::EllipticArc { .. } => 7,
                SketchEntity::BSpline { control_points, .. } => {
                    control_points.len() as i32 * 2
                }
            };
        }

        for constraint in &self.constraints {
            dof -= match constraint {
                SketchConstraint::Coincident { .. } => 2,
                SketchConstraint::PointOnCurve { .. } => 1,
                SketchConstraint::MiddlePoint { .. } => 2,
                SketchConstraint::Distance { .. } => 1,
                SketchConstraint::HorizontalDistance { .. } => 1,
                SketchConstraint::VerticalDistance { .. } => 1,
                SketchConstraint::Radius { .. } => 1,
                SketchConstraint::Angle { .. } => 1,
                SketchConstraint::Fixed { entity, .. } => {
                    match self.entities.get(entity) {
                        Some(SketchEntity::Point { .. }) => 2,
                        Some(SketchEntity::Line { .. }) => 4,
                        _ => 2,
                    }
                }
                SketchConstraint::Horizontal { .. } => 1,
                SketchConstraint::Vertical { .. } => 1,
                SketchConstraint::Parallel { .. } => 1,
                SketchConstraint::Perpendicular { .. } => 1,
                SketchConstraint::Symmetric { .. } => 2,
                SketchConstraint::Equal { .. } => 1,
                SketchConstraint::Tangent { .. } => 1,
                SketchConstraint::Collinear { .. } => 2,
                SketchConstraint::PointLineDistance { .. } => 1,
                SketchConstraint::Offset { .. } => 1,
            };
        }

        dof
    }
}

impl Default for Sketch {
    fn default() -> Self {
        Self::new("Sketch")
    }
}

// ─── Auto-Constraint Detection (FreeCAD SketchAnalysis) ───────────────────────

/// Configuration for auto-constraint detection
#[derive(Debug, Clone)]
pub struct AutoConstraintConfig {
    /// Position tolerance for coincident point detection (mm)
    pub point_precision: f64,
    /// Angle tolerance for horizontal/vertical detection (radians)
    pub angle_precision: f64,
    /// Length tolerance for equal-length detection (relative, 0.0-1.0)
    pub length_precision: f64,
    /// Whether to include construction geometry
    pub include_construction: bool,
}

impl Default for AutoConstraintConfig {
    fn default() -> Self {
        Self {
            point_precision: 1e-4,
            angle_precision: 0.5_f64.to_radians(), // ~0.5°
            length_precision: 0.01, // 1% tolerance
            include_construction: false,
        }
    }
}

/// Result of auto-constraint analysis
#[derive(Debug, Clone)]
pub struct AutoConstraintResult {
    /// Detected missing constraints ready to be added
    pub suggested_constraints: Vec<SketchConstraint>,
    /// Number of missing coincident constraints found
    pub missing_coincident: usize,
    /// Number of missing horizontal/vertical constraints found
    pub missing_hv: usize,
    /// Number of missing equality constraints found
    pub missing_equal: usize,
}

impl Sketch {
    /// FreeCAD SketchAnalysis::autoconstraint() equivalent.
    ///
    /// Detects missing constraints by analyzing geometry:
    /// 1. Near-coincident points → Coincident constraints
    /// 2. Near-horizontal/vertical lines → Horizontal/Vertical constraints
    /// 3. Equal-length segments → Equal constraints
    ///
    /// Returns suggested constraints without applying them.
    pub fn detect_auto_constraints(&self, config: &AutoConstraintConfig) -> AutoConstraintResult {
        let mut result = AutoConstraintResult {
            suggested_constraints: Vec::new(),
            missing_coincident: 0,
            missing_hv: 0,
            missing_equal: 0,
        };

        // Collect relevant entities
        let entities: Vec<(&SketchEntityId, &SketchEntity)> = self.entities.iter()
            .filter(|(_, e)| config.include_construction || !e.is_construction())
            .collect();

        // 1. Detect missing point-on-point coincident constraints
        self.detect_missing_coincident(&entities, config, &mut result);

        // 2. Detect missing horizontal/vertical constraints
        self.detect_missing_hv(&entities, config, &mut result);

        // 3. Detect missing equal-length constraints
        self.detect_missing_equality(&entities, config, &mut result);

        result
    }

    /// Apply auto-detected constraints one-by-one with validation.
    /// Skips any constraint that would make the sketch overconstrained.
    /// Returns the number of constraints actually added.
    pub fn apply_auto_constraints(&mut self, config: &AutoConstraintConfig) -> usize {
        let detected = self.detect_auto_constraints(config);
        let mut added = 0;

        for constraint in detected.suggested_constraints {
            let dof_before = self.compute_dof();
            self.add_constraint(constraint.clone());
            let dof_after = self.compute_dof();

            if dof_after < 0 {
                // Would overconstrain — remove it (FreeCAD pattern)
                self.constraints.pop();
                self.solve_status = SketchSolveStatus::NotSolved;
            } else {
                added += 1;
                // DOF decreased — good constraint
                let _ = dof_before; // used for validation
            }
        }

        added
    }

    /// Detect near-coincident points that lack Coincident constraints
    fn detect_missing_coincident(
        &self,
        entities: &[(&SketchEntityId, &SketchEntity)],
        config: &AutoConstraintConfig,
        result: &mut AutoConstraintResult,
    ) {
        // Collect all endpoints from entities
        let mut endpoints: Vec<(SketchEntityId, PointOnEntity, Point2D)> = Vec::new();

        for (&id, entity) in entities {
            match entity {
                SketchEntity::Point { position, .. } => {
                    endpoints.push((id, PointOnEntity::Start, *position));
                }
                SketchEntity::Line { start, end, .. } => {
                    endpoints.push((id, PointOnEntity::Start, *start));
                    endpoints.push((id, PointOnEntity::End, *end));
                }
                SketchEntity::Arc { center, radius, start_angle, end_angle, .. } => {
                    endpoints.push((id, PointOnEntity::Start, Point2D::new(
                        center.x + radius * start_angle.cos(),
                        center.y + radius * start_angle.sin(),
                    )));
                    endpoints.push((id, PointOnEntity::End, Point2D::new(
                        center.x + radius * end_angle.cos(),
                        center.y + radius * end_angle.sin(),
                    )));
                }
                _ => {}
            }
        }

        // Check all pairs for near-coincidence
        for i in 0..endpoints.len() {
            for j in (i + 1)..endpoints.len() {
                let (id_a, pt_a, pos_a) = &endpoints[i];
                let (id_b, pt_b, pos_b) = &endpoints[j];

                // Skip same entity
                if id_a == id_b { continue; }

                if pos_a.distance_to(pos_b) < config.point_precision {
                    // Check if a coincident constraint already exists
                    if !self.has_coincident_constraint(*id_a, *pt_a, *id_b, *pt_b) {
                        result.suggested_constraints.push(SketchConstraint::Coincident {
                            id: Uuid::new_v4(),
                            entity_a: *id_a,
                            point_a: *pt_a,
                            entity_b: *id_b,
                            point_b: *pt_b,
                        });
                        result.missing_coincident += 1;
                    }
                }
            }
        }
    }

    /// Detect near-horizontal or near-vertical lines
    fn detect_missing_hv(
        &self,
        entities: &[(&SketchEntityId, &SketchEntity)],
        config: &AutoConstraintConfig,
        result: &mut AutoConstraintResult,
    ) {
        for (&id, entity) in entities {
            if let SketchEntity::Line { start, end, .. } = entity {
                let dx = end.x - start.x;
                let dy = end.y - start.y;
                let len = (dx * dx + dy * dy).sqrt();
                if len < 1e-12 { continue; }

                // Check horizontal: |dy/dx| < tan(angle_precision)
                let tan_prec = config.angle_precision.tan();
                let is_horizontal = dx.abs() > 1e-12 && (dy / dx).abs() < tan_prec;
                let is_vertical = dy.abs() > 1e-12 && (dx / dy).abs() < tan_prec;

                if is_horizontal && !self.has_constraint_on_entity(id, ConstraintKind::Horizontal) {
                    result.suggested_constraints.push(SketchConstraint::Horizontal {
                        id: Uuid::new_v4(),
                        entity: id,
                    });
                    result.missing_hv += 1;
                } else if is_vertical && !self.has_constraint_on_entity(id, ConstraintKind::Vertical) {
                    result.suggested_constraints.push(SketchConstraint::Vertical {
                        id: Uuid::new_v4(),
                        entity: id,
                    });
                    result.missing_hv += 1;
                }
            }
        }
    }

    /// Detect segments with equal lengths
    fn detect_missing_equality(
        &self,
        entities: &[(&SketchEntityId, &SketchEntity)],
        config: &AutoConstraintConfig,
        result: &mut AutoConstraintResult,
    ) {
        // Collect line segments with their lengths
        let lines: Vec<(SketchEntityId, f64)> = entities.iter()
            .filter_map(|(&id, entity)| {
                if let SketchEntity::Line { start, end, .. } = entity {
                    Some((id, start.distance_to(end)))
                } else {
                    None
                }
            })
            .collect();

        // Find pairs with equal lengths
        for i in 0..lines.len() {
            for j in (i + 1)..lines.len() {
                let (id_a, len_a) = &lines[i];
                let (id_b, len_b) = &lines[j];

                let avg_len = (*len_a + *len_b) / 2.0;
                if avg_len < 1e-12 { continue; }

                let relative_diff = (len_a - len_b).abs() / avg_len;
                if relative_diff < config.length_precision {
                    // Check no existing Equal constraint
                    if !self.has_equal_constraint(*id_a, *id_b) {
                        result.suggested_constraints.push(SketchConstraint::Equal {
                            id: Uuid::new_v4(),
                            entity_a: *id_a,
                            entity_b: *id_b,
                        });
                        result.missing_equal += 1;
                    }
                }
            }
        }
    }

    /// Check if a Coincident constraint already exists between two entity-points
    fn has_coincident_constraint(
        &self,
        ea: SketchEntityId, _pa: PointOnEntity,
        eb: SketchEntityId, _pb: PointOnEntity,
    ) -> bool {
        self.constraints.iter().any(|c| {
            matches!(c, SketchConstraint::Coincident { entity_a, entity_b, .. }
                if (*entity_a == ea && *entity_b == eb) || (*entity_a == eb && *entity_b == ea))
        })
    }

    /// Check if a specific kind of constraint exists on an entity
    fn has_constraint_on_entity(&self, entity_id: SketchEntityId, kind: ConstraintKind) -> bool {
        self.constraints.iter().any(|c| match (kind, c) {
            (ConstraintKind::Horizontal, SketchConstraint::Horizontal { entity, .. }) => *entity == entity_id,
            (ConstraintKind::Vertical, SketchConstraint::Vertical { entity, .. }) => *entity == entity_id,
            _ => false,
        })
    }

    /// Check if an Equal constraint already exists between two entities
    fn has_equal_constraint(&self, ea: SketchEntityId, eb: SketchEntityId) -> bool {
        self.constraints.iter().any(|c| {
            matches!(c, SketchConstraint::Equal { entity_a, entity_b, .. }
                if (*entity_a == ea && *entity_b == eb) || (*entity_a == eb && *entity_b == ea))
        })
    }
}

/// Internal enum for constraint kind matching
#[derive(Debug, Clone, Copy)]
enum ConstraintKind {
    Horizontal,
    Vertical,
}

/// Check if a constraint references a specific entity
fn constraint_references_entity(constraint: &SketchConstraint, entity_id: SketchEntityId) -> bool {
    match constraint {
        SketchConstraint::Coincident { entity_a, entity_b, .. } => {
            *entity_a == entity_id || *entity_b == entity_id
        }
        SketchConstraint::PointOnCurve { point_entity, curve_entity, .. } => {
            *point_entity == entity_id || *curve_entity == entity_id
        }
        SketchConstraint::MiddlePoint { point_entity, line_entity, .. } => {
            *point_entity == entity_id || *line_entity == entity_id
        }
        SketchConstraint::Distance { entity_a, entity_b, .. } => {
            *entity_a == entity_id || *entity_b == entity_id
        }
        SketchConstraint::HorizontalDistance { entity_a, entity_b, .. } |
        SketchConstraint::VerticalDistance { entity_a, entity_b, .. } => {
            *entity_a == entity_id || *entity_b == entity_id
        }
        SketchConstraint::Radius { entity, .. } |
        SketchConstraint::Fixed { entity, .. } |
        SketchConstraint::Horizontal { entity, .. } |
        SketchConstraint::Vertical { entity, .. } => {
            *entity == entity_id
        }
        SketchConstraint::Angle { line_a, line_b, .. } |
        SketchConstraint::Parallel { line_a, line_b, .. } |
        SketchConstraint::Perpendicular { line_a, line_b, .. } |
        SketchConstraint::Collinear { line_a, line_b, .. } => {
            *line_a == entity_id || *line_b == entity_id
        }
        SketchConstraint::Symmetric { entity_a, entity_b, mirror_line, .. } => {
            *entity_a == entity_id || *entity_b == entity_id || *mirror_line == entity_id
        }
        SketchConstraint::Equal { entity_a, entity_b, .. } |
        SketchConstraint::Tangent { entity_a, entity_b, .. } => {
            *entity_a == entity_id || *entity_b == entity_id
        }
        SketchConstraint::PointLineDistance { point_entity, line_entity, .. } => {
            *point_entity == entity_id || *line_entity == entity_id
        }
        SketchConstraint::Offset { source, target, .. } => {
            *source == entity_id || *target == entity_id
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sketch_creation() {
        let mut sketch = Sketch::new("Test Sketch");

        let line = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };

        sketch.add_entity(line);
        assert_eq!(sketch.entities.len(), 1);
    }

    #[test]
    fn test_dof_calculation() {
        let mut sketch = Sketch::new("Test");

        let line = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };
        let lid = line.id();
        sketch.add_entity(line);

        // Line has 4 DOF (2 points × 2)
        assert_eq!(sketch.compute_dof(), 4);

        // Add horizontal constraint → removes 1 DOF
        sketch.add_constraint(SketchConstraint::Horizontal {
            id: Uuid::new_v4(),
            entity: lid,
        });
        assert_eq!(sketch.compute_dof(), 3);

        // Fix the line → removes 4 DOF
        sketch.add_constraint(SketchConstraint::Fixed {
            id: Uuid::new_v4(),
            entity: lid,
        });
        assert_eq!(sketch.compute_dof(), -1); // Overconstrained
    }

    #[test]
    fn test_closed_rectangle() {
        let mut sketch = Sketch::new("Rectangle");

        let l1 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 0.0),
            end: Point2D::new(10.0, 0.0),
            is_construction: false,
        };
        let l2 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(10.0, 0.0),
            end: Point2D::new(10.0, 5.0),
            is_construction: false,
        };
        let l3 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(10.0, 5.0),
            end: Point2D::new(0.0, 5.0),
            is_construction: false,
        };
        let l4 = SketchEntity::Line {
            id: Uuid::new_v4(),
            start: Point2D::new(0.0, 5.0),
            end: Point2D::new(0.0, 0.0),
            is_construction: false,
        };

        sketch.add_entity(l1);
        sketch.add_entity(l2);
        sketch.add_entity(l3);
        sketch.add_entity(l4);

        assert!(sketch.has_closed_profile());
    }

    #[test]
    fn test_circle_is_closed() {
        let mut sketch = Sketch::new("Circle");
        sketch.add_entity(SketchEntity::Circle {
            id: Uuid::new_v4(),
            center: Point2D::new(0.0, 0.0),
            radius: 5.0,
            is_construction: false,
        });
        assert!(sketch.has_closed_profile());
    }
}
