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
    === Three.js — 3D Viewport
    The 3D viewport is rendered via *Three.js 0.170* through React Three Fiber in the Tauri webview, providing GPU-accelerated 3D visualization.

    - Mesh rendering with orbit/pan/zoom camera
    - Entity picking via `PickingColorMap`
    - Grid, axes, and sketch overlay rendering
    - Integrated with React component lifecycle
  ],
  [
    === React + Tailwind — Panels
    All UI (toolbar, feature tree, properties panel, status bar, sketch toolbox) is built with *React 18.3 + TypeScript 5.6 + Tailwind CSS*, rendered in the Tauri webview.

    - Rich component library with Tailwind styling
    - Zustand 5.0 state management (1,062-line store)
    - Responsive layout with CSS Grid
    - Vite 6.4.1 hot-module replacement
  ],
)

== Editor Shell Architecture

The `editor-shell` crate is the *ECS orchestrator* that wires all systems together:

=== Core Components

#table(
  columns: (auto, 1fr),
  table.header([*Module*], [*Responsibility*]),
  [`app.rs`], [Main `EditorApp` struct — initializes all systems, manages tool activation/deactivation lifecycle, processes command queue],
  [`world.rs`], [`World` struct with `sketches: HashMap`, `active_sketch`, `ToolSnapshotManager`, `ClipboardBuffer`, `SnapConfig`, `PickingColorMap`],
  [`commands.rs`], [22 `EditorCommand` variants — all user operations as typed, undoable commands],
  [`tools.rs`], [21 tool types with `StatefulTool` lifecycle, `ToolStateMachine`, 7 sketch tools (Line, Circle, Arc, Rectangle, Spline, Point, Trim)],
  [`input.rs`], [Input handler — maps keyboard/mouse events to commands and tool state transitions],
  [`tauri_bridge`], [37 IPC command handlers in `apps/desktop/src-tauri/src/commands.rs` (692 lines)],
)

=== EditorApp Lifecycle

```rust
pub struct EditorApp {
    world: World,                           // Sketch state, entities, constraints
    cad_kernel: CadKernel,
    cam_engine: CamEngine,
    constraint_solver: ConstraintSolver,
    dfm_analyzer: DfmAnalyzer,
    plugin_host: Option<PluginHost>,
    command_queue: VecDeque<EditorCommand>,
    undo_stack: Vec<EditorCommand>,
    redo_stack: Vec<EditorCommand>,
    active_tool: Option<Box<dyn StatefulTool>>,  // Blender-style tool lifecycle
    tool_snapshot_mgr: ToolSnapshotManager,
    clipboard: ClipboardBuffer,
}
```

The `World` struct manages sketch-specific state:

```rust
pub struct World {
    pub sketches: HashMap<Uuid, Sketch>,    // All sketches by ID
    pub active_sketch: Option<Uuid>,        // Currently edited sketch
    pub snap_config: SnapConfig,            // Grid/entity/midpoint snap settings
    pub picking_color_map: PickingColorMap,  // GPU color-based entity picking
}
```

The app processes commands and manages tool lifecycle:
+ `activate_tool(tool_type)` — instantiate StatefulTool, enter Idle state
+ `handle_input()` — route events to active tool state machine
+ `process_commands()` — dequeue and execute EditorCommands
+ `solve_constraints()` — resolve sketch constraints via 4-stage cascade
+ `deactivate_tool()` — finalize tool, commit or cancel operation

== Command System

All user interactions are expressed as *typed commands*:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Command*], [*Description*], [*Undoable*]),
  [`CreateFeature`], [Add a new feature to the tree (extrude, fillet, etc.)], [✓],
  [`DeleteFeature`], [Remove a feature and all dependents], [✓],
  [`ModifyFeature`], [Change feature parameters (depth, radius, etc.)], [✓],
  [`SelectEntity`], [Set the current selection (vertex, edge, face, body)], [✗],
  [`SetViewMode`], [Switch visual mode (shaded, wireframe, x-ray)], [✗],
  [`SetMaterial`], [Assign material to a body], [✓],
  [`ImportFile`], [Load STEP/STL/DXF file], [✓],
  [`ExportFile`], [Save to STEP/STL/DXF/G-code], [✗],
  [`Undo` / `Redo`], [Navigate command history], [—],
  [`RunDfm`], [Trigger DFM analysis], [✗],
  [`GenerateToolpath`], [Compute CNC toolpath + G-code], [✗],
  [`EnterSketchMode`], [Activate sketch editing on a plane/face], [✗],
  [`ExitSketchMode`], [Commit sketch and return to 3D modeling], [✗],
  [`ActivateTool`], [Switch active sketch tool (Line, Circle, Arc, etc.)], [✗],
  [`AddSketchEntity`], [Add point/line/circle/arc/spline to active sketch], [✓],
  [`DeleteSketchEntity`], [Remove entity from sketch (cascades constraints)], [✓],
  [`AddConstraint`], [Apply constraint to sketch entities], [✓],
  [`RemoveConstraint`], [Remove a sketch constraint], [✓],
  [`TrimEntity`], [Trim sketch entity at intersection], [✓],
  [`CopyEntities`], [Copy selected entities to clipboard], [✗],
  [`PasteEntities`], [Paste clipboard entities into sketch], [✓],
  [`SetSnapConfig`], [Configure snap types and grid spacing], [✗],
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
  [`Viewport3D.tsx`], [Center — Three.js/R3F canvas with orbit controls, entity picking, sketch overlay], [Zustand store],
  [`StatusBar.tsx`], [Bottom bar — connection status, vertex/face counts, memory, version], [Zustand store],
)

=== State Management

The frontend uses *Zustand* for global state:

```typescript
interface EditorStore {
  // 3D Model State
  features: Feature[];
  selectedId: string | null;
  viewMode: ViewMode;
  material: Material | null;
  dfmScore: number | null;
  // Sketch State
  activeSketchId: string | null;
  sketchEntities: SketchEntity[];
  sketchConstraints: Constraint[];
  activeTool: ToolType | null;
  snapConfig: SnapConfig;
  // Connection
  isConnected: boolean;
  // Actions (37 Tauri invoke wrappers)
  createFeature: (feature: Feature) => Promise<void>;
  enterSketchMode: (planeId: string) => Promise<void>;
  activateTool: (tool: ToolType) => void;
  addSketchEntity: (entity: SketchEntity) => Promise<void>;
  addConstraint: (constraint: Constraint) => Promise<void>;
  solveConstraints: () => Promise<SolveResult>;
  // ... 30+ more actions
}
```

=== Tauri IPC Bridge

Communication between React and Rust uses Tauri's typed IPC:

```typescript
// Frontend → Rust (37 registered IPC handlers)
await invoke('import_file', { path: filePath });
await invoke('create_feature', { feature: newFeature });
await invoke('enter_sketch_mode', { planeId, sketchId });
await invoke('add_sketch_entity', { sketchId, entity });
await invoke('add_constraint', { sketchId, constraint });
await invoke('solve_constraints', { sketchId });
await invoke('activate_tool', { toolType: 'line' });
const estimate = await invoke('estimate_cost', { material, geometry });

// Rust → Frontend (events)
listen('feature-tree-updated', (event) => { ... });
listen('sketch-updated', (event) => { ... });
listen('constraint-solved', (event) => { ... });
```

=== Technology Stack

#grid(
  columns: (1fr, 1fr, 1fr),
  column-gutter: 8pt,
  row-gutter: 8pt,
  tech-badge("React 18.3", color: r3ditor-sky),
  tech-badge("TypeScript 5.6", color: r3ditor-blue),
  tech-badge("Tailwind CSS", color: r3ditor-sky),
  tech-badge("Zustand 5.0", color: r3ditor-purple),
  tech-badge("Vite 6.4.1", color: r3ditor-accent),
  tech-badge("Three.js 0.170", color: r3ditor-green),
)
