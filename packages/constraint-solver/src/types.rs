//! Constraint solver types — Salome PlaneGCS-inspired.

use serde::{Deserialize, Serialize};

/// Result of a constraint solve attempt
#[derive(Debug, Clone)]
pub struct SolveResult {
    /// Whether the system converged
    pub converged: bool,
    /// Number of iterations taken
    pub iterations: u32,
    /// Final residual error
    pub residual: f64,
    /// Degrees of freedom remaining
    pub dof: i32,
    /// Status message
    pub status: SolveStatus,
    /// Which algorithm succeeded (if any)
    pub algorithm_used: Option<SolverAlgorithm>,
    /// Conflicting constraint indices (if overconstrained)
    pub conflicting: Vec<usize>,
    /// Underconstrained parameter indices
    pub underconstrained: Vec<usize>,
}

/// Solve status (matches Salome PlaneGCS SolveStatus)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolveStatus {
    /// Fully constrained and solved (STATUS_OK)
    FullyConstrained,
    /// Under-constrained — DOF > 0 but solvable
    UnderConstrained,
    /// Over-constrained — conflicting constraints (STATUS_INCONSISTENT)
    OverConstrained,
    /// Solver did not converge in max iterations (STATUS_FAILED)
    DidNotConverge,
    /// Degenerate system (STATUS_DEGENERATED)
    Degenerate,
    /// No constraints to solve (STATUS_EMPTYSET)
    Empty,
}

/// Solver algorithm selection (Salome PlaneGCS cascading order)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolverAlgorithm {
    /// Dog-leg trust-region (default, best for well-conditioned problems)
    DogLeg,
    /// Levenberg-Marquardt (fallback for ill-conditioned)
    LevenbergMarquardt,
    /// BFGS quasi-Newton (last resort)
    BFGS,
    /// Plain Newton-Raphson (simple, fast)
    NewtonRaphson,
}

/// Solver configuration
#[derive(Debug, Clone, Copy)]
pub struct SolverConfig {
    /// Maximum iterations per algorithm attempt
    pub max_iterations: u32,
    /// Convergence tolerance (PlaneGCS default: 1e-10)
    pub tolerance: f64,
    /// Damping factor (0.0 - 1.0)
    pub damping: f64,
    /// Trust region initial radius (for DogLeg)
    pub trust_radius: f64,
    /// LM initial lambda (for Levenberg-Marquardt)
    pub lm_lambda: f64,
    /// Whether to use cascading algorithm fallback
    pub use_cascading: bool,
}

impl Default for SolverConfig {
    fn default() -> Self {
        Self {
            max_iterations: 100,
            tolerance: 1e-10,
            damping: 1.0,
            trust_radius: 1.0,
            lm_lambda: 1e-3,
            use_cascading: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_solver_config_default() {
        let config = SolverConfig::default();
        assert_eq!(config.max_iterations, 100);
        assert!((config.tolerance - 1e-10).abs() < 1e-15);
        assert!((config.damping - 1.0).abs() < 1e-10);
        assert!((config.trust_radius - 1.0).abs() < 1e-10);
        assert!((config.lm_lambda - 1e-3).abs() < 1e-10);
        assert!(config.use_cascading);
    }

    #[test]
    fn test_solve_status_variants() {
        let statuses = vec![
            SolveStatus::FullyConstrained,
            SolveStatus::UnderConstrained,
            SolveStatus::OverConstrained,
            SolveStatus::DidNotConverge,
            SolveStatus::Degenerate,
            SolveStatus::Empty,
        ];
        assert_eq!(statuses.len(), 6);
        assert_ne!(SolveStatus::FullyConstrained, SolveStatus::OverConstrained);
    }

    #[test]
    fn test_solver_algorithm_variants() {
        let algos = vec![
            SolverAlgorithm::DogLeg,
            SolverAlgorithm::LevenbergMarquardt,
            SolverAlgorithm::BFGS,
            SolverAlgorithm::NewtonRaphson,
        ];
        assert_eq!(algos.len(), 4);
        assert_ne!(SolverAlgorithm::DogLeg, SolverAlgorithm::BFGS);
    }

    #[test]
    fn test_solve_result_fields() {
        let result = SolveResult {
            converged: true,
            iterations: 5,
            residual: 1e-12,
            dof: 0,
            status: SolveStatus::FullyConstrained,
            algorithm_used: Some(SolverAlgorithm::DogLeg),
            conflicting: vec![],
            underconstrained: vec![],
        };
        assert!(result.converged);
        assert_eq!(result.iterations, 5);
        assert_eq!(result.dof, 0);
        assert!(result.conflicting.is_empty());
    }

    #[test]
    fn test_solve_status_serialization() {
        let status = SolveStatus::FullyConstrained;
        let json = serde_json::to_string(&status).unwrap();
        let deserialized: SolveStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, status);
    }

    #[test]
    fn test_solver_algorithm_serialization() {
        let algo = SolverAlgorithm::LevenbergMarquardt;
        let json = serde_json::to_string(&algo).unwrap();
        let deserialized: SolverAlgorithm = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, algo);
    }
}
