//! Plugin registry — discovery, loading, lifecycle management.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tracing::{info, warn};

use crate::host::PluginHost;
use crate::manifest::{PluginManifest, PluginType};

/// Registry that manages installed plugins
pub struct PluginRegistry {
    host: PluginHost,
    /// Map from plugin ID to index in the host
    plugins: HashMap<String, PluginEntry>,
    /// Plugin search directories
    search_paths: Vec<PathBuf>,
}

struct PluginEntry {
    manifest: PluginManifest,
    host_index: usize,
    enabled: bool,
}

impl PluginRegistry {
    pub fn new() -> Result<Self> {
        Ok(Self {
            host: PluginHost::new()?,
            plugins: HashMap::new(),
            search_paths: Vec::new(),
        })
    }

    /// Add a directory to search for plugins
    pub fn add_search_path(&mut self, path: impl Into<PathBuf>) {
        self.search_paths.push(path.into());
    }

    /// Discover and load all plugins from search paths
    pub fn discover(&mut self) -> Result<usize> {
        let mut loaded = 0;

        for search_path in self.search_paths.clone() {
            if !search_path.exists() {
                warn!("Plugin directory does not exist: {}", search_path.display());
                continue;
            }

            let entries = std::fs::read_dir(&search_path)
                .with_context(|| format!("Failed to read plugin dir: {}", search_path.display()))?;

            for entry in entries.flatten() {
                let path = entry.path();

                // Look for plugin directories with manifest.json + plugin.wasm
                if path.is_dir() {
                    let manifest_path = path.join("manifest.json");
                    let wasm_path = path.join("plugin.wasm");

                    if manifest_path.exists() && wasm_path.exists() {
                        match self.load_from_dir(&path) {
                            Ok(()) => loaded += 1,
                            Err(e) => {
                                warn!(
                                    "Failed to load plugin from {}: {}",
                                    path.display(),
                                    e
                                );
                            }
                        }
                    }
                }
            }
        }

        info!("Discovered and loaded {} plugins", loaded);
        Ok(loaded)
    }

    /// Load a plugin from a directory containing manifest.json and plugin.wasm
    pub fn load_from_dir(&mut self, dir: &Path) -> Result<()> {
        let manifest_path = dir.join("manifest.json");
        let wasm_path = dir.join("plugin.wasm");

        let manifest_json = std::fs::read_to_string(&manifest_path)
            .context("Failed to read manifest.json")?;
        let manifest: PluginManifest =
            serde_json::from_str(&manifest_json).context("Failed to parse manifest.json")?;

        let wasm_bytes = std::fs::read(&wasm_path).context("Failed to read plugin.wasm")?;

        self.load_plugin(manifest, &wasm_bytes)
    }

    /// Load a plugin from manifest and WASM bytes
    pub fn load_plugin(&mut self, manifest: PluginManifest, wasm_bytes: &[u8]) -> Result<()> {
        let id = manifest.id.clone();

        if self.plugins.contains_key(&id) {
            anyhow::bail!("Plugin '{}' is already loaded", id);
        }

        let host_index = self.host.load_plugin(manifest.clone(), wasm_bytes)?;

        self.plugins.insert(
            id.clone(),
            PluginEntry {
                manifest,
                host_index,
                enabled: true,
            },
        );

        Ok(())
    }

    /// Call a function on a plugin
    pub fn call(&mut self, plugin_id: &str, function: &str, input: &str) -> Result<String> {
        let entry = self
            .plugins
            .get(plugin_id)
            .context(format!("Plugin '{}' not found", plugin_id))?;

        if !entry.enabled {
            anyhow::bail!("Plugin '{}' is disabled", plugin_id);
        }

        self.host.call_plugin(entry.host_index, function, input)
    }

    /// Enable or disable a plugin
    pub fn set_enabled(&mut self, plugin_id: &str, enabled: bool) -> Result<()> {
        let entry = self
            .plugins
            .get_mut(plugin_id)
            .context(format!("Plugin '{}' not found", plugin_id))?;
        entry.enabled = enabled;
        info!(
            "Plugin '{}' {}",
            plugin_id,
            if enabled { "enabled" } else { "disabled" }
        );
        Ok(())
    }

    /// List all loaded plugins
    pub fn list(&self) -> Vec<&PluginManifest> {
        self.plugins.values().map(|e| &e.manifest).collect()
    }

    /// List plugins by type
    pub fn list_by_type(&self, plugin_type: PluginType) -> Vec<&PluginManifest> {
        self.plugins
            .values()
            .filter(|e| e.manifest.plugin_type == plugin_type)
            .map(|e| &e.manifest)
            .collect()
    }

    /// Get total number of loaded plugins
    pub fn count(&self) -> usize {
        self.plugins.len()
    }
}

impl Default for PluginRegistry {
    fn default() -> Self {
        Self::new().expect("Failed to create default PluginRegistry")
    }
}
