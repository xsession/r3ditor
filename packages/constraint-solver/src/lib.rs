//! # constraint-solver
//!
//! 2D geometric constraint solver using Newton-Raphson iteration
//! and 3D assembly constraint solver.
//!
//! ## 2D Constraints
//! - Coincident, horizontal, vertical, parallel, perpendicular
//! - Tangent, equal, symmetric, fix, point-on-curve
//! - Distance, angle, radius dimensions
//!
//! ## 3D Assembly Constraints
//! - Mate (face flush), Align (axis collinear)
//! - Offset, Angle, Gear, Tangent

pub mod solver2d;
pub mod solver3d;
pub mod types;

pub use solver2d::SketchSolver;
pub use solver3d::AssemblySolver;
