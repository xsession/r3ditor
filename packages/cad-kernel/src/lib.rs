//! # cad-kernel — Pure-Rust Parametric CAD Kernel
//!
//! A Salome SHAPER-inspired parametric modeling kernel built on the Truck library.
//!
//! ## Module Overview
//!
//! | Module | Purpose |
//! |--------|---------|
//! | `document` | Document model — features, dependency graph, events, recomputation |
//! | `features` | Feature type system — kinds, attributes, results, concealment |
//! | `operations` | Geometry execution engine — extrusion, boolean, fillet, pattern |
//! | `history` | Transaction-based undo/redo (OCAF-style) |
//! | `naming` | Topological Naming Service — persistent shape identification |
//! | `brep` | B-Rep model — topology, primitives, validation, mass properties |
//! | `sketch` | 2D sketch system — entities, constraints, wire extraction |
//! | `tessellation` | Mesh generation, quality metrics (SMESH), smoothing |
//!
//! ## Architecture
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────┐
//! │                      Document                            │
//! │  ┌─────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐  │
//! │  │ Feature  │ │ Dep Graph │ │ EventBus │ │ Recompute │  │
//! │  │  Tree    │ │           │ │ (pub/sub)│ │  Engine   │  │
//! │  └────┬─────┘ └─────┬─────┘ └────┬─────┘ └─────┬─────┘  │
//! │       │             │            │             │          │
//! │  ┌────▼─────────────▼────────────▼─────────────▼──────┐  │
//! │  │              Operations Engine                      │  │
//! │  │  Extrude · Boolean · Fillet · Pattern · Mirror      │  │
//! │  └────────────────────┬───────────────────────────────┘  │
//! │                       │                                   │
//! │  ┌────────────────────▼───────────────────────────────┐  │
//! │  │                  B-Rep Body                         │  │
//! │  │  Vertices · Edges · Wires · Faces · Shells         │  │
//! │  └────────────────────┬───────────────────────────────┘  │
//! │                       │                                   │
//! │  ┌─────────┐ ┌───────▼──────┐ ┌───────────┐             │
//! │  │ Naming  │ │ Tessellation │ │  History   │             │
//! │  │ Service │ │ + Quality    │ │  (Undo)    │             │
//! │  └─────────┘ └──────────────┘ └───────────┘             │
//! └──────────────────────────────────────────────────────────┘
//! ```

pub mod brep;
pub mod document;
pub mod features;
pub mod history;
pub mod naming;
pub mod operations;
pub mod sketch;
pub mod tessellation;

// Re-export key types for convenience
pub use brep::{BRepBody, BodyId, TopoId};
pub use document::{Document, DocumentEvent, EventBus};
pub use features::{Feature, FeatureId, FeatureKind, FeatureResult, FeatureStatus};
pub use history::HistoryManager;
pub use naming::TopologicalNamingService;
pub use sketch::Sketch;
pub use tessellation::{
    analyze_mesh_quality, smooth_mesh, MeshQualityReport, SmoothingConfig, SmoothingMethod,
    TessellationParams,
};
