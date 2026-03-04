//! 2D geometric constraint solver using Newton-Raphson iteration.
//!
//! The solver builds a system of equations from geometric constraints
//! and iteratively solves for the positions of sketch elements.

use nalgebra::{DMatrix, DVector};
use tracing::{debug, info, warn};

use crate::types::{SolveResult, SolveStatus, SolverConfig};

/// A 2D point (variable in the solver)
#[derive(Debug, Clone, Copy)]
pub struct Point2D {
    pub x: f64,
    pub y: f64,
    pub fixed: bool,
}

/// Constraint equation for the 2D solver
#[derive(Debug, Clone)]
pub enum Constraint2D {
    /// Two points coincide: (x1-x2)² + (y1-y2)² = 0
    Coincident { p1: usize, p2: usize },

    /// Point is at a fixed position
    FixedPoint { point: usize, x: f64, y: f64 },

    /// Line (p1→p2) is horizontal: y1 = y2
    Horizontal { p1: usize, p2: usize },

    /// Line (p1→p2) is vertical: x1 = x2
    Vertical { p1: usize, p2: usize },

    /// Distance between two points
    Distance { p1: usize, p2: usize, distance: f64 },

    /// Two lines are parallel
    Parallel { l1_p1: usize, l1_p2: usize, l2_p1: usize, l2_p2: usize },

    /// Two lines are perpendicular
    Perpendicular { l1_p1: usize, l1_p2: usize, l2_p1: usize, l2_p2: usize },

    /// Angle between two lines (radians)
    Angle { l1_p1: usize, l1_p2: usize, l2_p1: usize, l2_p2: usize, angle: f64 },

    /// Point lies on a line defined by two other points
    PointOnLine { point: usize, line_p1: usize, line_p2: usize },

    /// Two lines have equal length
    EqualLength { l1_p1: usize, l1_p2: usize, l2_p1: usize, l2_p2: usize },

    /// Point is at midpoint of a line
    Midpoint { point: usize, line_p1: usize, line_p2: usize },

    /// Symmetric about a vertical axis at x=val
    SymmetricX { p1: usize, p2: usize, axis_x: f64 },

    /// Symmetric about a horizontal axis at y=val
    SymmetricY { p1: usize, p2: usize, axis_y: f64 },

    /// Point on circle: (x-cx)² + (y-cy)² = r²
    PointOnCircle { point: usize, center: usize, radius: f64 },

    /// Tangent: line tangent to circle
    LineTangentToCircle {
        line_p1: usize,
        line_p2: usize,
        center: usize,
        radius: f64,
    },
}

/// 2D sketch constraint solver
pub struct SketchSolver {
    config: SolverConfig,
    points: Vec<Point2D>,
    constraints: Vec<Constraint2D>,
}

impl SketchSolver {
    pub fn new(config: SolverConfig) -> Self {
        Self {
            config,
            points: Vec::new(),
            constraints: Vec::new(),
        }
    }

    /// Add a point, returns its index
    pub fn add_point(&mut self, x: f64, y: f64) -> usize {
        let idx = self.points.len();
        self.points.push(Point2D { x, y, fixed: false });
        idx
    }

    /// Add a fixed point
    pub fn add_fixed_point(&mut self, x: f64, y: f64) -> usize {
        let idx = self.points.len();
        self.points.push(Point2D { x, y, fixed: true });
        idx
    }

    /// Add a constraint
    pub fn add_constraint(&mut self, constraint: Constraint2D) {
        self.constraints.push(constraint);
    }

    /// Get current point positions
    pub fn points(&self) -> &[Point2D] {
        &self.points
    }

    /// Solve the constraint system using Newton-Raphson
    pub fn solve(&mut self) -> SolveResult {
        if self.constraints.is_empty() {
            return SolveResult {
                converged: true,
                iterations: 0,
                residual: 0.0,
                dof: (self.free_var_count() as i32),
                status: SolveStatus::Empty,
            };
        }

        let n_vars = self.free_var_count();
        let n_constraints = self.constraint_count();

        info!(
            "Solving 2D constraints: {} variables, {} equations",
            n_vars, n_constraints
        );

        // Pack point positions into variable vector
        let mut x = self.pack_variables();

        for iteration in 0..self.config.max_iterations {
            // Evaluate residuals
            let f = self.evaluate_residuals(&x);
            let residual = f.norm();

            if residual < self.config.tolerance {
                self.unpack_variables(&x);
                let dof = n_vars as i32 - n_constraints as i32;
                info!(
                    "Converged in {} iterations, residual={:.2e}, DOF={}",
                    iteration, residual, dof
                );
                return SolveResult {
                    converged: true,
                    iterations: iteration,
                    residual,
                    dof,
                    status: if dof == 0 {
                        SolveStatus::FullyConstrained
                    } else if dof > 0 {
                        SolveStatus::UnderConstrained
                    } else {
                        SolveStatus::OverConstrained
                    },
                };
            }

            // Compute Jacobian
            let j = self.compute_jacobian(&x);

            // Solve J * dx = -f using least-squares (for non-square systems)
            let jt = j.transpose();
            let jtj = &jt * &j;
            let jtf = &jt * &f;

            // Add small regularization for numerical stability
            let reg = DMatrix::identity(jtj.nrows(), jtj.ncols()) * 1e-12;
            let jtj_reg = jtj + reg;

            match jtj_reg.lu().solve(&jtf) {
                Some(dx) => {
                    // Apply damped Newton step
                    x -= self.config.damping * dx;
                }
                None => {
                    warn!("Jacobian is singular at iteration {}", iteration);
                    self.unpack_variables(&x);
                    return SolveResult {
                        converged: false,
                        iterations: iteration,
                        residual,
                        dof: n_vars as i32 - n_constraints as i32,
                        status: SolveStatus::OverConstrained,
                    };
                }
            }
        }

        let f = self.evaluate_residuals(&x);
        self.unpack_variables(&x);

        SolveResult {
            converged: false,
            iterations: self.config.max_iterations,
            residual: f.norm(),
            dof: n_vars as i32 - n_constraints as i32,
            status: SolveStatus::DidNotConverge,
        }
    }

    /// Count free (non-fixed) variables
    fn free_var_count(&self) -> usize {
        self.points.iter().filter(|p| !p.fixed).count() * 2
    }

    /// Count constraint equations
    fn constraint_count(&self) -> usize {
        self.constraints
            .iter()
            .map(|c| match c {
                Constraint2D::Coincident { .. } => 2,
                Constraint2D::FixedPoint { .. } => 2,
                Constraint2D::Horizontal { .. } => 1,
                Constraint2D::Vertical { .. } => 1,
                Constraint2D::Distance { .. } => 1,
                Constraint2D::Parallel { .. } => 1,
                Constraint2D::Perpendicular { .. } => 1,
                Constraint2D::Angle { .. } => 1,
                Constraint2D::PointOnLine { .. } => 1,
                Constraint2D::EqualLength { .. } => 1,
                Constraint2D::Midpoint { .. } => 2,
                Constraint2D::SymmetricX { .. } => 1,
                Constraint2D::SymmetricY { .. } => 1,
                Constraint2D::PointOnCircle { .. } => 1,
                Constraint2D::LineTangentToCircle { .. } => 1,
            })
            .sum()
    }

    /// Pack point coordinates into a flat variable vector
    fn pack_variables(&self) -> DVector<f64> {
        let vars: Vec<f64> = self
            .points
            .iter()
            .filter(|p| !p.fixed)
            .flat_map(|p| [p.x, p.y])
            .collect();
        DVector::from_vec(vars)
    }

    /// Unpack variable vector back into points
    fn unpack_variables(&mut self, x: &DVector<f64>) {
        let mut idx = 0;
        for point in self.points.iter_mut() {
            if !point.fixed {
                point.x = x[idx];
                point.y = x[idx + 1];
                idx += 2;
            }
        }
    }

    /// Get point coordinates (from variable vector for free, or from stored for fixed)
    fn get_point(&self, x: &DVector<f64>, point_idx: usize) -> (f64, f64) {
        let point = &self.points[point_idx];
        if point.fixed {
            return (point.x, point.y);
        }
        // Find the variable index for this point
        let var_idx = self.points[..point_idx]
            .iter()
            .filter(|p| !p.fixed)
            .count()
            * 2;
        (x[var_idx], x[var_idx + 1])
    }

    /// Evaluate all constraint residuals
    fn evaluate_residuals(&self, x: &DVector<f64>) -> DVector<f64> {
        let n = self.constraint_count();
        let mut f = DVector::zeros(n);
        let mut row = 0;

        for constraint in &self.constraints {
            match constraint {
                Constraint2D::Coincident { p1, p2 } => {
                    let (x1, y1) = self.get_point(x, *p1);
                    let (x2, y2) = self.get_point(x, *p2);
                    f[row] = x1 - x2;
                    f[row + 1] = y1 - y2;
                    row += 2;
                }
                Constraint2D::FixedPoint { point, x: fx, y: fy } => {
                    let (px, py) = self.get_point(x, *point);
                    f[row] = px - fx;
                    f[row + 1] = py - fy;
                    row += 2;
                }
                Constraint2D::Horizontal { p1, p2 } => {
                    let (_, y1) = self.get_point(x, *p1);
                    let (_, y2) = self.get_point(x, *p2);
                    f[row] = y1 - y2;
                    row += 1;
                }
                Constraint2D::Vertical { p1, p2 } => {
                    let (x1, _) = self.get_point(x, *p1);
                    let (x2, _) = self.get_point(x, *p2);
                    f[row] = x1 - x2;
                    row += 1;
                }
                Constraint2D::Distance { p1, p2, distance } => {
                    let (x1, y1) = self.get_point(x, *p1);
                    let (x2, y2) = self.get_point(x, *p2);
                    let dx = x1 - x2;
                    let dy = y1 - y2;
                    f[row] = dx * dx + dy * dy - distance * distance;
                    row += 1;
                }
                Constraint2D::Parallel { l1_p1, l1_p2, l2_p1, l2_p2 } => {
                    let (x1, y1) = self.get_point(x, *l1_p1);
                    let (x2, y2) = self.get_point(x, *l1_p2);
                    let (x3, y3) = self.get_point(x, *l2_p1);
                    let (x4, y4) = self.get_point(x, *l2_p2);
                    // Cross product = 0 for parallel
                    f[row] = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
                    row += 1;
                }
                Constraint2D::Perpendicular { l1_p1, l1_p2, l2_p1, l2_p2 } => {
                    let (x1, y1) = self.get_point(x, *l1_p1);
                    let (x2, y2) = self.get_point(x, *l1_p2);
                    let (x3, y3) = self.get_point(x, *l2_p1);
                    let (x4, y4) = self.get_point(x, *l2_p2);
                    // Dot product = 0 for perpendicular
                    f[row] = (x2 - x1) * (x4 - x3) + (y2 - y1) * (y4 - y3);
                    row += 1;
                }
                Constraint2D::PointOnLine { point, line_p1, line_p2 } => {
                    let (px, py) = self.get_point(x, *point);
                    let (x1, y1) = self.get_point(x, *line_p1);
                    let (x2, y2) = self.get_point(x, *line_p2);
                    // Cross product = 0 means collinear
                    f[row] = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
                    row += 1;
                }
                Constraint2D::EqualLength { l1_p1, l1_p2, l2_p1, l2_p2 } => {
                    let (x1, y1) = self.get_point(x, *l1_p1);
                    let (x2, y2) = self.get_point(x, *l1_p2);
                    let (x3, y3) = self.get_point(x, *l2_p1);
                    let (x4, y4) = self.get_point(x, *l2_p2);
                    let len1_sq = (x2 - x1).powi(2) + (y2 - y1).powi(2);
                    let len2_sq = (x4 - x3).powi(2) + (y4 - y3).powi(2);
                    f[row] = len1_sq - len2_sq;
                    row += 1;
                }
                Constraint2D::Midpoint { point, line_p1, line_p2 } => {
                    let (px, py) = self.get_point(x, *point);
                    let (x1, y1) = self.get_point(x, *line_p1);
                    let (x2, y2) = self.get_point(x, *line_p2);
                    f[row] = px - (x1 + x2) / 2.0;
                    f[row + 1] = py - (y1 + y2) / 2.0;
                    row += 2;
                }
                Constraint2D::Angle { l1_p1, l1_p2, l2_p1, l2_p2, angle } => {
                    let (x1, y1) = self.get_point(x, *l1_p1);
                    let (x2, y2) = self.get_point(x, *l1_p2);
                    let (x3, y3) = self.get_point(x, *l2_p1);
                    let (x4, y4) = self.get_point(x, *l2_p2);
                    let dx1 = x2 - x1;
                    let dy1 = y2 - y1;
                    let dx2 = x4 - x3;
                    let dy2 = y4 - y3;
                    // sin(angle) * dot - cos(angle) * cross = 0
                    let dot = dx1 * dx2 + dy1 * dy2;
                    let cross = dx1 * dy2 - dy1 * dx2;
                    f[row] = angle.sin() * dot - angle.cos() * cross;
                    row += 1;
                }
                Constraint2D::SymmetricX { p1, p2, axis_x } => {
                    let (x1, _) = self.get_point(x, *p1);
                    let (x2, _) = self.get_point(x, *p2);
                    f[row] = (x1 + x2) / 2.0 - axis_x;
                    row += 1;
                }
                Constraint2D::SymmetricY { p1, p2, axis_y } => {
                    let (_, y1) = self.get_point(x, *p1);
                    let (_, y2) = self.get_point(x, *p2);
                    f[row] = (y1 + y2) / 2.0 - axis_y;
                    row += 1;
                }
                Constraint2D::PointOnCircle { point, center, radius } => {
                    let (px, py) = self.get_point(x, *point);
                    let (cx, cy) = self.get_point(x, *center);
                    f[row] = (px - cx).powi(2) + (py - cy).powi(2) - radius.powi(2);
                    row += 1;
                }
                Constraint2D::LineTangentToCircle { line_p1, line_p2, center, radius } => {
                    let (x1, y1) = self.get_point(x, *line_p1);
                    let (x2, y2) = self.get_point(x, *line_p2);
                    let (cx, cy) = self.get_point(x, *center);
                    let dx = x2 - x1;
                    let dy = y2 - y1;
                    let len = (dx * dx + dy * dy).sqrt();
                    // Distance from center to line = |cross| / |line|
                    let dist = ((cx - x1) * dy - (cy - y1) * dx).abs() / len;
                    f[row] = dist - radius;
                    row += 1;
                }
            }
        }

        f
    }

    /// Compute Jacobian by finite differences
    fn compute_jacobian(&self, x: &DVector<f64>) -> DMatrix<f64> {
        let m = self.constraint_count();
        let n = x.len();
        let eps = 1e-8;

        let f0 = self.evaluate_residuals(x);
        let mut j = DMatrix::zeros(m, n);

        for col in 0..n {
            let mut x_pert = x.clone();
            x_pert[col] += eps;
            let f_pert = self.evaluate_residuals(&x_pert);
            for row in 0..m {
                j[(row, col)] = (f_pert[row] - f0[row]) / eps;
            }
        }

        j
    }
}

impl Default for SketchSolver {
    fn default() -> Self {
        Self::new(SolverConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SolveStatus;

    #[test]
    fn test_horizontal_constraint() {
        let mut solver = SketchSolver::default();
        let p0 = solver.add_fixed_point(0.0, 0.0);
        let p1 = solver.add_point(5.0, 2.0); // slightly off-horizontal

        solver.add_constraint(Constraint2D::Horizontal { p1: p0, p2: p1 });

        let result = solver.solve();
        assert!(result.converged);

        let points = solver.points();
        assert!((points[1].y - 0.0).abs() < 1e-8);
    }

    #[test]
    fn test_distance_constraint() {
        let mut solver = SketchSolver::default();
        let p0 = solver.add_fixed_point(0.0, 0.0);
        let p1 = solver.add_point(3.0, 4.0);

        solver.add_constraint(Constraint2D::Distance {
            p1: p0,
            p2: p1,
            distance: 10.0,
        });

        let result = solver.solve();
        assert!(result.converged);

        let points = solver.points();
        let dx = points[1].x - points[0].x;
        let dy = points[1].y - points[0].y;
        let dist = (dx * dx + dy * dy).sqrt();
        assert!((dist - 10.0).abs() < 1e-6);
    }
}
