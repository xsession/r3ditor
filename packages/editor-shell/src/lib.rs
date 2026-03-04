//! # editor-shell
//!
//! ECS-based editor orchestrator. Manages the main application loop:
//! Input → Constraint Solve → Rebuild → Render
//!
//! ## Architecture
//! - Entities: Bodies, sketches, manufacturing jobs
//! - Components: B-Rep, mesh, transform, material, history
//! - Systems: Input, constraint solver, rebuild, DFM, CAM, render

pub mod app;
pub mod commands;
pub mod ecs;
pub mod input;
pub mod ui;

pub use app::EditorApp;
