# CAD Platform Workflow Research — User Interactions, Routines & Productivity Features

> **Research covering:** Fusion 360, Onshape, TinkerCAD, SALOME, FreeCAD
> **Purpose:** Identify universal patterns to implement in r3ditor

---

## Table of Contents

1. [Fusion 360](#1-fusion-360)
2. [Onshape](#2-onshape)
3. [TinkerCAD](#3-tinkercad)
4. [SALOME Platform](#4-salome-platform)
5. [FreeCAD](#5-freecad)
6. [Universal Patterns & r3ditor Implementation Plan](#6-universal-patterns--r3ditor-implementation-plan)

---

## 1. Fusion 360

### 1.1 Core User Workflows

#### Sketch → Extrude → Modify (The "80% Workflow")
```
1. Click face or construction plane → "Create Sketch"
2. Sketch tools: Line (L), Rectangle (R), Circle (C), Arc (A)
3. Add dimensions (D) — fully constrain the sketch (green = good)
4. "Finish Sketch" (checkmark or Escape)
5. Select sketch profile → Extrude (E)
6. Set distance, direction (One Side / Two Sides / Symmetric)
7. Operation: New Body / Join / Cut / Intersect
8. OK (Enter)
9. Modify: Fillet (F) or Chamfer on edges
10. Repeat — each operation appears on Timeline
```

#### Assembly Workflow
```
1. Insert → Component (from file or Part Studio)
2. First component auto-grounds (fixed)
3. Assemble → Joint (J)
4. Select geometry on two components
5. Joint type: Rigid / Revolute / Slider / Cylindrical / Pin-Slot / Planar / Ball
6. Set offsets / limits
7. Repeat for all joints
8. Motion → Animate to verify
```

#### Drawing Workflow
```
1. File → New Drawing → From Design
2. Select component → Place base view
3. Right-click → Projected View (auto creates front/side/top)
4. Add dimensions (click edge → place dimension)
5. Add annotations: GD&T, notes, balloons
6. Title block auto-fills from component properties
```

### 1.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **S-Key Command Palette** | Press `S` → searchable floating toolbar, shows recently used commands, customizable |
| **Marking Menu** | Right-click → radial menu with 8 context-sensitive commands (press & flick) |
| **Timeline** | Bottom bar: every operation in sequence, drag to reorder, right-click to edit/suppress/delete |
| **Direct Modeling + History** | Unique hybrid: can push/pull faces directly OR edit history features |
| **Component Color Coding** | Active component = blue highlight, others greyed out |
| **Capture Design History** | Toggle ON/OFF per document — parametric vs direct |
| **Browser Tree** | Left panel: Components → Bodies → Sketches → Construction → Joints |
| **Selection Filters** | Bottom bar: Body / Face / Edge / Vertex / Component filter toggles |
| **Measure Tool** | Click any two entities → instant distance/angle readout |
| **Section Analysis** | Real-time cutting plane through model |
| **Interference Detection** | Assembly → Interference → auto-highlights collisions |

### 1.3 Keyboard Shortcuts (Fusion 360)

#### General
| Key | Action |
|-----|--------|
| `S` | Command search / toolbar |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save |
| `Ctrl+C/V` | Copy / Paste |
| `Delete` | Delete selection |
| `Ctrl+1` | Front view |
| `Ctrl+2` | Back view |
| `Ctrl+3` | Top view |
| `Ctrl+4` | Bottom view |
| `Ctrl+5` | Right view |
| `Ctrl+6` | Left view |
| `Ctrl+0` | Home / Isometric |
| `F6` | Toggle grid |
| `Shift+1` | Shaded display |
| `Shift+2` | Shaded with edges |
| `Shift+3` | Wireframe |

#### Sketch Mode
| Key | Action |
|-----|--------|
| `L` | Line |
| `C` | Circle (center-point) |
| `R` | Rectangle (2-point) |
| `A` | Arc (3-point) |
| `D` | Dimension |
| `X` | Construction mode toggle |
| `T` | Trim |
| `O` | Offset |
| `P` | Project geometry |
| `M` | Move/Copy |
| `Escape` | Finish current tool / exit sketch |

#### Modeling
| Key | Action |
|-----|--------|
| `E` | Extrude |
| `Q` | Press/Pull (Direct Edit) |
| `H` | Hole |
| `F` | Fillet |
| `J` | Joint (Assembly) |
| `M` | Move |
| `Ctrl+D` | Duplicate |

### 1.4 Mouse Interaction

| Action | Input |
|--------|-------|
| **Orbit** | Middle mouse button drag |
| **Pan** | Middle mouse button + Shift |
| **Zoom** | Scroll wheel |
| **Zoom to fit** | Double-click middle mouse |
| **Select** | Left click |
| **Multi-select** | Ctrl + left click |
| **Window select** | Left-to-right drag = window, Right-to-left = crossing |
| **Context menu** | Right click (Marking Menu) |

### 1.5 Common Routines (10+ times per session)

1. **Orbit around model** — MMB drag constantly
2. **Select face → Create Sketch** — start every feature
3. **Dimension a sketch** — D key, click, type value
4. **Extrude** — E, type distance, Enter
5. **Undo/Redo** — Ctrl+Z/Y rapid iteration
6. **Toggle visibility** — Eye icon in Browser
7. **Edit feature from Timeline** — double-click to re-enter
8. **Fillet edges** — F, select edges, type radius
9. **Measure** — right-click → Measure
10. **View cube click** — snap to standard view

---

## 2. Onshape

### 2.1 Core User Workflows

#### Part Studio Workflow (Multi-Body)
```
1. Open Part Studio (default tab)
2. Click face → Sketch tool → draw geometry
3. Use sketch constraints (automatic + manual)
4. Exit sketch → Extrude / Revolve / Sweep / Loft
5. Feature List on left shows parametric history
6. Right-click feature → Edit / Suppress / Rollback
7. Multiple parts in same Part Studio = contexts
8. Insert Part Studio into Assembly tab
```

#### Real-Time Collaboration
```
1. Share document (View / Edit / Copy permissions)
2. Multiple users edit simultaneously
3. See other users' cursors and selections in real-time
4. Branch for experimental changes
5. Merge branches (3-way merge on feature list)
6. Version history — full state at any point
```

#### Assembly Workflow
```
1. New Assembly tab
2. Insert → Part Studio parts auto-appear
3. First part = fixed (grounded)
4. Mate connector origins on geometry
5. Fasten / Revolute / Slider / Cylindrical / Pin Slot / Planar / Ball / Parallel
6. Mate connectors auto-infer from geometry
7. Exploded view → animate
```

### 2.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Part Studio** | Multiple bodies in one workspace, boolean between them |
| **Feature List** | Left panel: parametric history, editable at any point |
| **Branching & Versioning** | Git-like: create branch, merge, view diffs |
| **FeatureScript** | Custom parametric features via scripting language |
| **Configurations** | One part, multiple variants (size/material/options) |
| **In-Context Editing** | Edit a part while seeing assembly context |
| **Linked Documents** | Reference parts across documents (like Git submodules) |
| **Follow Mode** | Watch another user's viewport in real-time |
| **Custom Tables** | Configuration tables like spreadsheets |
| **Integrated Drawings** | Auto-updating drawings from 3D model |

### 2.3 Keyboard Shortcuts (Onshape)

| Key | Action |
|-----|--------|
| `Shift+S` | Sketch on face |
| `Shift+E` | Extrude |
| `Shift+W` | Revolve |
| `Shift+L` | Loft |
| `Shift+F` | Fillet |
| `Shift+C` | Chamfer |
| `L` | Line (in sketch) |
| `C` | Circle (in sketch) |
| `R` | Rectangle (in sketch) |
| `D` | Dimension (in sketch) |
| `N` | Normal to sketch plane |
| `F` | Zoom to fit |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Escape` | Deselect / exit tool |

### 2.4 Mouse Interaction

| Action | Input |
|--------|-------|
| **Orbit** | Right mouse button drag |
| **Pan** | Middle mouse button drag |
| **Zoom** | Scroll wheel |
| **Select** | Left click |
| **Multi-select** | Ctrl + click |
| **Box select** | Shift + drag |

### 2.5 Common Routines

1. **Create Sketch on face** — click face, Shift+S
2. **Draw lines with auto-constraints** — L, click points, constraints auto-apply
3. **Dimension everything** — D, click, type value
4. **Extrude** — Shift+E, distance, direction
5. **Edit feature** — double-click in Feature List
6. **Suppress feature** — right-click → Suppress
7. **Roll back** — drag rollback bar in Feature List
8. **Create version** — right-click → Create Version (checkpoint)
9. **Branch** — Create Branch → experiment → merge back
10. **Check mass properties** — right-click part → Mass Properties

---

## 3. TinkerCAD

### 3.1 Core User Workflows

#### Drag-Drop-Boolean (Beginner Pattern)
```
1. Drag shape from right panel → drop on workplane
2. Resize using corner handles or type dimensions
3. Position using move arrows or align tool
4. Drag second shape
5. Select both → click "Group" (= boolean union)
6. To cut: set shape to "Hole" mode → Group with solid
7. That's it — no sketches, no constraints, no history
```

#### Align & Distribute
```
1. Select multiple objects
2. Click "Align" button
3. Choose alignment point (left/center/right on each axis)
4. Objects snap to alignment
5. "Distribute" spaces objects evenly
```

#### Import & Modify
```
1. Import → SVG, STL, OBJ
2. SVG auto-extrudes to 3D
3. STL appears as mesh body
4. Scale, rotate, position
5. Group with other shapes for boolean
```

### 3.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Shape Panel** | Right sidebar: Basic (Box, Sphere, Cylinder, Cone, Torus, Wedge), Characters, Connectors, etc. |
| **Solid / Hole Toggle** | Any shape can be Solid (orange) or Hole (grey striped) — Group applies boolean |
| **Workplane Tool** | Drop a custom workplane on any face → build on that surface |
| **Ruler Tool** | Attach ruler to edge → type precise dimensions |
| **Align Tool** | Select multiple → auto-align centers/edges |
| **Copy + Paste on Workplane** | Ctrl+C, click new position → paste at location |
| **Undo/Redo** | Simple linear undo, no parametric history |
| **Shape Generators** | Community-created parametric shapes (gears, text, springs) |
| **Codeblocks** | Visual programming (Scratch-like) to generate geometry |
| **Multi-Color Export** | Export colored models for multi-material printing |

### 3.3 Keyboard Shortcuts (TinkerCAD)

| Key | Action |
|-----|--------|
| `W` | Move to workplane |
| `D` | Drop to workplane |
| `L` | Lock selection |
| `R` | Ruler |
| `Ctrl+C/V` | Copy / Paste |
| `Ctrl+Z/Y` | Undo / Redo |
| `Ctrl+G` | Group (boolean union/cut) |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+D` | Duplicate |
| `Ctrl+L` | Align |
| `Ctrl+H` | Toggle Hole/Solid |
| `Delete` | Delete selection |
| `1-0` | Snap to standard views |

### 3.4 Mouse Interaction

| Action | Input |
|--------|-------|
| **Orbit** | Right mouse drag |
| **Pan** | Middle mouse drag / Shift + right mouse |
| **Zoom** | Scroll wheel |
| **Select** | Left click |
| **Move** | Click + drag (on move arrows) |
| **Resize** | Click + drag (on corner dots) |
| **Rotate** | Click + drag (on curved rotation arrows) |

### 3.5 Common Routines

1. **Drag shape from panel** — constant for every creation
2. **Resize with handles** — corner dots, type values
3. **Set to Hole mode** — click shape, click "Hole" in inspector
4. **Group** — Ctrl+G for every boolean
5. **Ungroup** — Ctrl+Shift+G to go back
6. **Align** — Ctrl+L when positioning
7. **Duplicate** — Ctrl+D for arrays
8. **Drop to workplane** — D to reset Z position
9. **Type dimension** — click handle, type number
10. **Zoom to fit** — F key

---

## 4. SALOME Platform

### 4.1 Core User Workflows

#### GEOM Module Workflow
```
1. New Study → Activate GEOM module
2. New Entity → Primitives → Box (enter Lx, Ly, Lz)
3. New Entity → Primitives → Cylinder (center, axis, R, H)
4. Operations → Boolean → Cut/Fuse/Common/Section
5. Select shape1 → select shape2 → Apply
6. Operations → Transformation → Translation/Rotation/Mirror/Scale
7. Repair → Shape Processing → fix tolerances
8. Measurement → Point Coordinates / Edge Length / Surface Area
9. Export → BREP / STEP / IGES / STL
```

#### MESH Module Workflow
```
1. Switch to MESH module (top dropdown)
2. Create Mesh → select geometry from Object Browser
3. Assign hypotheses (1D: NumberOfSegments, 2D: Triangle, 3D: Tetrahedron)
4. Compute → visualize → Check Quality (Aspect Ratio, Warping, etc.)
5. Export mesh → MED / UNV / DAT format
```

#### Python TUI Integration
```python
# Every GUI action logs the equivalent Python command:
import salome
salome.salome_init()
import GEOM
from salome.geom import geomBuilder
geompy = geomBuilder.New()

box = geompy.MakeBoxDXDYDZ(200, 200, 200)
cyl = geompy.MakeCylinder(geompy.MakeVertex(0,0,0),
                          geompy.MakeVectorDXDYDZ(0,0,1), 80, 300)
cut = geompy.MakeCut(box, cyl)
geompy.addToStudy(cut, "Cut Result")
```

### 4.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Object Browser** | Tree view: all geometry, meshes, groups, sub-shapes |
| **Python Console** | Every action = logged Python code, can replay/script |
| **Study Management** | Save/Load study (HDF file), dump study as Python script |
| **Module Architecture** | GEOM → MESH → SMESH → field-specific (YACS, ParaVis) |
| **Group Management** | Create geometry groups (faces, edges, vertices) for boundary conditions |
| **Measurement Tools** | Point coords, basic properties, check shape validity |
| **Shape Healing** | Operations → Repair → Sewing, Close Contour, Suppress Faces |
| **Explode** | Decompose compound into sub-shapes (faces, edges, vertices) |
| **Partition** | Split shapes at intersections for meshing |
| **Notebooks** | YACS workflow orchestration for batch processing |

### 4.3 Navigation & Mouse

#### Standard SALOME Navigation
| Action | Input |
|--------|-------|
| **Rotate** | Ctrl + Middle mouse drag |
| **Pan** | Ctrl + Right mouse drag |
| **Zoom** | Ctrl + Left mouse drag (up/down) |
| **Zoom wheel** | Scroll wheel |
| **Fit All** | Ctrl+F |
| **Select** | Left click |
| **Multi-select** | Shift + left click |
| **Rectangle select** | Shift + left drag |

#### Keyboard-Free Navigation (alternative)
| Action | Input |
|--------|-------|
| **Rotate** | Middle mouse drag |
| **Pan** | Right mouse drag |
| **Zoom** | Middle + Right drag |

### 4.4 Key Shortcuts (SALOME)

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+F` | Fit all in view |
| `0` | Isometric view |
| `1` | Front view |
| `2` | Back view |
| `3` | Top view |
| `4` | Bottom view |
| `5` | Left view |
| `6` | Right view |
| `F1` | Help |
| `Ctrl+N` | New study |
| `Ctrl+S` | Save study |

### 4.5 Common Routines

1. **Create primitive** — New Entity → Primitives → type dimensions
2. **Boolean operation** — Operations → Boolean → select shapes
3. **Add to study** — every shape must be published
4. **Switch modules** — dropdown selector (GEOM ↔ MESH ↔ SMESH)
5. **Explode compound** — extract faces for group creation
6. **Create groups** — select sub-shapes → New Group
7. **Check shape** — Measurement → Check Shape (for valid B-Rep)
8. **Dump study** — File → Dump Study → Python script
9. **Transform** — Operations → Transformation
10. **Export** — File → Export → STEP/BREP/STL

---

## 5. FreeCAD

### 5.1 Core User Workflows

#### PartDesign Workflow (Recommended)
```
1. Create new document
2. Part Design workbench (dropdown or Ctrl+Shift+P)
3. Create Body (single solid container)
4. Create Sketch → select plane (XY, XZ, YZ, or face)
5. Draw geometry (auto-constraints appear: blue = construction)
6. Fully constrain sketch (DOF counter = 0, sketch turns green)
7. Close sketch → Pad (Extrude)
8. Set distance, direction, type (Dimension, ToFirst, ToLast, ThroughAll)
9. New Sketch on face → Pocket (cut), Fillet, Chamfer
10. Each operation in Model tree → double-click to edit
```

#### Sketcher Workflow (Detailed)
```
1. Create Sketch (selects plane)
2. Grid appears, sketch plane positioned
3. Draw tools: Line, Rectangle, Circle, Arc, Ellipse, B-Spline, Polyline
4. Auto-constraints during drawing:
   - Coincident (red dot when near point)
   - Horizontal/Vertical (blue lines when near axis)
   - Tangent (when near curve)
5. Manual constraints:
   - Select geometry → Sketch → Constrain menu
   - Or toolbar buttons
6. Dimension constraints: click geometry → type value
7. DOF counter: shows remaining degrees of freedom
8. Color coding:
   - White = unconstrained
   - Green = fully constrained
   - Red = over-constrained
   - Blue = construction geometry
9. Finish Sketch → Close
```

#### Assembly Workflow (A2plus / Assembly4)
```
1. Import parts as links
2. Fix first part
3. Select faces/edges/points on two parts
4. Add constraint: Coincident / Plane / Axial / Angle
5. Solver runs automatically (real-time preview)
6. Repeat until fully constrained
```

### 5.2 Key Productivity Features

| Feature | Description |
|---------|-------------|
| **Workbench System** | 20+ workbenches: Part Design, Sketcher, Part, Assembly, FEM, Path, Draft, Arch, etc. |
| **Python Console** | Every action logged as Python, full scripting API |
| **Combo View** | Left panel: Model tree + Task panel (context-sensitive parameters) |
| **Selection View** | Shows what's under cursor, geometry type, coordinates |
| **Macro System** | Record & replay macros, share via addon manager |
| **Addon Manager** | Install community workbenches, macros, preference packs |
| **Expression Engine** | Type formulas in any parameter field (e.g., `Sketch.Height * 2 + 5mm`) |
| **Spreadsheet** | Built-in spreadsheet driving parametric dimensions |
| **Sketch Auto-Constraints** | Automatic coincident, horizontal, vertical during drawing |
| **DOF Counter** | Real-time degrees of freedom display in sketch |
| **Element Colors** | Per-face/edge color assignment |
| **Cross-Section** | Clipping plane tool for inspection |

### 5.3 Keyboard Shortcuts (FreeCAD)

| Key | Action |
|-----|--------|
| `V` then `F` | Fit all |
| `V` then `T` | Top view |
| `V` then `R` | Right view |
| `V` then `O` | Toggle ortho/perspective |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+N` | New document |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `P` | Pad (extrude) |
| `K` | Pocket (cut) |
| `B` | Create Body |
| `S` | Create Sketch |
| `I` | Toggle grid |
| `G` then `L` | Line (sketch) |
| `G` then `C` | Circle (sketch) |
| `G` then `R` | Rectangle (sketch) |
| `G` then `A` | Arc (sketch) |
| `Space` | Toggle visibility |
| `Ctrl+Shift+P` | Switch workbench |

### 5.4 Mouse Navigation Styles

FreeCAD supports 10+ configurable navigation styles:

#### CAD Navigation (Default)
| Action | Input |
|--------|-------|
| **Orbit** | Middle mouse drag |
| **Pan** | Middle mouse + Shift |
| **Zoom** | Scroll wheel |
| **Select** | Left click |
| **Zoom fit** | `V` then `F` |

#### Blender Navigation
| Action | Input |
|--------|-------|
| **Orbit** | Middle mouse drag |
| **Pan** | Shift + Middle mouse |
| **Zoom** | Scroll wheel |

#### Gesture Navigation (Touchpad)
| Action | Input |
|--------|-------|
| **Orbit** | Right mouse drag |
| **Pan** | Two-finger drag |
| **Zoom** | Pinch / Ctrl + Right mouse |

### 5.5 Common Routines

1. **Create Sketch on plane** — select plane, click Sketch
2. **Draw & constrain** — line tool + auto-constraints
3. **Add dimensions** — click edge + type value
4. **Close sketch** — when DOF = 0
5. **Pad/Pocket** — create/remove material
6. **Fillet edges** — select edges → Part Design → Fillet
7. **Edit feature** — double-click in Model tree
8. **Switch workbench** — dropdown or Ctrl+Shift+P
9. **Check model** — Part → Check Geometry
10. **Toggle visibility** — Space bar

---

## 6. Universal Patterns & r3ditor Implementation Plan

### 6.1 Universal Patterns (Found in ALL Platforms)

| # | Pattern | F360 | Onshape | TinkerCAD | SALOME | FreeCAD |
|---|---------|------|---------|-----------|--------|---------|
| 1 | **Undo/Redo** (Ctrl+Z/Y) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | **Selection + multi-select** (Click + Ctrl+Click) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | **Orbit/Pan/Zoom** (MMB/Shift+MMB/Scroll) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | **Zoom to fit** (double-click MMB or F key) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | **Standard views** (Front/Back/Top/Left/Right/Iso) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | **Delete** (Delete key) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | **Copy/Paste** (Ctrl+C/V) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 8 | **Save** (Ctrl+S) | ✅ | ✅ | Auto | ✅ | ✅ |
| 9 | **Toggle visibility** (eye icon or Space) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 10 | **Entity tree** (left panel browser) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 11 | **Properties panel** (right panel inspector) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 12 | **Context menu** (right-click) | ✅ | ✅ | ✅ | ✅ | ✅ |

### 6.2 Sketch Workflow (Universal 5-Step Pattern)

```
Every CAD platform follows this sequence:

1. SELECT PLANE    — Click face or origin plane
2. ENTER SKETCH    — Sketch mode activates (grid, 2D tools)
3. DRAW GEOMETRY   — Line, Circle, Rectangle, Arc
4. CONSTRAIN       — Dimensions + geometric constraints (DOF → 0)
5. EXIT SKETCH     — Return to 3D, profile ready for features
```

Platform differences:

| Step | Fusion 360 | Onshape | FreeCAD | SALOME |
|------|-----------|---------|---------|--------|
| Enter sketch | Click face → Create Sketch | Shift+S on face | Select plane → S key | GEOM → Sketch (dialog) |
| Auto-constraints | Yes (inferred) | Yes (aggressive) | Yes (configurable) | No (manual) |
| DOF display | No counter (color only) | No counter | **Yes — numeric counter** | No |
| Constraint colors | Blue/black | Blue/grey | **White→Green→Red** | N/A |
| Exit | Click checkmark / Escape | Click checkmark | Close Sketch button | OK in dialog |

### 6.3 Feature Creation Pattern (Universal)

```
Every platform follows this for 3D features:

1. SELECT — Pick target body/face/edge
2. ACTIVATE — Choose feature (extrude, fillet, chamfer, etc.)
3. CONFIGURE — Dialog/panel with parameters (distance, angle, type)
4. PREVIEW — Live 3D preview of result
5. CONFIRM — OK/Enter to apply, Cancel/Escape to abort
```

### 6.4 Prioritized Patterns for r3ditor Implementation

#### Must-Have (Universal, Expected by All Users)

| Priority | Feature | Details |
|----------|---------|---------|
| P0 | **Keyboard shortcuts system** | Configurable, single-key in sketch mode (L/C/R/A/D), Ctrl+combos for actions |
| P0 | **Command palette** | Fusion 360's S-key: searchable command list with recent commands |
| P0 | **Standard view snapping** | Numpad/Ctrl+1-6 for Front/Back/Top/Bottom/Left/Right/Iso |
| P0 | **Selection filters** | Toggle: Body / Face / Edge / Vertex / Component |
| P0 | **Zoom to fit** | F key or double-click MMB |
| P0 | **Copy/Paste entities** | Ctrl+C/V with offset placement |
| P0 | **Context menu (right-click)** | Edit / Delete / Suppress / Toggle Visibility / Properties |
| P0 | **Feature editing** | Double-click timeline/tree item → re-enter feature dialog with current params |
| P0 | **Escape to cancel** | Universal cancel: Escape exits any tool, dialog, or mode |
| P0 | **Live preview** | Show preview geometry during feature creation (transparent/wireframe) |

#### High Value (Differentiating)

| Priority | Feature | Source |
|----------|---------|--------|
| P1 | **Marking menu** | Fusion 360 — right-click radial menu, press & flick gestures |
| P1 | **Timeline rollback** | Fusion 360/Onshape — drag rollback bar to any point |
| P1 | **DOF counter in sketch** | FreeCAD — real-time "Degrees of Freedom: N" display |
| P1 | **Constraint color coding** | FreeCAD — White (unconstrained) → Green (fully constrained) → Red (over-constrained) |
| P1 | **Auto-constraints** | FreeCAD/Fusion 360 — automatic coincident, H/V, tangent during drawing |
| P1 | **Measure tool** | All — click 2 entities → distance/angle readout |
| P1 | **Section analysis** | Fusion 360 — real-time cutting plane |
| P1 | **Expression engine** | FreeCAD — formulas in dimension fields |
| P1 | **Box/Window selection** | All — Left-to-right = window select, right-to-left = crossing |
| P1 | **Quick dimension** | Draw → immediately asked for dimension value |

#### Nice to Have (Power User)

| Priority | Feature | Source |
|----------|---------|--------|
| P2 | **Python/Script console** | FreeCAD/SALOME — log all actions as script |
| P2 | **Branching** | Onshape — branch design, merge changes |
| P2 | **Configurations** | Onshape — one part, multiple variant configs |
| P2 | **Shape generators** | TinkerCAD — parametric community shapes |
| P2 | **Custom workplanes** | TinkerCAD — drop workplane on any face |
| P2 | **Navigation style picker** | FreeCAD — choose Blender/CAD/Fusion/Inventor style |
| P2 | **Grid snap settings** | All — configurable grid size + snap interval |
| P2 | **Interference detection** | Fusion 360 — assembly collision check |
| P2 | **Mass properties** | All — volume, surface area, center of mass readout |
| P2 | **Exploded view** | Fusion 360/Onshape — assembly explosion animation |

### 6.5 Mouse/Keyboard Configuration Matrix

```
Default: Fusion 360-style (most popular)

┌─────────────────────────────────────────────────────────────┐
│  Mouse Mapping                                               │
│  ─────────────                                               │
│  Left click          → Select                                │
│  Ctrl + Left click   → Add to selection                      │
│  Left drag           → Box/Window select                     │
│  Right click         → Context menu / Marking menu           │
│  Middle drag         → Orbit                                 │
│  Shift + Middle drag → Pan                                   │
│  Scroll              → Zoom                                  │
│  Double-click MMB    → Zoom to fit                           │
│                                                              │
│  Keyboard Mapping                                            │
│  ────────────────                                            │
│  Escape              → Cancel / Exit tool / Deselect         │
│  Delete              → Delete selection                      │
│  Space               → Toggle visibility                     │
│  S                   → Command palette (search)              │
│  F                   → Zoom to fit                           │
│  1-6                 → Standard views (Front/Back/Top/etc.)  │
│  L                   → Line (sketch mode)                    │
│  C                   → Circle (sketch mode)                  │
│  R                   → Rectangle (sketch mode)               │
│  A                   → Arc (sketch mode)                     │
│  D                   → Dimension (sketch mode)               │
│  X                   → Construction toggle (sketch mode)     │
│  T                   → Trim (sketch mode)                    │
│  E                   → Extrude                               │
│  Q                   → Press/Pull                            │
│  H                   → Hole                                  │
│  J                   → Joint (assembly)                      │
│  M                   → Move                                  │
│  Ctrl+Z              → Undo                                  │
│  Ctrl+Y              → Redo                                  │
│  Ctrl+S              → Save                                  │
│  Ctrl+C / Ctrl+V     → Copy / Paste                         │
│  Ctrl+D              → Duplicate                             │
│  Ctrl+G              → Group (boolean)                       │
│  Ctrl+Shift+G        → Ungroup                               │
│  Ctrl+1 through 6    → Standard views (alternative)         │
│  Ctrl+0              → Home / Isometric                      │
│  F6                  → Toggle grid                           │
│  Shift+1/2/3         → Shaded / Shaded+Edges / Wireframe    │
└─────────────────────────────────────────────────────────────┘
```

### 6.6 UI Layout Pattern (Consensus Across All Platforms)

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────── Top Bar ────────────────────────────────┐ │
│  │ Logo │ File │ Edit │ Save │ Undo/Redo │ DocName │ Account  │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────── Toolbar ────────────────────────────────┐ │
│  │ Workspace Tabs │ Create ▼ │ Modify ▼ │ Assemble ▼ │ Tools │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌─────┬──────────────────────────────────────────┬──────────┐ │
│  │     │                                          │          │ │
│  │  B  │                                          │  Props   │ │
│  │  r  │               3D Viewport                │  Panel   │ │
│  │  o  │          (Three.js / WebGL)              │          │ │
│  │  w  │                                          │ Material │ │
│  │  s  │                                          │ Physical │ │
│  │  e  │          [ViewCube in corner]            │  Notes   │ │
│  │  r  │                                          │          │ │
│  │     │                                          │          │ │
│  ├─────┴──────────────────────────────────────────┴──────────┤ │
│  │  Timeline: [Sketch1] [Pad1] [Sketch2] [Pocket1] [▶ ──]   │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │  Status: "3 edges selected" │ DOF: 2 │ Grid: 1mm │ Snap  │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Implementation Checklist for r3ditor

### Phase 1: Core Interactions (P0)
- [ ] Keyboard shortcut registry with configurable bindings
- [ ] Command palette (S-key, searchable, recent commands)
- [ ] Standard view snapping (1-6 keys + Ctrl variants)
- [ ] Selection filter system (Body/Face/Edge/Vertex/Component toggles)
- [ ] Zoom to fit (F key + double-click MMB)
- [ ] Copy/Paste entities with offset placement
- [ ] Context menu system (right-click with edit/delete/suppress/visibility)
- [ ] Feature re-editing (double-click tree → reopen dialog with params)
- [ ] Escape cancellation (exit any tool/dialog/mode)
- [ ] Live preview during feature creation

### Phase 2: Sketch Enhancements (P0-P1)
- [ ] Single-key sketch tools (L/C/R/A/D/X/T)
- [ ] DOF counter display in status bar
- [ ] Constraint color coding (unconstrained→constrained→overconstrained)
- [ ] Auto-constraint during drawing (coincident, H/V, tangent)
- [ ] Quick dimension (auto-prompt after drawing)
- [ ] Snap to grid with configurable grid size

### Phase 3: Productivity Features (P1)
- [ ] Marking menu (right-click radial, 8 sectors)
- [ ] Timeline rollback (drag bar to any position)
- [ ] Measure tool (click 2 entities → distance/angle)
- [ ] Section analysis (real-time cutting plane)
- [ ] Expression engine in parameter fields
- [ ] Box/Window selection (left-to-right vs right-to-left)

### Phase 4: Advanced (P2)
- [ ] Script console (log actions as commands)
- [ ] Navigation style picker (Fusion/Blender/FreeCAD)
- [ ] Mass properties display
- [ ] Configurations / variants
- [ ] Custom workplanes on faces
