//! # shared-types
//!
//! Core shared types for the r3ditor CAD/CAM editor.
//! Contains API types, material definitions, DFM findings, estimation models,
//! and platform adapter interfaces.

pub mod api;
pub mod dfm;
pub mod estimation;
pub mod geometry;
pub mod materials;
pub mod manufacturing;
pub mod platform;
pub mod units;

// Re-export commonly used types
pub use api::*;
pub use geometry::{Transform3D, BoundingBox3D};
pub use materials::{SheetMaterial, CncMaterial, MaterialId};
pub use manufacturing::ManufacturingProcess;
pub use units::*;
