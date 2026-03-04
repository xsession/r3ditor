//! # cad-kernel
//!
//! Pure-Rust B-Rep/NURBS CAD kernel built on the Truck crate ecosystem.
//! Provides parametric modeling, boolean operations, fillets, chamfers,
//! and a feature-based history tree with undo/redo support.

pub mod brep;
pub mod features;
pub mod history;
pub mod operations;
pub mod sketch;
pub mod tessellation;

pub use brep::BRepModel;
pub use features::{Feature, FeatureTree};
pub use history::{Command, HistoryManager};
