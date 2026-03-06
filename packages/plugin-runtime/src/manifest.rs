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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_test_helper() {
        let m = PluginManifest::test("My DFM Checker", PluginType::DfmCheck);
        assert_eq!(m.id, "com.test.my-dfm-checker");
        assert_eq!(m.name, "My DFM Checker");
        assert_eq!(m.version, "0.1.0");
        assert_eq!(m.plugin_type, PluginType::DfmCheck);
        assert_eq!(m.permissions, vec![Permission::ReadGeometry]);
    }

    #[test]
    fn test_manifest_serialization_roundtrip() {
        let m = PluginManifest::test("Export GLTF", PluginType::Exporter);
        let json = serde_json::to_string(&m).unwrap();
        let deserialized: PluginManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, m.id);
        assert_eq!(deserialized.name, m.name);
        assert_eq!(deserialized.plugin_type, m.plugin_type);
    }

    #[test]
    fn test_manifest_deserialization_with_defaults() {
        let json = r#"{
            "id": "com.test.minimal",
            "name": "Minimal",
            "version": "1.0.0",
            "author": "Someone",
            "description": "A minimal plugin",
            "plugin_type": "DfmCheck"
        }"#;
        let m: PluginManifest = serde_json::from_str(json).unwrap();
        assert_eq!(m.max_memory_mb, 64); // default
        assert_eq!(m.max_cpu_time_ms, 5000); // default
        assert_eq!(m.api_version, "0.1.0"); // default
        assert!(m.permissions.is_empty()); // default
    }

    #[test]
    fn test_plugin_type_variants() {
        let types = vec![
            PluginType::DfmCheck,
            PluginType::Material,
            PluginType::PostProcessor,
            PluginType::Toolpath,
            PluginType::Importer,
            PluginType::Exporter,
            PluginType::UiPanel,
        ];
        assert_eq!(types.len(), 7);
    }

    #[test]
    fn test_permission_variants() {
        let perms = vec![
            Permission::ReadGeometry,
            Permission::WriteGeometry,
            Permission::ReadMaterial,
            Permission::Network,
            Permission::FileSystem,
        ];
        assert_eq!(perms.len(), 5);
    }

    #[test]
    fn test_permission_equality() {
        assert_eq!(Permission::ReadGeometry, Permission::ReadGeometry);
        assert_ne!(Permission::ReadGeometry, Permission::WriteGeometry);
    }

    #[test]
    fn test_plugin_type_serialization() {
        let pt = PluginType::PostProcessor;
        let json = serde_json::to_string(&pt).unwrap();
        let deserialized: PluginType = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, pt);
    }
}
