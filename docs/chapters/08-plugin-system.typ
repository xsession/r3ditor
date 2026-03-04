#import "../template.typ": *

= Plugin System

== Architecture

The r3ditor plugin system is built on *wasmtime 28*, providing a sandboxed WASM runtime for third-party extensions. Plugins are isolated from the host and from each other, with access controlled by a *capability-based security model*.

#align(center)[
  #image("../assets/plugin-architecture.svg", width: 100%)
]

== Plugin Categories

Seven plugin categories are supported, each with a dedicated host interface:

#table(
  columns: (auto, auto, 1fr, auto),
  table.header([*Category*], [*Interface Trait*], [*Description*], [*Capabilities*]),
  [File Format], [`FileFormat`], [Import/export custom file formats (IGES, 3MF, Parasolid, etc.)], [`fs:read`, `fs:write`],
  [Material Library], [`MaterialLib`], [Add custom material definitions with physical properties], [`materials:read`, `materials:write`],
  [Cost Estimation], [`CostModel`], [Custom pricing models (vendor-specific, volume discounts)], [`estimation:read`, `estimation:write`],
  [Post-Processor], [`PostProc`], [Custom G-code post-processors for proprietary machine controllers], [`gcode:read`, `gcode:write`],
  [DFM Rule], [`DfmCheck`], [Custom design-for-manufacturability rules for industry standards], [`geometry:read`, `dfm:write`],
  [UI Extension], [`UiExtension`], [Custom panels, widgets, and toolbar buttons in the editor], [`ui:read`, `ui:write`],
  [Render Shader], [`Shader`], [Custom WGSL shaders for specialized visualization], [`render:write`],
)

== Plugin Manifest

Every plugin is described by a `plugin.toml` manifest:

```toml
[plugin]
name = "custom-material-lib"
version = "1.0.0"
description = "Aerospace alloy material library with Ti-6Al-4V variants"
author = "r3ditor Community"
license = "MIT"
plugin_type = "MaterialLib"
entry_point = "plugin.wasm"
min_host_version = "0.2.0"

[capabilities]
required = ["materials:read", "materials:write"]
optional = ["fs:read"]

[metadata]
homepage = "https://github.com/example/aerospace-materials"
repository = "https://github.com/example/aerospace-materials"
keywords = ["aerospace", "titanium", "materials"]
```

== Security Model

=== Capability-Based Access

Plugins request capabilities in their manifest; the host grants or denies each capability at load time:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Capability*], [*Description*], [*Risk Level*]),
  [`fs:read`], [Read files from the project directory (not system files)], [Medium],
  [`fs:write`], [Write files to the project directory], [Medium],
  [`materials:read`], [Read from the material catalog], [Low],
  [`materials:write`], [Add/modify materials in the catalog], [Low],
  [`geometry:read`], [Read the B-Rep model and mesh data], [Low],
  [`geometry:write`], [Modify geometry (add features, boolean ops)], [High],
  [`estimation:read`], [Read cost estimates], [Low],
  [`estimation:write`], [Modify cost estimates], [Medium],
  [`dfm:write`], [Add DFM findings/rules], [Low],
  [`gcode:read`], [Read generated G-code], [Low],
  [`gcode:write`], [Modify or generate G-code], [High],
  [`ui:read`], [Read UI state (selection, view mode)], [Low],
  [`ui:write`], [Add panels, buttons, and overlays], [Medium],
  [`render:write`], [Register custom WGSL shaders], [Medium],
  [`network`], [Make outbound HTTP requests (for licensing, data fetch)], [High],
)

=== Sandbox Guarantees

- *Memory isolation* — each WASM module has its own linear memory, no shared state
- *No raw system calls* — all I/O goes through capability-checked host functions
- *Resource limits* — configurable memory cap (default 64 MB per plugin)
- *Timeout* — plugin functions abort after 5 seconds (configurable)
- *No file system access* unless `fs:read`/`fs:write` capability is granted

== Plugin Host API

The host exposes a set of functions to plugins via the WASM import mechanism:

```rust
// Host functions available to plugins (via wasmtime linker)
pub trait PluginHost {
    fn log(&self, level: LogLevel, message: &str);
    fn get_material(&self, id: &str) -> Option<Material>;
    fn set_material(&mut self, material: Material) -> Result<()>;
    fn get_geometry(&self) -> Option<MeshData>;
    fn add_dfm_finding(&mut self, finding: DfmFinding);
    fn read_file(&self, path: &str) -> Result<Vec<u8>>;
    fn write_file(&mut self, path: &str, data: &[u8]) -> Result<()>;
}
```

== Registry & Discovery

Plugins are managed through a *local registry*:

- *Installation*: Copy `.wasm` + `plugin.toml` to `~/.r3ditor/plugins/<name>/`
- *Discovery*: Host scans plugin directory at startup, validates manifests
- *Loading*: WASM modules compiled to native code (wasmtime AOT)
- *Hot Reload*: File watcher detects changes → unload → recompile → reload
- *Conflict Resolution*: Plugin load order determined by dependency graph; conflicts are reported

#info-box(title: "Plugin Development")[
  Plugins can be written in any language that compiles to WASM: Rust (primary), C/C++, AssemblyScript, Go (via TinyGo), or Zig. The plugin SDK provides Rust proc-macros for ergonomic development.
]

== Example: Custom Material Plugin

```rust
use r3ditor_plugin_sdk::prelude::*;

#[plugin(name = "aerospace-ti64", version = "1.0.0")]
pub struct AerospaceTi64;

impl MaterialLib for AerospaceTi64 {
    fn materials(&self) -> Vec<Material> {
        vec![Material {
            name: "Ti-6Al-4V (Annealed)".into(),
            density: 4.43,         // g/cm³
            tensile_strength: 950.0, // MPa
            thermal_conductivity: 6.7, // W/m·K
            hardness: 334.0,       // HB
            specific_cutting_force: 1800.0, // N/mm²
            taylor_n: 0.15,
        }]
    }
}
```
