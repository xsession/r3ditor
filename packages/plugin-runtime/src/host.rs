//! Plugin host — Wasmtime engine and sandboxed execution.

use anyhow::{Context, Result};
use tracing::{info, warn};
use wasmtime::*;

use crate::manifest::PluginManifest;

/// Plugin host manages Wasmtime engine and instantiated plugins
pub struct PluginHost {
    engine: Engine,
    linker: Linker<PluginState>,
    plugins: Vec<LoadedPlugin>,
}

/// Per-plugin state accessible from WASM
pub struct PluginState {
    pub memory_limit: usize,
    pub cpu_time_limit_ms: u64,
    pub log_buffer: Vec<String>,
}

/// A loaded and instantiated plugin
struct LoadedPlugin {
    manifest: PluginManifest,
    instance: Instance,
    store: Store<PluginState>,
}

impl PluginHost {
    /// Create a new plugin host with default settings
    pub fn new() -> Result<Self> {
        let mut config = Config::new();
        config
            .consume_fuel(true)
            .wasm_bulk_memory(true)
            .wasm_multi_value(true);

        let engine = Engine::new(&config)?;
        let mut linker = Linker::new(&engine);

        // Host functions available to plugins
        linker.func_wrap("env", "log", |mut caller: Caller<'_, PluginState>, ptr: i32, len: i32| {
            if let Some(memory) = caller.get_export("memory").and_then(|e| e.into_memory()) {
                let start = ptr as usize;
                let end = start + len as usize;
                let msg_string = {
                    let data = memory.data(&caller);
                    if end <= data.len() {
                        std::str::from_utf8(&data[start..end]).ok().map(|s| s.to_string())
                    } else {
                        None
                    }
                };
                if let Some(msg) = msg_string {
                    caller.data_mut().log_buffer.push(msg.clone());
                    info!(target: "plugin", "{}", msg);
                }
            }
        })?;

        Ok(Self {
            engine,
            linker,
            plugins: Vec::new(),
        })
    }

    /// Load a plugin from WASM bytes
    pub fn load_plugin(&mut self, manifest: PluginManifest, wasm_bytes: &[u8]) -> Result<usize> {
        let module = Module::new(&self.engine, wasm_bytes)
            .context("Failed to compile WASM module")?;

        let state = PluginState {
            memory_limit: manifest.max_memory_mb * 1024 * 1024,
            cpu_time_limit_ms: manifest.max_cpu_time_ms,
            log_buffer: Vec::new(),
        };

        let mut store = Store::new(&self.engine, state);

        // Set fuel limit (approximate CPU time limit)
        store.set_fuel(manifest.max_cpu_time_ms * 1_000_000)?;

        let instance = self.linker.instantiate(&mut store, &module)
            .context("Failed to instantiate plugin")?;

        let index = self.plugins.len();
        info!(
            "Loaded plugin '{}' v{} (max {}MB RAM, {}ms CPU)",
            manifest.name, manifest.version, manifest.max_memory_mb, manifest.max_cpu_time_ms
        );

        self.plugins.push(LoadedPlugin {
            manifest,
            instance,
            store,
        });

        Ok(index)
    }

    /// Call a plugin function that takes JSON input and returns JSON output
    pub fn call_plugin(
        &mut self,
        plugin_index: usize,
        function_name: &str,
        input_json: &str,
    ) -> Result<String> {
        let plugin = self.plugins.get_mut(plugin_index)
            .context("Invalid plugin index")?;

        // Get memory and allocator
        let memory = plugin
            .instance
            .get_memory(&mut plugin.store, "memory")
            .context("Plugin has no exported memory")?;

        let alloc = plugin
            .instance
            .get_typed_func::<i32, i32>(&mut plugin.store, "alloc")
            .context("Plugin has no 'alloc' export")?;

        // Allocate space for input JSON
        let input_bytes = input_json.as_bytes();
        let input_ptr = alloc.call(&mut plugin.store, input_bytes.len() as i32)?;

        // Write input to plugin memory
        memory.write(&mut plugin.store, input_ptr as usize, input_bytes)?;

        // Call the function
        let func = plugin
            .instance
            .get_typed_func::<(i32, i32), i32>(&mut plugin.store, function_name)
            .context(format!("Plugin has no '{}' export", function_name))?;

        let result_ptr = func.call(
            &mut plugin.store,
            (input_ptr, input_bytes.len() as i32),
        )?;

        // Read result length (first 4 bytes at result_ptr)
        let mut len_bytes = [0u8; 4];
        memory.read(&plugin.store, result_ptr as usize, &mut len_bytes)?;
        let result_len = u32::from_le_bytes(len_bytes) as usize;

        // Read result string
        let mut result_bytes = vec![0u8; result_len];
        memory.read(
            &plugin.store,
            (result_ptr as usize) + 4,
            &mut result_bytes,
        )?;

        let result = String::from_utf8(result_bytes)
            .context("Plugin returned invalid UTF-8")?;

        Ok(result)
    }

    /// Get number of loaded plugins
    pub fn plugin_count(&self) -> usize {
        self.plugins.len()
    }

    /// Get plugin manifest by index
    pub fn get_manifest(&self, index: usize) -> Option<&PluginManifest> {
        self.plugins.get(index).map(|p| &p.manifest)
    }
}

impl Default for PluginHost {
    fn default() -> Self {
        Self::new().expect("Failed to create default PluginHost")
    }
}
