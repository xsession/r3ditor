//! # constraint-solver
//!
//! 2D geometric constraint solver with Salome PlaneGCS-inspired cascading:
//! DogLeg → Levenberg-Marquardt → BFGS → Newton-Raphson.
//!
//! ## 2D Constraints (25 types from PlaneGCS)
//! - Coincident, horizontal, vertical, parallel, perpendicular
//! - Tangent, equal, symmetric, fix, point-on-curve
//! - Distance, angle, radius dimensions
//!
//! ## 3D Assembly Constraints
//! - Mate (face flush), Align (axis collinear)
//! - Offset, Angle, Fixed

pub mod solver2d;
pub mod solver3d;
pub mod types;

pub use solver2d::SketchSolver;
pub use solver3d::AssemblySolver;
pub use types::{SolveResult, SolveStatus, SolverAlgorithm, SolverConfig};
