//! # plugin-runtime
//!
//! Wasmtime-based WASM plugin host with sandboxed execution.
//!
//! ## Plugin Interfaces (WIT-style)
//! - DfmPlugin: Custom DFM check rules
//! - MaterialPlugin: Custom material definitions
//! - PostProcessorPlugin: Custom G-code post-processors
//! - ToolpathPlugin: Custom toolpath strategies

pub mod host;
pub mod manifest;
pub mod registry;

pub use host::PluginHost;
pub use manifest::PluginManifest;
pub use registry::PluginRegistry;
