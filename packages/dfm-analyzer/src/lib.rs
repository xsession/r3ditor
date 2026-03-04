//! # dfm-analyzer
//!
//! DFM (Design for Manufacturability) analysis engine.
//! Checks parts for manufacturability issues including:
//! - Wall thickness violations
//! - Draft angle problems
//! - Undercut detection
//! - Sharp corner warnings
//! - Thin feature detection
//! - Hole size and spacing checks
//! - Bend relief and proximity checks

pub mod checks;
pub mod analyzer;

pub use analyzer::DfmAnalyzer;
