//! Constraint solver types.

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
}

/// Solve status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolveStatus {
    /// Fully constrained and solved
    FullyConstrained,
    /// Under-constrained (DOF > 0)
    UnderConstrained,
    /// Over-constrained (conflicting constraints)
    OverConstrained,
    /// Solver did not converge in max iterations
    DidNotConverge,
    /// No constraints to solve
    Empty,
}

/// Solver configuration
#[derive(Debug, Clone, Copy)]
pub struct SolverConfig {
    /// Maximum Newton-Raphson iterations
    pub max_iterations: u32,
    /// Convergence tolerance
    pub tolerance: f64,
    /// Damping factor (0.0 - 1.0)
    pub damping: f64,
}

impl Default for SolverConfig {
    fn default() -> Self {
        Self {
            max_iterations: 100,
            tolerance: 1e-10,
            damping: 1.0,
        }
    }
}
