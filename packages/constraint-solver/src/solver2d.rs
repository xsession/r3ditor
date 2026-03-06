//! 2D geometric constraint solver — Salome PlaneGCS-inspired cascading solver.
//!
//! ## Algorithm Cascade (from Salome PlaneGCS)
//! 1. **DogLeg** — Trust-region method (default)
//! 2. **Levenberg-Marquardt** — Damped least-squares fallback
//! 3. **BFGS** — Quasi-Newton last resort
//!
//! ## DOF Tracking
//! Computes degrees of freedom via Jacobian rank analysis.

use nalgebra::{DMatrix, DVector};
use tracing::{debug, info, warn};

use crate::types::{SolveResult, SolveStatus, SolverAlgorithm, SolverConfig};

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

    /// Solve the constraint system using cascading algorithms (PlaneGCS pattern)
    ///
    /// Tries: DogLeg → Levenberg-Marquardt → BFGS → Newton-Raphson
    pub fn solve(&mut self) -> SolveResult {
        if self.constraints.is_empty() {
            return SolveResult {
                converged: true,
                iterations: 0,
                residual: 0.0,
                dof: (self.free_var_count() as i32),
                status: SolveStatus::Empty,
                algorithm_used: None,
                conflicting: vec![],
                underconstrained: vec![],
            };
        }

        let n_vars = self.free_var_count();
        let n_constraints = self.constraint_count();

        info!(
            "Solving 2D constraints: {} variables, {} equations",
            n_vars, n_constraints
        );

        // Save initial state for rollback between attempts
        let initial_state: Vec<Point2D> = self.points.clone();

        if self.config.use_cascading {
            // Cascading: DogLeg → LevenbergMarquardt → BFGS → Newton
            let algorithms = [
                SolverAlgorithm::DogLeg,
                SolverAlgorithm::LevenbergMarquardt,
                SolverAlgorithm::BFGS,
                SolverAlgorithm::NewtonRaphson,
            ];

            for algo in &algorithms {
                // Reset to initial state before each attempt
                self.points = initial_state.clone();
                let mut x = self.pack_variables();

                let result = match algo {
                    SolverAlgorithm::DogLeg => self.solve_dogleg(&mut x),
                    SolverAlgorithm::LevenbergMarquardt => self.solve_levenberg_marquardt(&mut x),
                    SolverAlgorithm::BFGS => self.solve_bfgs(&mut x),
                    SolverAlgorithm::NewtonRaphson => self.solve_newton(&mut x),
                };

                if result.converged {
                    let dof = n_vars as i32 - n_constraints as i32;
                    self.unpack_variables(&x);
                    return SolveResult {
                        converged: true,
                        iterations: result.iterations,
                        residual: result.residual,
                        dof,
                        status: if dof == 0 {
                            SolveStatus::FullyConstrained
                        } else if dof > 0 {
                            SolveStatus::UnderConstrained
                        } else {
                            SolveStatus::OverConstrained
                        },
                        algorithm_used: Some(*algo),
                        conflicting: vec![],
                        underconstrained: self.find_underconstrained(&x),
                    };
                }

                debug!("{:?} failed, trying next algorithm...", algo);
            }

            // All algorithms failed — detect conflicts
            self.points = initial_state;
            let x = self.pack_variables();
            let conflicting = self.detect_conflicts(&x);

            SolveResult {
                converged: false,
                iterations: self.config.max_iterations,
                residual: f64::MAX,
                dof: n_vars as i32 - n_constraints as i32,
                status: if !conflicting.is_empty() {
                    SolveStatus::OverConstrained
                } else {
                    SolveStatus::DidNotConverge
                },
                algorithm_used: None,
                conflicting,
                underconstrained: vec![],
            }
        } else {
            // Single algorithm: Newton-Raphson
            let mut x = self.pack_variables();
            let result = self.solve_newton(&mut x);
            let dof = n_vars as i32 - n_constraints as i32;

            if result.converged {
                self.unpack_variables(&x);
            }

            SolveResult {
                converged: result.converged,
                iterations: result.iterations,
                residual: result.residual,
                dof,
                status: if result.converged {
                    if dof == 0 { SolveStatus::FullyConstrained }
                    else if dof > 0 { SolveStatus::UnderConstrained }
                    else { SolveStatus::OverConstrained }
                } else {
                    SolveStatus::DidNotConverge
                },
                algorithm_used: Some(SolverAlgorithm::NewtonRaphson),
                conflicting: vec![],
                underconstrained: vec![],
            }
        }
    }

    /// Internal solve result (no DOF tracking)
    fn make_internal_result(converged: bool, iterations: u32, residual: f64) -> InternalResult {
        InternalResult { converged, iterations, residual }
    }

    /// Newton-Raphson solver (original algorithm)
    fn solve_newton(&self, x: &mut DVector<f64>) -> InternalResult {
        for iteration in 0..self.config.max_iterations {
            let f = self.evaluate_residuals(x);
            let residual = f.norm();

            if residual < self.config.tolerance {
                return Self::make_internal_result(true, iteration, residual);
            }

            let j = self.compute_jacobian(x);
            let jt = j.transpose();
            let jtj = &jt * &j;
            let jtf = &jt * &f;

            let reg = DMatrix::identity(jtj.nrows(), jtj.ncols()) * 1e-12;
            let jtj_reg = jtj + reg;

            match jtj_reg.lu().solve(&jtf) {
                Some(dx) => { *x -= self.config.damping * dx; }
                None => {
                    warn!("Newton: Jacobian singular at iteration {}", iteration);
                    return Self::make_internal_result(false, iteration, residual);
                }
            }
        }

        let residual = self.evaluate_residuals(x).norm();
        Self::make_internal_result(false, self.config.max_iterations, residual)
    }

    /// DogLeg trust-region solver (Salome PlaneGCS default)
    fn solve_dogleg(&self, x: &mut DVector<f64>) -> InternalResult {
        let mut trust_radius = self.config.trust_radius;
        let eta = 0.125; // Acceptance threshold

        for iteration in 0..self.config.max_iterations {
            let f = self.evaluate_residuals(x);
            let residual = f.norm();

            if residual < self.config.tolerance {
                return Self::make_internal_result(true, iteration, residual);
            }

            let j = self.compute_jacobian(x);
            let jt = j.transpose();
            let g = &jt * &f;  // gradient

            // Gauss-Newton step
            let jtj = &jt * &j;
            let reg = DMatrix::identity(jtj.nrows(), jtj.ncols()) * 1e-12;
            let gn_step = match (jtj + reg).lu().solve(&g) {
                Some(s) => s,
                None => {
                    // Singular — fall through to next algorithm
                    return Self::make_internal_result(false, iteration, residual);
                }
            };

            // Steepest descent step
            let g_norm_sq = g.dot(&g);
            let jg = &j * &g;
            let jg_norm_sq = jg.dot(&jg);
            let alpha = if jg_norm_sq > 1e-15 { g_norm_sq / jg_norm_sq } else { 1.0 };
            let sd_step = &g * alpha;

            // Dog-leg step selection
            let gn_norm = gn_step.norm();
            let sd_norm = sd_step.norm();

            let step = if gn_norm <= trust_radius {
                // Gauss-Newton step is inside trust region
                gn_step
            } else if sd_norm >= trust_radius {
                // Steepest descent step already exceeds trust region — scale it
                &sd_step * (trust_radius / sd_norm)
            } else {
                // Interpolate between steepest descent and Gauss-Newton
                let diff = &gn_step - &sd_step;
                let d_dot_d = diff.dot(&diff);
                let sd_dot_d = sd_step.dot(&diff);
                let sd_sq = sd_norm * sd_norm;
                let delta_sq = trust_radius * trust_radius;

                let disc = (sd_dot_d * sd_dot_d - d_dot_d * (sd_sq - delta_sq)).max(0.0).sqrt();
                let beta = (-sd_dot_d + disc) / d_dot_d;
                &sd_step + &diff * beta.clamp(0.0, 1.0)
            };

            // Evaluate new point
            let x_new = &*x - &step;
            let f_new = self.evaluate_residuals(&x_new);
            let new_residual = f_new.norm();

            // Actual vs predicted reduction
            let actual_reduction = residual * residual - new_residual * new_residual;
            let predicted = (&j * &step).dot(&f) * 2.0 - (&j * &step).norm_squared();
            let rho = if predicted.abs() > 1e-15 { actual_reduction / predicted } else { 0.0 };

            // Update trust radius
            if rho < 0.25 {
                trust_radius *= 0.25;
            } else if rho > 0.75 {
                trust_radius = (trust_radius * 2.0).min(100.0);
            }

            // Accept step if good enough
            if rho > eta {
                *x = x_new;
            }

            if trust_radius < 1e-15 {
                return Self::make_internal_result(false, iteration, residual);
            }
        }

        let residual = self.evaluate_residuals(x).norm();
        Self::make_internal_result(false, self.config.max_iterations, residual)
    }

    /// Levenberg-Marquardt solver (Salome PlaneGCS fallback #2)
    fn solve_levenberg_marquardt(&self, x: &mut DVector<f64>) -> InternalResult {
        let mut lambda = self.config.lm_lambda;

        for iteration in 0..self.config.max_iterations {
            let f = self.evaluate_residuals(x);
            let residual = f.norm();

            if residual < self.config.tolerance {
                return Self::make_internal_result(true, iteration, residual);
            }

            let j = self.compute_jacobian(x);
            let jt = j.transpose();
            let jtj = &jt * &j;
            let jtf = &jt * &f;

            // Damped normal equations: (JᵀJ + λI) Δx = Jᵀf
            let diag = DMatrix::from_diagonal(&jtj.diagonal()) * lambda;
            let lhs = &jtj + &diag;

            match lhs.lu().solve(&jtf) {
                Some(dx) => {
                    let x_new = &*x - &dx;
                    let f_new = self.evaluate_residuals(&x_new);
                    let new_residual = f_new.norm();

                    if new_residual < residual {
                        // Good step — reduce damping
                        *x = x_new;
                        lambda *= 0.1;
                        lambda = lambda.max(1e-15);
                    } else {
                        // Bad step — increase damping
                        lambda *= 10.0;
                        lambda = lambda.min(1e15);
                    }
                }
                None => {
                    lambda *= 10.0;
                    if lambda > 1e15 {
                        return Self::make_internal_result(false, iteration, residual);
                    }
                }
            }
        }

        let residual = self.evaluate_residuals(x).norm();
        Self::make_internal_result(false, self.config.max_iterations, residual)
    }

    /// BFGS quasi-Newton solver (Salome PlaneGCS last resort)
    fn solve_bfgs(&self, x: &mut DVector<f64>) -> InternalResult {
        let n = x.len();
        if n == 0 {
            return Self::make_internal_result(true, 0, 0.0);
        }

        // Cost function: ||f(x)||² / 2
        let compute_cost = |x_val: &DVector<f64>| -> f64 {
            let f = self.evaluate_residuals(x_val);
            0.5 * f.dot(&f)
        };

        // Gradient: Jᵀ * f
        let compute_gradient = |x_val: &DVector<f64>| -> DVector<f64> {
            let f = self.evaluate_residuals(x_val);
            let j = self.compute_jacobian(x_val);
            j.transpose() * f
        };

        let mut h_inv = DMatrix::identity(n, n); // Inverse Hessian approximation
        let mut grad = compute_gradient(x);
        let mut cost = compute_cost(x);

        for iteration in 0..self.config.max_iterations {
            if cost.sqrt() < self.config.tolerance {
                return Self::make_internal_result(true, iteration, cost.sqrt());
            }

            // Search direction: p = -H⁻¹ * grad
            let p = -&h_inv * &grad;

            // Line search (Armijo backtracking)
            let mut alpha = 1.0;
            let c1 = 1e-4;
            let dir_deriv = grad.dot(&p);

            let x_new;
            loop {
                let x_trial = &*x + alpha * &p;
                let cost_trial = compute_cost(&x_trial);
                if cost_trial <= cost + c1 * alpha * dir_deriv || alpha < 1e-12 {
                    x_new = x_trial;
                    break;
                }
                alpha *= 0.5;
            }

            let new_grad = compute_gradient(&x_new);
            let new_cost = compute_cost(&x_new);

            // BFGS update
            let s = &x_new - &*x;
            let y = &new_grad - &grad;
            let sy = s.dot(&y);

            if sy > 1e-15 {
                let rho = 1.0 / sy;
                let i_mat = DMatrix::identity(n, n);
                let sy_outer = &s * y.transpose() * rho;
                let left = &i_mat - &sy_outer;
                let right = &i_mat - (&y * s.transpose() * rho);
                let ss_outer = &s * s.transpose() * rho;
                h_inv = &left * &h_inv * &right + ss_outer;
            }

            *x = x_new;
            grad = new_grad;
            cost = new_cost;
        }

        Self::make_internal_result(false, self.config.max_iterations, cost.sqrt())
    }

    /// Detect conflicting constraints by checking individual constraint residuals
    fn detect_conflicts(&self, x: &DVector<f64>) -> Vec<usize> {
        let f = self.evaluate_residuals(x);
        let mut conflicts = Vec::new();
        let mut row = 0;
        let threshold = 1e-4;

        for (idx, constraint) in self.constraints.iter().enumerate() {
            let n_eqs = match constraint {
                Constraint2D::Coincident { .. } | Constraint2D::FixedPoint { .. } |
                Constraint2D::Midpoint { .. } => 2,
                _ => 1,
            };

            let mut max_residual: f64 = 0.0;
            for i in 0..n_eqs {
                if row + i < f.len() {
                    max_residual = max_residual.max(f[row + i].abs());
                }
            }

            if max_residual > threshold {
                conflicts.push(idx);
            }
            row += n_eqs;
        }

        conflicts
    }

    /// FreeCAD PlaneGCS-inspired DOF diagnosis via Jacobian rank analysis.
    ///
    /// Returns a `DiagnosisResult` with:
    /// - `dof`: true degrees of freedom (params - rank(J))
    /// - `conflicting`: constraint indices whose equations are inconsistent
    /// - `redundant`: constraint indices that are linearly dependent on others
    /// - `partially_redundant`: constraints nearly redundant (numerically close)
    /// - `well_constrained`: whether DOF == 0 with no conflicts
    pub fn diagnose(&self) -> DiagnosisResult {
        let x = self.pack_variables();
        let n_vars = x.len();
        let n_eqs = self.constraint_count();

        if n_eqs == 0 {
            return DiagnosisResult {
                dof: n_vars as i32,
                conflicting: vec![],
                redundant: vec![],
                partially_redundant: vec![],
                well_constrained: n_vars == 0,
                underconstrained_params: vec![],
            };
        }

        let j = self.compute_jacobian(&x);

        // SVD for rank analysis (FreeCAD uses QR, but SVD gives same info + more)
        let svd = j.clone().svd(true, true);
        let sv = &svd.singular_values;

        // Rank via singular value threshold (FreeCAD: convergence tolerance)
        let rank_threshold = 1e-8;
        let rank = sv.iter().filter(|&&s| s > rank_threshold).count();
        let dof = n_vars as i32 - rank as i32;

        // Find underconstrained parameters (null space of J)
        let underconstrained_params = if let Some(ref vt) = svd.v_t {
            let mut free = Vec::new();
            for i in rank..sv.len().min(vt.nrows()) {
                for col in 0..vt.ncols() {
                    if vt[(i, col)].abs() > 0.1 && !free.contains(&col) {
                        free.push(col);
                    }
                }
            }
            free
        } else {
            vec![]
        };

        // Find redundant constraints via row analysis of U matrix
        // Rows of U corresponding to near-zero singular values indicate redundancy
        let mut redundant = Vec::new();
        let mut partially_redundant = Vec::new();
        if let Some(ref u) = svd.u {
            // Map equation rows back to constraint indices
            let eq_to_constraint = self.build_equation_to_constraint_map();

            for sv_idx in rank..sv.len().min(u.ncols()) {
                let sv_val = sv[sv_idx];
                // Find which equation rows contribute most to this singular vector
                let mut max_contribution = 0.0_f64;
                let mut max_row = 0;
                for row in 0..u.nrows() {
                    let c = u[(row, sv_idx)].abs();
                    if c > max_contribution {
                        max_contribution = c;
                        max_row = row;
                    }
                }

                if max_contribution > 0.1 {
                    let constraint_idx = eq_to_constraint.get(&max_row).copied().unwrap_or(max_row);
                    if sv_val < 1e-12 {
                        if !redundant.contains(&constraint_idx) {
                            redundant.push(constraint_idx);
                        }
                    } else if sv_val < 1e-4 {
                        if !partially_redundant.contains(&constraint_idx) {
                            partially_redundant.push(constraint_idx);
                        }
                    }
                }
            }
        }

        // Detect conflicting constraints (high residual after solve attempt)
        let f = self.evaluate_residuals(&x);
        let mut conflicting = Vec::new();
        let conflict_threshold = 1e-4;
        let mut row = 0;
        for (idx, constraint) in self.constraints.iter().enumerate() {
            let n = match constraint {
                Constraint2D::Coincident { .. } | Constraint2D::FixedPoint { .. } |
                Constraint2D::Midpoint { .. } => 2,
                _ => 1,
            };
            let mut max_res: f64 = 0.0;
            for i in 0..n {
                if row + i < f.len() {
                    max_res = max_res.max(f[row + i].abs());
                }
            }
            if max_res > conflict_threshold && redundant.contains(&idx) {
                conflicting.push(idx);
            }
            row += n;
        }

        DiagnosisResult {
            dof,
            well_constrained: dof == 0 && conflicting.is_empty(),
            conflicting,
            redundant,
            partially_redundant,
            underconstrained_params,
        }
    }

    /// Build mapping from equation row index to constraint index
    fn build_equation_to_constraint_map(&self) -> std::collections::HashMap<usize, usize> {
        let mut map = std::collections::HashMap::new();
        let mut row = 0;
        for (idx, constraint) in self.constraints.iter().enumerate() {
            let n_eqs = match constraint {
                Constraint2D::Coincident { .. } | Constraint2D::FixedPoint { .. } |
                Constraint2D::Midpoint { .. } => 2,
                _ => 1,
            };
            for i in 0..n_eqs {
                map.insert(row + i, idx);
            }
            row += n_eqs;
        }
        map
    }

    /// Find underconstrained parameters via Jacobian rank analysis
    fn find_underconstrained(&self, x: &DVector<f64>) -> Vec<usize> {
        let j = self.compute_jacobian(x);
        let n_vars = j.ncols();
        if n_vars == 0 {
            return vec![];
        }

        // SVD to find rank-deficient columns
        let svd = j.svd(true, true);
        let threshold = 1e-8;
        let mut free_params = Vec::new();

        // Columns of V corresponding to near-zero singular values are underconstrained
        if let Some(vt) = &svd.v_t {
            for i in 0..svd.singular_values.len().min(n_vars) {
                if svd.singular_values[i] < threshold {
                    // This singular vector direction is free
                    // Map back to parameter indices
                    for j_idx in 0..n_vars {
                        if vt[(i, j_idx)].abs() > 0.1 {
                            if !free_params.contains(&j_idx) {
                                free_params.push(j_idx);
                            }
                        }
                    }
                }
            }
        }

        free_params
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

/// DOF diagnosis result (FreeCAD PlaneGCS `diagnose()` equivalent)
#[derive(Debug, Clone)]
pub struct DiagnosisResult {
    /// True degrees of freedom: params - rank(Jacobian)
    pub dof: i32,
    /// Whether system is DOF=0 with no conflicts (ideal state)
    pub well_constrained: bool,
    /// Constraint indices that conflict (inconsistent equations)
    pub conflicting: Vec<usize>,
    /// Constraint indices that are redundant (linearly dependent)
    pub redundant: Vec<usize>,
    /// Constraint indices that are nearly redundant (numerically ill-conditioned)
    pub partially_redundant: Vec<usize>,
    /// Parameter indices that are underconstrained (null space of J)
    pub underconstrained_params: Vec<usize>,
}

/// Internal result for algorithm subroutines (no DOF/conflict info)
struct InternalResult {
    converged: bool,
    iterations: u32,
    residual: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

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
