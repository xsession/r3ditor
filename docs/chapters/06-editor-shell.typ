#import "../template.typ": *

= Editor Shell & UI

== Dual UI Strategy

The r3ditor employs a *dual UI strategy* that combines the strengths of two rendering approaches:

#align(center)[
  #image("../assets/editor-ui-layout.svg", width: 100%)
]

#grid(
  columns: (1fr, 1fr),
  column-gutter: 16pt,
  [
    === egui — 3D Viewport
    The 3D viewport and in-viewport UI elements (gizmos, floating panels, selection highlights) are rendered via *egui 0.31* in immediate mode, directly integrated with the wgpu render pipeline.

    - Zero-latency interaction with 3D scene
    - GPU-accelerated text and widget rendering
    - Custom painting for gizmos and overlays
    - Integrated with winit 0.30 event loop
  ],
  [
    === React + Tailwind — Panels
    All peripheral UI (toolbar, feature tree, properties panel, status bar) is built with *React 18 + TypeScript 5.6 + Tailwind CSS 3.4*, rendered in the Tauri webview.

    - Rich component library with Tailwind styling
    - Zustand state management
    - Responsive layout with CSS Grid
    - Vite 6 hot-module replacement
  ],
)

== Editor Shell Architecture

The `editor-shell` crate is the *ECS orchestrator* that wires all systems together:

=== Core Components

#table(
  columns: (auto, 1fr),
  table.header([*Module*], [*Responsibility*]),
  [`app.rs`], [Main `EditorApp` struct — initializes all systems, runs the 4-stage frame loop, handles window events],
  [`ecs.rs`], [Lightweight ECS `World` with entity management, component storage, and system scheduling],
  [`commands.rs`], [`EditorCommand` enum — all user operations as undoable commands (Create, Delete, Modify, Select, Undo, Redo, etc.)],
  [`input.rs`], [Input handler — maps keyboard/mouse/touch events to commands, implements shortcut system],
  [`ui.rs`], [egui integration — viewport panels, gizmo rendering, debug overlays, visual mode selection],
)

=== EditorApp Lifecycle

```rust
pub struct EditorApp {
    world: World,
    cad_kernel: CadKernel,
    cam_engine: CamEngine,
    constraint_solver: ConstraintSolver,
    dfm_analyzer: DfmAnalyzer,
    renderer: Renderer,
    plugin_host: Option<PluginHost>,
    command_queue: VecDeque<EditorCommand>,
    undo_stack: Vec<EditorCommand>,
    redo_stack: Vec<EditorCommand>,
}
```

The app runs a continuous loop:
+ `handle_input()` — collect events → queue commands
+ `solve_constraints()` — resolve sketch constraints
+ `evaluate_geometry()` — replay feature tree → B-Rep → mesh
+ `render()` — execute 11-pass pipeline → present frame

== Command System

All user interactions are expressed as *typed commands*:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Command*], [*Description*], [*Undoable*]),
  [`CreateFeature`], [Add a new feature to the tree (extrude, fillet, etc.)], [✓],
  [`DeleteFeature`], [Remove a feature and all dependents], [✓],
  [`ModifyFeature`], [Change feature parameters (depth, radius, etc.)], [✓],
  [`SelectEntity`], [Set the current selection (vertex, edge, face, body)], [✗],
  [`SetViewMode`], [Switch visual mode (PBR, wireframe, X-ray, etc.)], [✗],
  [`SetMaterial`], [Assign material to a body], [✓],
  [`ImportFile`], [Load STEP/STL/DXF file], [✓],
  [`ExportFile`], [Save to STEP/STL/DXF/G-code], [✗],
  [`Undo` / `Redo`], [Navigate command history], [—],
  [`RunDfm`], [Trigger DFM analysis], [✗],
  [`GenerateToolpath`], [Compute CNC toolpath + G-code], [✗],
)

== Keyboard Shortcuts

#table(
  columns: (auto, auto, 1fr),
  table.header([*Key*], [*Modifier*], [*Action*]),
  [`Ctrl+Z`], [—], [Undo],
  [`Ctrl+Shift+Z`], [—], [Redo],
  [`Ctrl+S`], [—], [Save],
  [`Ctrl+O`], [—], [Open file],
  [`Delete`], [—], [Delete selection],
  [`F`], [—], [Fit all to view],
  [`1`], [Numpad], [Front view],
  [`3`], [Numpad], [Right view],
  [`7`], [Numpad], [Top view],
  [`5`], [Numpad], [Toggle perspective/orthographic],
  [`W`], [—], [Wireframe toggle],
  [`X`], [—], [X-ray toggle],
)

== React Frontend

=== Component Architecture

#table(
  columns: (auto, 1fr, auto),
  table.header([*Component*], [*Description*], [*State Source*]),
  [`App.tsx`], [Root layout — CSS Grid with sidebar/main/panel areas], [Zustand store],
  [`Toolbar.tsx`], [Top toolbar with file ops, view controls, and action buttons], [Zustand store],
  [`FeatureTree.tsx`], [Left panel — hierarchical feature list with drag-and-drop], [Zustand store],
  [`PropertiesPanel.tsx`], [Right panel — selected feature parameters, material, cost], [Zustand store],
  [`Viewport3D.tsx`], [Center — Three.js/R3F canvas (web mode) or native egui (desktop)], [Zustand store],
  [`StatusBar.tsx`], [Bottom bar — connection status, vertex/face counts, memory, version], [Zustand store],
)

=== State Management

The frontend uses *Zustand* for global state:

```typescript
interface EditorStore {
  features: Feature[];
  selectedId: string | null;
  viewMode: ViewMode;
  material: Material | null;
  dfmScore: number | null;
  isConnected: boolean;
  // Actions
  setFeatures: (features: Feature[]) => void;
  selectFeature: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
}
```

=== Tauri IPC Bridge

Communication between React and Rust uses Tauri's typed IPC:

```typescript
// Frontend → Rust
await invoke('import_file', { path: filePath });
await invoke('create_feature', { feature: newFeature });
const estimate = await invoke('estimate_cost', { material, geometry });

// Rust → Frontend (events)
listen('feature-tree-updated', (event) => { ... });
listen('dfm-complete', (event) => { ... });
```

=== Technology Stack

#grid(
  columns: (1fr, 1fr, 1fr),
  column-gutter: 8pt,
  row-gutter: 8pt,
  tech-badge("React 18", color: r3ditor-sky),
  tech-badge("TypeScript 5.6", color: r3ditor-blue),
  tech-badge("Tailwind 3.4", color: r3ditor-sky),
  tech-badge("Zustand 5", color: r3ditor-purple),
  tech-badge("Vite 6", color: r3ditor-accent),
  tech-badge("Three.js/R3F", color: r3ditor-green),
)
