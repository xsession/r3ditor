# CAD Platform UX Research — Comprehensive Interaction Workflow Report

> **Purpose**: Reference document for implementing CAD interaction patterns in r3ditor
> **Date**: March 2026
> **Platforms**: Fusion 360, Onshape, TinkerCAD, SALOME, FreeCAD

---

## Table of Contents

1. [Autodesk Fusion 360](#1-autodesk-fusion-360)
2. [Onshape](#2-onshape)
3. [TinkerCAD](#3-tinkercad)
4. [SALOME Platform](#4-salome-platform)
5. [FreeCAD](#5-freecad)
6. [Cross-Platform Comparison Matrix](#6-cross-platform-comparison-matrix)

---

## 1. Autodesk Fusion 360

### 1.1 Core User Workflows

#### Sketch-to-Solid Workflow (Most Common)
```
1. Select workspace → "Design" (default)
2. Click "Create Sketch" in toolbar
3. Select a plane (XY, XZ, YZ) or face → enters Sketch mode
4. Draw profile using sketch tools (Line, Rectangle, Circle, Arc, Spline)
5. Apply constraints (Horizontal, Vertical, Coincident, Tangent, etc.)
6. Apply dimensions (click geometry → type value → Enter)
7. Click "Finish Sketch" (or press Esc/Stop Sketch)
8. Select sketch profile → choose operation:
   - Extrude (E) → drag or type distance → OK
   - Revolve → select axis → OK
   - Sweep → select path → OK
   - Loft → select profiles → OK
9. Feature appears in Timeline (bottom) and Browser (left)
10. Repeat: select face → new sketch → new feature
```

#### Component Assembly Workflow
```
1. Right-click in Browser → "New Component"
2. Activate component (double-click in Browser)
3. Create geometry inside component
4. Use "Assemble > Joint" to connect components
5. Select snap points on each component
6. Choose joint type (Rigid, Revolute, Slider, etc.)
7. Component hierarchy visible in Browser tree
```

#### Direct Modeling (Freeform) Workflow
```
1. Switch to direct modeling by pressing/pulling faces
2. Press Pull (Q) → select face → drag or type value
3. No need for sketch — works on existing geometry
4. Can toggle "Capture Design History" on/off
   - ON: parametric (features appear in Timeline)
   - OFF: direct modeling (no Timeline tracking)
```

#### Workspace Switching
```
Design → Render → Animation → Simulation → Manufacture → Drawing
- Each workspace has its own toolbar ribbon
- Switching is via dropdown/tabs at top-left of toolbar
- Context changes completely (different tools, panels)
```

### 1.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Timeline** | Parametric history bar at bottom; drag to reorder features; right-click to edit/suppress/delete; drag marker to roll back |
| **Marking Menu** | Right-click radial menu — 8 most-used commands in a circle; direction-based muscle memory |
| **Data Panel** | Left collapsible panel for project/file management; cloud-based storage |
| **Browser** | Tree view of components, bodies, sketches, features; drag to reorder |
| **Parametric Dimensions** | Click dimension → change value → entire model updates downstream |
| **S shortcut box** | Press `S` to open a searchable command box (like VS Code Command Palette) |
| **Command Search** | Press `/` or use the search icon to find any command by name |
| **Repeat Last Command** | Press `Enter` to repeat the last used command |

### 1.3 Unique UX Patterns

- **Marking Menu (Right-Click Radial)**: Right-click shows a radial/pie menu with 8 context-sensitive commands arranged in a circle. Users develop directional muscle memory (e.g., right-click → drag-up for Extrude). This is Fusion's signature UX element.
- **Timeline-Based Parametric History**: All features recorded in a filmstrip-like Timeline at the bottom. Users can scrub, reorder, and edit history. Features can be suppressed (disabled) without deletion.
- **Workspace Switching**: Completely changes the toolbar/ribbon and available tools while keeping the same model. Seamless transition between CAD, CAM, simulation.
- **In-Canvas Dimension Input**: When sketching, dimension values appear as editable text fields directly on the canvas near the geometry.
- **Sketch Palette**: Side panel during sketch mode with toggle options (show constraints, show dimensions, snap settings).
- **ViewCube**: 3D orientation cube in top-right corner; click faces/edges/corners for standard views. Drag to orbit freely.
- **Component Activation**: Double-click a component in the Browser to "activate" it — all other components become semi-transparent.

### 1.4 Keyboard Shortcuts & Hotkeys

| Shortcut | Action |
|----------|--------|
| `S` | Open shortcut/command search box |
| `Q` | Press Pull (direct edit) |
| `E` | Extrude |
| `L` | Line |
| `C` | Circle |
| `R` | Rectangle |
| `D` | Dimension |
| `X` | Construction toggle (sketch) |
| `T` | Trim |
| `O` | Offset |
| `M` | Move/Copy |
| `J` | Joint |
| `P` | Project |
| `I` | Measure |
| `A` | Appearance |
| `F` | Fillet |
| `H` | Hole |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save |
| `Ctrl+C/V` | Copy/Paste |
| `Delete` | Delete selected |
| `Esc` | Cancel current tool / exit sketch |
| `Enter` | Confirm / Repeat last command |
| `1` | Front view |
| `2` | Back view |
| `3` | Top view |
| `4` | Bottom view |
| `5` | Left view |
| `6` | Right view |
| `7` | Home (isometric) view |
| `Shift+1` | Fit all |
| `Ctrl+0` | Home view |

### 1.5 Mouse Interaction Patterns

| Action | Mouse Input |
|--------|-------------|
| **Orbit** | Middle mouse button (hold + drag) |
| **Pan** | Middle mouse button + Shift (hold + drag) |
| **Zoom** | Scroll wheel |
| **Zoom to fit** | Double-click middle mouse button |
| **Select** | Left click |
| **Multi-select** | Ctrl + Left click |
| **Window select** | Left-to-right drag (objects fully inside) |
| **Crossing select** | Right-to-left drag (objects touching) |
| **Context menu** | Right click (opens Marking Menu) |
| **Marking menu** | Right click + drag in direction → release |
| **Double-click** | Edit feature / Enter sketch / Activate component |

### 1.6 Common Routines (10+ Times Per Session)

1. **Orbit/Pan/Zoom** — constant viewport navigation
2. **Create Sketch → Draw → Constrain → Dimension → Close** — core modeling loop
3. **Extrude (E)** — most-used 3D operation
4. **Undo (Ctrl+Z)** — frequent corrections
5. **Select face → Right-click → Create Sketch** — sketch on existing geometry
6. **Dimension (D)** — applying/editing dimensions
7. **Fillet (F)** — rounding edges
8. **Press Pull (Q)** — quick direct edits
9. **Toggle construction geometry (X)** — in sketch mode
10. **Double-click Timeline feature → edit** — parametric editing

---

## 2. Onshape

### 2.1 Core User Workflows

#### Part Studio Multi-Body Workflow
```
1. Open Document → Part Studio tab (at bottom)
2. Click "Sketch" on toolbar → select plane
3. Sketch profile using tools (Line, Arc, Circle, Rectangle, Spline)
4. Close sketch (green checkmark or Esc)
5. Select sketch → "Extrude" (or other feature)
6. Feature appears in Feature List (left panel)
7. Multiple bodies can exist in same Part Studio
8. Use Boolean operations to combine/subtract bodies
9. Create Part Studio → Assembly tab to assemble parts
```

#### Collaborative Editing Workflow
```
1. Share document with team (via link or email)
2. Multiple users edit simultaneously (like Google Docs)
3. Each user sees others' cursors/selections in real-time
4. Follow mode: click user avatar to follow their view
5. Comments can be attached to specific features/geometry
6. Changes are auto-saved continuously (no manual save)
```

#### Version & Branch Management (Git-like)
```
1. Create Version (snapshot) — immutable point in time
2. Create Branch (workspace) from any version
3. Work independently on branch
4. Merge branch back to main workspace
5. Compare versions side-by-side
6. History shows all changes with timestamps and users
```

#### Feature List Workflow
```
1. Features listed in left panel in creation order
2. Right-click feature → Edit, Suppress, Delete, Rename
3. Drag features to reorder (with constraints)
4. Roll-back bar: drag to suppress all features after a point
5. Feature groups: organize features into collapsible groups
6. Edit feature: dialog reopens with original parameters
```

### 2.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Part Studio** | Multi-body design environment; multiple parts in one context |
| **Feature List** | Left-panel list of all operations; roll-back bar for history |
| **Real-time Collaboration** | Multiple users edit same doc simultaneously |
| **Version/Branch** | Git-like version control; immutable versions, workspaces |
| **FeatureScript** | Built-in parametric scripting language for custom features |
| **Configurations** | Table-driven variants of same design (sizes, options) |
| **Linked Documents** | Reference geometry across documents |
| **Follow Mode** | Watch another user's view in real-time |
| **Custom Features** | User-created features via FeatureScript (community shared) |

### 2.3 Unique UX Patterns

- **Browser-Based**: Runs entirely in web browser; no installation. Works on any OS.
- **Tab-Based Documents**: Bottom tabs for Part Studios, Assemblies, Drawings — like spreadsheet tabs.
- **Persistent Auto-Save**: No save button needed. All changes saved automatically with microsecond-level versioning.
- **Context Menus on Feature List**: Rich right-click menus on features (edit, suppress, rename, add comment, group).
- **Mate Connectors**: Explicit snap points for assembly mates; can be placed on any geometry.
- **In-Context Editing**: Edit parts in the assembly context; changes propagate to Part Studio.
- **Measure Tool Integration**: Always-available measurement that snaps to edges, faces, and inferred geometry.
- **Instance Editing**: Editing one instance of a shared part updates all instances.

### 2.4 Keyboard Shortcuts & Hotkeys

| Shortcut | Action |
|----------|--------|
| `Shift+E` | Extrude |
| `Shift+S` | Sketch |
| `Shift+F` | Fillet |
| `Shift+C` | Chamfer |
| `Shift+Q` | Section view |
| `Shift+H` | Toggle hidden objects |
| `L` | Line (in sketch) |
| `A` | Arc (in sketch) |
| `C` | Circle (in sketch) |
| `R` | Rectangle (in sketch) |
| `D` | Dimension (in sketch) |
| `N` | Normal to sketch plane |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+C/V` | Copy/Paste |
| `Delete` | Delete selection |
| `Esc` | Exit current tool |
| `F` | Zoom to fit |
| `Space` | Toggle selection filter |
| `O` | Offset (in sketch) |
| `T` | Trim (in sketch) |
| `M` | Mirror (in sketch) |
| `G` | Construction geometry toggle (in sketch) |

### 2.5 Mouse Interaction Patterns

| Action | Mouse Input |
|--------|-------------|
| **Orbit** | Middle mouse button (hold + drag) |
| **Pan** | Right mouse button (hold + drag) OR Ctrl + Middle mouse |
| **Zoom** | Scroll wheel |
| **Zoom to fit** | `F` key or double-click middle mouse |
| **Select** | Left click |
| **Multi-select** | Shift + Left click (add) / Ctrl + Left click (toggle) |
| **Window select** | Left-to-right drag |
| **Crossing select** | Right-to-left drag |
| **Context menu** | Right click (on object or feature) |
| **Double-click** | Edit feature / Open sketch |

### 2.6 Common Routines (10+ Times Per Session)

1. **Orbit/Pan/Zoom** — constant viewport navigation
2. **Sketch → Extrude** — primary modeling loop
3. **Dimension (D)** — constraining sketches
4. **Edit Feature** — double-click or right-click → Edit
5. **Trim (T)** — cleaning up sketch geometry
6. **Zoom to Fit (F)** — reorienting view
7. **Undo (Ctrl+Z)** — corrections
8. **Feature suppression** — right-click → Suppress in Feature List
9. **Construction toggle (G)** — switching between real and construction geometry
10. **Roll-back bar drag** — scrubbing through feature history

---

## 3. TinkerCAD

### 3.1 Core User Workflows

#### Drag-and-Drop Primitive Workflow
```
1. Open new design → workplane (flat grid) displayed
2. Browse Shape Library (right panel):
   - Basic Shapes (Box, Cylinder, Sphere, Cone, Torus, etc.)
   - Text, Numbers
   - Community shapes, Connectors
3. Drag shape from library onto workplane
4. Shape appears with resize handles
5. Click shape → drag corner handles to resize
6. Use Inspector (right) to set exact dimensions
7. Move shape by dragging on workplane
8. Lift shape (drag upward arrow) for Z positioning
```

#### Boolean / Grouping Workflow (Core Mechanism)
```
1. Place multiple primitives on workplane
2. Position/overlap shapes as desired
3. Select shapes that should become "Holes" → toggle to "Hole" mode
   (Hole = subtractive shape, shown as striped/translucent)
4. Select all involved shapes (Ctrl+A or box select)
5. Click "Group" (Ctrl+G) → merges solids, subtracts holes
6. Result is a single compound shape
7. "Ungroup" (Ctrl+Shift+G) reverses the operation
```

#### Align & Distribute Workflow
```
1. Select multiple objects
2. Click "Align" tool (bottom toolbar)
3. Alignment points appear on bounding box (corners, centers, edges)
4. Click desired alignment point → objects align
5. Works for X, Y, and Z axes independently
```

#### Copy & Duplicate Workflow
```
1. Select object → Ctrl+C, Ctrl+V (Copy/Paste)
   - Paste creates offset copy
2. Ctrl+D (Duplicate) — creates in-place duplicate
3. Alt+Drag — drag-duplicate
4. Selected object can be moved/rotated before next operation
```

### 3.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Drag-and-Drop Primitives** | Library of shapes on right panel; drag to place |
| **Hole Mode** | Toggle any shape to "Hole" (subtractive); visual striping |
| **Group/Ungroup** | Primary boolean mechanism; group = union + subtract holes |
| **Align Tool** | Visual snap-to alignment with bounding box points |
| **Ruler Tool** | Drag ruler onto workplane for precise measurements |
| **Workplane Tool** | Place a new workplane on any face for building on surfaces |
| **Multicolor** | Assign colors per primitive before grouping |
| **Shape Generators** | Parametric community shapes with sliders |

### 3.3 Unique UX Patterns

- **Extreme Simplicity**: No constraints, no parametric history, no feature tree. Pure direct manipulation.
- **Hole Paradigm**: Instead of "subtract" or "boolean difference", shapes are marked as "Hole" and grouped — very intuitive for beginners.
- **Workplane on Face**: Click a face → new workplane appears on that face for building on angled surfaces. Smart UX for teaching 3D concepts.
- **Shape Library Panel**: Right-side scrollable panel with categorized shapes. Community-contributed shapes act as pre-built components.
- **ViewCube**: Simplified 3D navigation cube (similar to Fusion 360); click to snap to standard views.
- **Inspector Bar**: Top bar shows X, Y, Z position and W, D, H dimensions with direct numeric input.
- **Snap Grid**: Objects snap to grid by default (1mm increments); hold Shift to disable snapping.
- **Keyboard-Lite**: Designed for minimal keyboard use; almost everything doable by mouse/touch.

### 3.4 Keyboard Shortcuts & Hotkeys

| Shortcut | Action |
|----------|--------|
| `Ctrl+G` | Group selection |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+C` | Copy |
| `Ctrl+V` | Paste |
| `Ctrl+D` | Duplicate |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+A` | Select all |
| `Delete` / `Backspace` | Delete selection |
| `W` | Place workplane |
| `R` | Ruler |
| `L` | Align |
| `D` | Drop to workplane |
| `M` | Mirror |
| `H` | Toggle Hole/Solid |
| `1-6` | Standard view presets |
| `Numpad 0` | Home view |
| `F` | Fit all to view |

### 3.5 Mouse Interaction Patterns

| Action | Mouse Input |
|--------|-------------|
| **Orbit** | Right mouse button (hold + drag) |
| **Pan** | Middle mouse button (hold + drag) |
| **Zoom** | Scroll wheel |
| **Select** | Left click |
| **Multi-select** | Shift + Left click |
| **Box select** | Left click + drag on empty space |
| **Move object** | Left click + drag on object |
| **Resize** | Drag corner/edge handles (white squares) |
| **Rotate** | Drag curved arrow handles |
| **Lift (Z-axis)** | Drag upward arrow (black cone) |

### 3.6 Common Routines (10+ Times Per Session)

1. **Drag shape from library** — primary creation method
2. **Resize via handles** — scaling shapes to desired size
3. **Move objects** — positioning on workplane
4. **Group (Ctrl+G)** — combining shapes
5. **Toggle Hole mode** — making subtractive shapes
6. **Orbit/Pan/Zoom** — viewport navigation
7. **Undo (Ctrl+Z)** — frequent corrections
8. **Duplicate (Ctrl+D)** — copying shapes
9. **Align (L)** — snapping objects together
10. **Set exact dimensions** — typing values in inspector

---

## 4. SALOME Platform

### 4.1 Core User Workflows

#### Geometry Creation Workflow (GEOM Module)
```
1. Launch SALOME → File > New (creates new Study)
2. Activate GEOM module via Components toolbar / Modules menu
3. Object Browser (left panel) shows study tree
4. Create geometry via menu: New Entity → Primitives → Box
5. Dialog box opens with parameters (dimensions, position)
6. Set values → Apply / Apply and Close
7. Object appears in:
   - OCC 3D Viewer (center)
   - Object Browser tree (under GEOM section)
8. Transform geometry: Operations → Translation, Rotation, etc.
9. Boolean operations: Operations → Boolean → Fuse/Cut/Common
10. Repeat to build complex geometry
```

#### Module Switching Workflow
```
1. GEOM module — create geometry
2. MESH/SMESH module — mesh geometry for FEA
3. Other modules load on demand
4. Switching modules:
   - Use Components toolbar (icons at top)
   - Or menu: View > Modules > [module name]
5. Object Browser persists across modules
6. Objects from GEOM available in MESH automatically
```

#### TUI (Python Scripting) Workflow
```
1. Python Console always available (dockable window at bottom)
2. Any GUI operation generates equivalent Python command
3. Workflow:
   - Perform actions via GUI → note Python commands in console
   - Copy/edit commands into scripts
   - Or write scripts directly:
     import salome
     from salome.geom import geomBuilder
     geompy = geomBuilder.New()
     box = geompy.MakeBoxDXDYDZ(100, 200, 300)
     geompy.addToStudy(box, "Box_1")
4. File > Dump Study → exports entire session as Python script
5. File > Load Script → replay saved script
```

#### Study Management Workflow
```
1. File > New — create new study (only one at a time)
2. File > Open — load existing .hdf study file
3. File > Save / Save As — persist to .hdf format
4. File > Dump Study — export as Python script
5. File > Properties — view metadata (author, date, modifications)
6. Study can be locked (read-only mode)
```

### 4.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Object Browser** | Tree view of all study objects; context-sensitive right-click menus |
| **OCC 3D Viewer** | OpenCascade-based viewer with extensive toolbar |
| **Python Console** | Embedded Python interpreter; all GUI actions scriptable |
| **Study Dump** | Export entire workflow as reproducible Python script |
| **NoteBook** | Define variables (parameters) that can be used in geometry parameters |
| **Module Architecture** | Plug-in modules (GEOM, MESH, SMESH) that share same data |
| **Operation Dialogs** | Each operation has a detailed dialog with preview |
| **Multi-Viewer** | Support for multiple simultaneous views (split, tab, sync) |

### 4.3 Unique UX Patterns

- **Module-Based Architecture**: Entirely modular; each capability (geometry, meshing, solving) is a separate module that loads on demand. Shares data through Object Browser.
- **Dual Python Integration**: Every GUI action has a Python TUI equivalent. Python Console is always visible. Can seamlessly switch between GUI and scripting.
- **Study Dump**: One-click export of entire session as a reproducible Python script — unique for reproducibility.
- **Operation Dialogs with Preview**: Each operation opens a dialog box with parameters; preview in viewer updates live as parameters change.
- **Object Browser as Central Hub**: All objects from all modules visible in one tree. Objects can be renamed, hidden, deleted, grouped.
- **Keyboard-Free Navigation Mode**: Special mode where all view operations (orbit, pan, zoom) use only mouse buttons — no keyboard needed.
- **Multi-View Support**: Can open multiple synchronized viewers; split horizontally/vertically; synchronize camera between views.
- **Dockable Window System**: All panels (Object Browser, Python Console, viewers) are dockable and can be rearranged, hidden, or detached.

### 4.4 Keyboard Shortcuts & Hotkeys

| Shortcut | Action |
|----------|--------|
| `S` | Select object in viewer (when viewer has focus) |
| `Shift+S` | Add/remove from selection |
| `N` | Next selectable object (under cursor) |
| `P` | Previous selectable object (under cursor) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save study |
| `Ctrl+Shift+S` | Save study as |
| `Ctrl+N` | New study |
| `Ctrl+O` | Open study |
| `Ctrl+W` | Close study |

### 4.5 Mouse Interaction Patterns

#### Standard Navigation Mode (Salome Controls)
| Action | Mouse Input |
|--------|-------------|
| **Zoom** | Ctrl + Left mouse button (hold + drag) OR scroll wheel |
| **Pan** | Ctrl + Middle mouse button (hold + drag) |
| **Rotate/Orbit** | Ctrl + Right mouse button (hold + drag) |
| **Select** | Left click |
| **Multi-select** | Shift + Left click |
| **Rectangle select** | Left mouse button drag (rubber band) |
| **Polyline select** | Right mouse button drag, Left click to add points |
| **Circle select** | Left mouse button drag (circular rubber band) |

#### Keyboard-Free Navigation Mode
| Action | Mouse Input |
|--------|-------------|
| **Rotate/Orbit** | Left mouse button (hold + drag) |
| **Pan** | Middle mouse button (hold + drag) |
| **Zoom** | Right mouse button (hold + drag) |
| **Rectangle select** | Ctrl + Left mouse button drag |
| **Polyline select** | Ctrl + Right mouse button drag |

### 4.6 Common Routines (10+ Times Per Session)

1. **Create primitives** (Box, Cylinder, Sphere) via menu/toolbar
2. **Set parameters in operation dialog** → Apply
3. **Orbit/Pan/Zoom** — viewport navigation
4. **Object Browser selection** — clicking objects in tree
5. **Display/hide objects** — right-click → Show/Hide in Object Browser
6. **Boolean operations** (Fuse, Cut, Common) — combining geometry
7. **Transform** (Translate, Rotate, Mirror) — positioning
8. **Python console interaction** — typing/pasting commands
9. **Undo (Ctrl+Z)** — corrections
10. **Rename objects** in Object Browser for organization

---

## 5. FreeCAD

### 5.1 Core User Workflows

#### PartDesign Body Workflow (Primary)
```
1. Launch FreeCAD → select "Part Design" workbench
2. Create new Body: Part Design > Body
3. Create Sketch: click "New Sketch" → select plane (XY/XZ/YZ)
4. Sketch mode activates:
   - Sketcher toolbar appears
   - View aligns to sketch plane
   - Combo View shows Tasks panel (sketch tools + constraints)
5. Draw closed profile: Line, Arc, Circle, Rectangle, etc.
6. Apply constraints: Horizontal, Vertical, Coincident, Tangent...
7. Apply dimensions: Constrain > Dimension (select edges/points)
8. Close sketch: click "Close" in Tasks panel (or Esc)
9. Select sketch → apply PartDesign feature:
   - Pad (extrude)
   - Pocket (cut)
   - Revolution (revolve)
   - Groove (revolve cut)
10. Feature appears in Model tree (Combo View)
11. Select face → new sketch → next feature
12. Repeat to build complex solid
```

#### Workbench Switching Workflow
```
1. Workbench selector (dropdown in toolbar area)
2. Key workbenches:
   - Part Design — parametric solid modeling
   - Part — CSG boolean operations
   - Sketcher — 2D constrained sketching
   - Draft — 2D drawing (AutoCAD-like)
   - Mesh — mesh editing
   - FEM — finite element analysis
   - Path — CAM toolpaths
   - TechDraw — 2D drawings from 3D models
3. Each workbench changes:
   - Toolbar content
   - Menu content
   - Available operations
4. Objects persist across workbenches in Model tree
```

#### Sketcher Workflow (Detailed)
```
1. Enter Sketch Mode:
   - Click "New Sketch" or double-click existing sketch
   - Select attachment plane/face
   - View auto-rotates to face sketch plane
2. Draw Geometry:
   - Polyline (multi-segment line, most used)
   - Line, Arc, Circle, Ellipse, Rectangle, Polygon
   - B-Splines (by control points or knots)
   - Slot, Arc slot
3. Apply Geometric Constraints:
   - Coincident (merge points)
   - Horizontal / Vertical (align edges)
   - Parallel / Perpendicular
   - Tangent / Equal / Symmetric
   - Block (lock geometry)
4. Apply Dimensional Constraints:
   - Distance (length)
   - Horizontal/Vertical distance
   - Radius / Diameter
   - Angle
   - Lock (fix point to coordinates)
5. Monitor constraint status:
   - Green = fully constrained
   - White = under-constrained
   - Red = over-constrained
   - Orange = redundant constraint
6. Auto-Constraints: enabled by default, suggest constraints as you draw
7. Snapping: snap to grid, edges, midpoints, intersections
8. Close Sketch: "Close" button in Tasks panel
```

### 5.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Combo View** | Left panel with Model tree (top) and Tasks panel (bottom) |
| **Model Tree** | Hierarchical view of all objects, bodies, features, sketches |
| **Tasks Panel** | Context-sensitive panel showing current operation parameters |
| **Selection View** | Displays selected sub-elements (vertices, edges, faces) with details |
| **Python Console** | Built-in Python interpreter; all commands logged and scriptable |
| **Report View** | Log window showing messages, warnings, errors |
| **Property Editor** | View/edit properties of selected objects (Data + View properties) |
| **Expression Engine** | Link dimensions with formulas (spreadsheet-like) |
| **Constraint Solver** | Real-time visual feedback on sketch constraint status |
| **Multiple Navigation Styles** | 10+ configurable mouse navigation presets |

### 5.3 Unique UX Patterns

- **Workbench System**: Completely swappable tool environments. Each workbench is essentially a different application sharing the same document. More flexible but steeper learning curve.
- **Combo View (Model + Tasks)**: Unique dual-purpose left panel — top half is the tree view, bottom half dynamically shows the current operation's parameters/options.
- **Constraint Color Coding**: Sketch constraints use intuitive color system: green (fully constrained), white (under-constrained), red (over-constrained), orange (redundant).
- **Auto-Constraints**: As you draw in Sketcher, constraints are auto-suggested with visual icons near the cursor. Click to accept.
- **On-View Parameters (v1.0+)**: When drawing, dimensional input fields appear directly on the canvas near the geometry being created.
- **Multiple Navigation Modes**: 10+ preset navigation styles (CAD, Blender, Maya, OpenCascade, TinkerCAD, Revit, etc.) — user chooses their preferred style.
- **Python Logging**: Every GUI action generates Python equivalent in console — superb for learning scripting and automation.
- **Feature Editing Methodology**: Each feature (Pad, Pocket, etc.) depends on its sketch. Editing the sketch automatically updates the feature. Tree shows dependencies.

### 5.4 Keyboard Shortcuts & Hotkeys

| Shortcut | Action |
|----------|--------|
| `V` then `O` | Toggle orthographic/perspective |
| `V` then `F` | Fit all |
| `V` then number | Standard views (1=Front, 2=Rear, 3=Top, etc.) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+C/X/V` | Copy/Cut/Paste (also in Sketcher v1.0+) |
| `Ctrl+N` | New document |
| `Ctrl+O` | Open document |
| `Ctrl+S` | Save |
| `Delete` | Delete selection |
| `Esc` | Cancel current tool / Exit sketch mode |
| `S` | Snap on/off (in Sketcher) |
| `G` | Toggle grid (in Sketcher) |
| `B` | Toggle B-spline control polygon visibility |
| `Numpad 0` | Fit all |
| `Numpad 1` | Front view |
| `Numpad 2` | Rear view |
| `Numpad 3` | Top view |
| `Numpad 4` | Bottom view |
| `Numpad 5` | Right view |
| `Numpad 6` | Left view |
| `PgUp/PgDn` | Zoom in/out |
| `Arrow keys` | Pan view |
| `Shift + Left/Right` | Rotate view 90° |

### 5.5 Mouse Interaction Patterns

FreeCAD supports **10+ navigation styles**, selectable from status bar or preferences. Here are the main ones:

#### CAD Navigation (Default)
| Action | Mouse Input |
|--------|-------------|
| **Select** | Left click |
| **Multi-select** | Ctrl + Left click |
| **Zoom** | Scroll wheel (middle click re-centers view) |
| **Orbit (Method 1)** | Middle button (hold) → press+hold Left button → drag |
| **Orbit (Method 2)** | Middle button (hold) → press+hold Right button → drag |
| **Pan** | Middle button (hold) → drag |
| **Zoom mode** | Ctrl + Shift + Right click → drag |
| **Rotate mode** | Shift + Right click → drag |
| **Pan mode** | Ctrl + Right click → drag |
| **Re-center** | Double-click middle button |

#### Blender Navigation
| Action | Mouse Input |
|--------|-------------|
| **Select** | Left click |
| **Zoom** | Scroll wheel |
| **Orbit** | Middle button (hold + drag) |
| **Pan** | Shift + Middle button (hold + drag) |

#### Gesture Navigation
| Action | Mouse Input |
|--------|-------------|
| **Select** | Left click |
| **Zoom** | Scroll wheel |
| **Orbit** | Left button (hold + drag) [Alt in Sketcher mode] |
| **Pan** | Right button (hold + drag) |
| **Tilt** | Both left+right buttons + drag sideways |

#### Maya-Gesture Navigation
| Action | Mouse Input |
|--------|-------------|
| **Select** | Left click |
| **Zoom** | Scroll wheel OR Alt + Right button + drag |
| **Orbit** | Alt + Left button + drag |
| **Pan** | Alt + Middle button + drag |

#### TinkerCAD Navigation
| Action | Mouse Input |
|--------|-------------|
| **Select** | Left click |
| **Zoom** | Scroll wheel |
| **Orbit** | Right button + drag |
| **Pan** | Middle button + drag |

#### OpenCascade Navigation
| Action | Mouse Input |
|--------|-------------|
| **Select** | Left click |
| **Zoom** | Scroll wheel OR Ctrl + Left button + drag |
| **Orbit** | Middle button + hold Right button + drag OR Ctrl + Right button + drag |
| **Pan** | Middle button + drag (Ctrl optional) |

### 5.6 Common Routines (10+ Times Per Session)

1. **Orbit/Pan/Zoom** — constant viewport navigation
2. **Enter/exit Sketch mode** — primary modeling entry point
3. **Draw lines/polylines** — most common sketch tool
4. **Apply constraints** (Coincident, Horizontal, Vertical) — constraining sketch
5. **Apply dimensions** — setting exact sizes
6. **Pad (extrude)** — most common 3D operation
7. **Select face → new sketch** — sketch-on-face workflow
8. **Edit sketch** (double-click) — parametric editing
9. **Undo (Ctrl+Z)** — frequent corrections
10. **Switch workbenches** — moving between PartDesign, Part, Sketcher
11. **Check Python console** — verifying commands for scripting

---

## 6. Cross-Platform Comparison Matrix

### 6.1 Navigation Patterns

| Platform | Orbit | Pan | Zoom | Select |
|----------|-------|-----|------|--------|
| **Fusion 360** | MMB drag | Shift+MMB drag | Scroll | LMB |
| **Onshape** | MMB drag | RMB drag | Scroll | LMB |
| **TinkerCAD** | RMB drag | MMB drag | Scroll | LMB |
| **SALOME (std)** | Ctrl+RMB drag | Ctrl+MMB drag | Ctrl+LMB / Scroll | LMB |
| **SALOME (kbfree)** | LMB drag | MMB drag | RMB drag | S key |
| **FreeCAD (CAD)** | MMB+LMB drag | MMB drag | Scroll | LMB |
| **FreeCAD (Blender)** | MMB drag | Shift+MMB drag | Scroll | LMB |

### 6.2 Feature Comparison

| Feature | Fusion 360 | Onshape | TinkerCAD | SALOME | FreeCAD |
|---------|-----------|---------|-----------|--------|---------|
| Parametric History | ✅ Timeline | ✅ Feature List | ❌ | ✅ Object Browser | ✅ Model Tree |
| Sketch Constraints | ✅ Full | ✅ Full | ❌ None | ✅ Full (GEOM) | ✅ Full |
| Boolean Operations | ✅ | ✅ | ✅ Group/Hole | ✅ | ✅ |
| Python Scripting | ✅ (API) | ✅ (FeatureScript) | ❌ | ✅ (TUI, Console) | ✅ (Console) |
| Real-time Collab | ✅ (limited) | ✅ (native) | ❌ | ❌ | ❌ |
| Version Control | ✅ (cloud) | ✅ (Git-like) | ❌ | ✅ (Study) | ❌ (manual save) |
| Workbench/Workspace | ✅ | ✅ (tabs) | ❌ | ✅ (modules) | ✅ (workbenches) |
| Marking Menu | ✅ (radial) | ❌ | ❌ | ❌ | ❌ |
| ViewCube | ✅ | ✅ | ✅ | ✅ | ✅ |
| Direct Modeling | ✅ | ✅ (Move Face) | ✅ (primary) | ❌ | ❌ |
| Command Search | ✅ (S key) | ✅ (search bar) | ❌ | ❌ | ❌ |
| Open Source | ❌ | ❌ | ❌ | ✅ | ✅ |

### 6.3 Workflow Paradigm Comparison

| Platform | Primary Paradigm | Target Users | Complexity |
|----------|-----------------|--------------|------------|
| **Fusion 360** | Timeline-based parametric + direct modeling | Professionals, prosumers | Medium-High |
| **Onshape** | Feature List parametric + collaboration | Teams, enterprises | Medium-High |
| **TinkerCAD** | Direct manipulation with CSG grouping | Beginners, education | Very Low |
| **SALOME** | Module-based engineering workflow | Engineers, researchers | Very High |
| **FreeCAD** | Workbench-based parametric with Python | Makers, engineers, developers | High |

### 6.4 Key Patterns for r3ditor Implementation

#### Must-Have Patterns (common across all platforms)
1. **Orbit/Pan/Zoom** with configurable navigation styles
2. **ViewCube** for quick standard view orientation
3. **Object/Feature tree** in left panel
4. **Undo/Redo** stack with Ctrl+Z/Y
5. **Selection** with multi-select (Ctrl/Shift+click), box select, crossing select
6. **Standard views** via keyboard (numpad or number keys)
7. **Context menus** on right-click (platform-appropriate)
8. **Dimension/constraint system** for precise modeling
9. **Sketch mode** (enter/draw/constrain/exit pattern)
10. **Zoom to fit** shortcut

#### High-Value Differentiating Patterns
1. **Marking Menu** (Fusion 360) — radial right-click menu for rapid access
2. **Command Palette** (Fusion 360 `S` key) — searchable command box
3. **Feature rollback bar** (Fusion/Onshape) — scrub through feature history
4. **Python Console** (SALOME/FreeCAD) — scriptable operations
5. **Configurable navigation** (FreeCAD) — let users choose their preferred style
6. **Keyboard-free mode** (SALOME) — mouse-only navigation option
7. **Auto-constraints** (FreeCAD/Fusion) — suggest constraints while drawing
8. **On-view parameter input** (FreeCAD v1.0/Fusion) — dimension fields on canvas
9. **Hole/Solid paradigm** (TinkerCAD) — simplified boolean concept
10. **Real-time collaboration** (Onshape) — multi-user editing

#### Recommended Navigation Default (r3ditor)
Based on the most common patterns across all 5 platforms:
```
Orbit:      Middle mouse button (hold + drag)  [Fusion/Onshape/FreeCAD-Blender]
Pan:        Shift + Middle mouse button         [Fusion/FreeCAD-Blender]
Zoom:       Scroll wheel                        [Universal]
Select:     Left click                          [Universal]
Multi-sel:  Ctrl + Left click                   [Universal]
Context:    Right click                         [Universal]
Fit All:    F key                               [Onshape/FreeCAD]
Home View:  Numpad 0 or 7                       [Fusion/FreeCAD]
```

---

## Appendix: Sketch Workflow Comparison

### Universal Sketch Pattern (all parametric platforms)
```
1. ENTER SKETCH MODE
   - Select plane or face → activate sketch environment
   - View auto-aligns to sketch plane
   - Sketch-specific toolbar appears

2. DRAW GEOMETRY
   - Lines, arcs, circles, rectangles, splines
   - Click-to-place paradigm (click start → click end)
   - Polyline mode for continuous drawing
   - Esc or right-click to exit current tool

3. APPLY CONSTRAINTS
   - Geometric: Horizontal, Vertical, Coincident, Tangent, Parallel, Perpendicular, Equal, Symmetric
   - Dimensional: Length, Distance, Angle, Radius, Diameter
   - Auto-constraints (suggest as you draw)
   - Constraint status indicator (colors / DoF count)

4. CLOSE SKETCH
   - Explicit close action (button, Esc, or context menu)
   - Returns to 3D view
   - Sketch available for 3D operations

5. CREATE 3D FEATURE FROM SKETCH
   - Extrude/Pad, Revolve, Sweep, Loft
   - Feature references sketch → parametric link
```

### Platform-Specific Sketch Differences

| Aspect | Fusion 360 | Onshape | FreeCAD | SALOME |
|--------|-----------|---------|---------|--------|
| Enter sketch | Click "Create Sketch" | "Sketch" button | "New Sketch" button | N/A (point/line tools) |
| Plane selection | Click plane/face | Click plane/face | Click plane/face | Implicit |
| Constraint display | Icons on geometry | Icons on geometry | Color-coded geometry | Dialog-based |
| Dimension input | On-canvas text field | On-canvas text field | On-canvas (v1.0+) / dialog | Dialog only |
| Close sketch | "Finish Sketch" / Esc | Green checkmark | "Close" in Tasks | N/A |
| Profile detection | Auto-detect regions | Auto-detect regions | Must be closed contour | N/A |
| Auto-constraints | Yes | Yes | Yes (configurable) | No |
| Construction geom | Toggle: X key | Toggle: G key | Toggle button | Separate tools |
