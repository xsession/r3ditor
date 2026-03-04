//! Plugin manifest — metadata and permissions.

use serde::{Deserialize, Serialize};

/// Plugin manifest declaring metadata and capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    /// Plugin unique identifier
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Semantic version
    pub version: String,
    /// Author
    pub author: String,
    /// Description
    pub description: String,
    /// Plugin type
    pub plugin_type: PluginType,
    /// Maximum memory in MB
    #[serde(default = "default_memory")]
    pub max_memory_mb: usize,
    /// Maximum CPU time in ms per call
    #[serde(default = "default_cpu_time")]
    pub max_cpu_time_ms: u64,
    /// Required host API version
    #[serde(default = "default_api_version")]
    pub api_version: String,
    /// Permissions
    #[serde(default)]
    pub permissions: Vec<Permission>,
}

fn default_memory() -> usize {
    64
}
fn default_cpu_time() -> u64 {
    5000
}
fn default_api_version() -> String {
    "0.1.0".to_string()
}

/// Plugin categories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PluginType {
    /// DFM analysis rules
    DfmCheck,
    /// Material definitions
    Material,
    /// G-code post-processor
    PostProcessor,
    /// Custom toolpath strategy
    Toolpath,
    /// Custom file format importer
    Importer,
    /// Custom file format exporter
    Exporter,
    /// UI panel / widget
    UiPanel,
}

/// Plugin permissions
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Permission {
    /// Read geometry data
    ReadGeometry,
    /// Write / modify geometry
    WriteGeometry,
    /// Read material data
    ReadMaterial,
    /// Network access (for fetching resources)
    Network,
    /// File system access (sandboxed)
    FileSystem,
}

impl PluginManifest {
    /// Create a simple manifest for testing
    pub fn test(name: &str, plugin_type: PluginType) -> Self {
        Self {
            id: format!("com.test.{}", name.to_lowercase().replace(' ', "-")),
            name: name.to_string(),
            version: "0.1.0".to_string(),
            author: "Test".to_string(),
            description: format!("Test plugin: {}", name),
            plugin_type,
            max_memory_mb: 32,
            max_cpu_time_ms: 1000,
            api_version: "0.1.0".to_string(),
            permissions: vec![Permission::ReadGeometry],
        }
    }
}
