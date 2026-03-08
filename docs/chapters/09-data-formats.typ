#import "../template.typ": *

= Data Formats & File I/O

== Native Format: `.manu`

The r3ditor native project file uses the `.manu` extension — a *ZIP archive* containing structured JSON metadata and binary mesh payloads:

```
project.manu (ZIP archive)
├── manifest.json        # Version, metadata, feature list
├── geometry/
│   ├── brep.json        # B-Rep topology (Vertex, Edge, Face, Shell, Solid)
│   ├── mesh.bin         # Binary tessellated mesh (position + normal + UV)
│   └── features.json    # Parametric feature history stack
├── manufacturing/
│   ├── toolpaths.json   # Generated toolpath segments
│   ├── gcode/           # Post-processed G-code files per machine
│   └── nesting.json     # Sheet nesting layout
├── materials/
│   └── catalog.json     # Materials used in project
├── analysis/
│   ├── dfm.json         # DFM findings and severity scores
│   └── cost.json        # Cost estimation breakdown
├── assets/
│   └── thumbnails/      # Preview thumbnails (PNG 256×256)
└── plugins/
    └── state.json       # Per-plugin saved state
```

=== Binary Mesh Format

The `mesh.bin` file uses a compact binary layout optimized for GPU upload:

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Section*], [*Offset*], [*Type*], [*Description*]),
  [Magic], [0], [`u8 × 4`], [`0x4D 0x41 0x4E 0x55` ("MANU")],
  [Version], [4], [`u32`], [Binary format version (currently 1)],
  [Vertex Count], [8], [`u32`], [Number of vertices],
  [Index Count], [12], [`u32`], [Number of triangle indices],
  [Vertex Data], [16], [`f32 × 8 × N`], [Per-vertex: pos.xyz + normal.xyz + uv.xy],
  [Index Data], [16 + 32N], [`u32 × M`], [Triangle indices (3 per triangle)],
  [Checksum], [tail], [`u32`], [CRC32 of all preceding bytes],
)

== Import Formats

R3ditor supports a comprehensive set of industry-standard import formats:

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Format*], [*Extension*], [*Crate / Library*], [*Notes*]),
  [STEP AP203/AP214], [`.step`, `.stp`], [`truck-stepio`], [Primary B-Rep interchange; preserves topology, assemblies, PMI],
  [IGES], [`.iges`, `.igs`], [OpenCascade FFI], [Legacy B-Rep format; trimmed surfaces, wireframes],
  [STL (Binary)], [`.stl`], [`wasm-meshkit`], [Triangle mesh only; auto-detect binary via header magic],
  [STL (ASCII)], [`.stl`], [`wasm-meshkit`], [Slower parsing; fallback if binary detection fails],
  [OBJ], [`.obj`], [`tobj` crate], [Mesh + materials (MTL); groups → bodies],
  [3MF], [`.3mf`], [`threemf` crate], [Additive manufacturing format; mesh + color + materials],
  [DXF], [`.dxf`], [`dxf` crate], [2D/3D wireframe; used for sheet metal flat patterns],
  [glTF 2.0], [`.gltf`, `.glb`], [`gltf` crate], [Scene transfer; mesh + PBR materials + transforms],
  [Parasolid], [`.x_t`, `.x_b`], [Plugin], [Via plugin system (commercial license required)],
)

#info-box(title: "Format Auto-Detection")[
  The importer uses a two-pass detection strategy:
  1. *Extension-based* — fast path using file extension
  2. *Magic-byte sniffing* — fallback for misnamed files (e.g., binary STL with wrong extension)
]

== Export Formats

#table(
  columns: (auto, auto, auto, 1fr),
  table.header([*Format*], [*Extension*], [*Crate / Library*], [*Notes*]),
  [STEP AP203], [`.step`], [`truck-stepio`], [Full B-Rep with assemblies and metadata],
  [STL (Binary)], [`.stl`], [Custom writer], [Compact binary output; 50 bytes per triangle],
  [STL (ASCII)], [`.stl`], [Custom writer], [Human-readable; larger file size],
  [DXF], [`.dxf`], [`dxf` crate], [2D flat pattern export for laser/waterjet cutting],
  [G-code], [`.nc`, `.gcode`], [`r3ditor-cam`], [Machine-specific via post-processors],
  [3MF], [`.3mf`], [`threemf` crate], [Color mesh export for 3D printing],
  [PDF Report], [`.pdf`], [`printpdf` crate], [DFM analysis report with annotated views],
  [SVG], [`.svg`], [`svg` crate], [2D drawing export (flat patterns, sections)],
)

== G-Code Post-Processors

Eight built-in post-processors generate machine-specific G-code:

#table(
  columns: (auto, auto, 1fr),
  table.header([*Post-Processor*], [*Target*], [*Features*]),
  [Fanuc], [Fanuc 0i/30i CNC], [Standard G/M codes, canned cycles G81–G89, macro B],
  [Haas], [Haas VF/ST series], [Macros, visual programming, tool setting cycles],
  [Mazak], [Mazatrol Matrix], [Conversational format + EIA/ISO G-code hybrid],
  [Heidenhain], [Heidenhain TNC], [Conversational programming, cycle definitions, FK programming],
  [Grbl], [Open-source CNC], [Reduced instruction set for hobby/desktop mills],
  [LinuxCNC], [LinuxCNC], [O-word subroutines, named parameters, remapping],
  [Marlin], [3D Printer / CNC], [G-code for FDM printers and simple CNC routers],
  [Klipper], [Klipper firmware], [Extended G-code with macro support, pressure advance],
)

== File I/O Pipeline

=== Import Pipeline

```
File → Extension Detection → Magic-Byte Sniff → Format Router
  → STEP Parser (truck-stepio) → B-Rep Model
  → STL Parser (wasm-meshkit) → Mesh → Auto-heal (manifold check)
  → DXF Parser (dxf crate) → 2D Wireframe → Extrude to 3D
  → OBJ/glTF Parser → Mesh + Materials
→ Validation → Feature Recognition → Insert into ECS World
```

=== Export Pipeline

```
ECS World → Format Selector
  → STEP Writer → B-Rep serialization → .step file
  → STL Writer → Tessellate → Binary/ASCII → .stl file
  → G-code Writer → Toolpath → Post-processor → .nc file
  → PDF Writer → Render views → Annotate → .pdf report
→ Compression (optional) → Output File
```

#warning-box(title: "STEP Round-Trip Fidelity")[
  STEP is the only format that preserves full B-Rep topology and parametric feature history on round-trip. All mesh-based formats (STL, OBJ, glTF, 3MF) lose parametric information and cannot be re-edited as features.
]
