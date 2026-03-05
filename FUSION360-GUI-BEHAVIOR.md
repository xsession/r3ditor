# Fusion 360 GUI Behavior — Detailed Reference

> Extracted from: **"Fusion 360 Year 2025 | Beginners Guide | 30 minute Guide to 3D Design | Step-by-Step"**
> Channel: Autodesk CAD Tutorials — https://youtu.be/7lKpzGtoQX0
> Purpose: Reference document for r3ditor UI implementation.

---

## 1. Overall Layout (Top-to-Bottom)

```
┌──────────────────────────────────────────────────────────────┐
│ APPLICATION BAR (File menu, Save, Undo/Redo, Extension, ?)  │
├──────────────────────────────────────────────────────────────┤
│ TOOLBAR (Workspace tabs + Tool groups contextual ribbon)     │
├────────┬─────────────────────────────────────┬───────────────┤
│        │                                     │               │
│ BROWSER│         3D VIEWPORT / CANVAS        │ INSPECTOR /   │
│ (left) │                                     │ PROPERTIES    │
│        │                                     │ (right,       │
│        │                                     │  collapsible) │
│        │                                     │               │
├────────┴─────────────────────────────────────┴───────────────┤
│ TIMELINE (parametric feature history, bottom strip)          │
├──────────────────────────────────────────────────────────────┤
│ NAVIGATION BAR + DISPLAY SETTINGS (bottom center)            │
└──────────────────────────────────────────────────────────────┘
ViewCube: top-right corner of viewport
```

---

## 2. Application Bar (Topmost Row)

| Position | Element | Label / Icon | Behavior |
|----------|---------|-------------|----------|
| Far-left | **File menu** (☰ hamburger / grid icon) | `File` | Opens dropdown: New Design, Open, Save, Save As, Export, 3D Print, Share, Recent |
| Left | **Save** | 💾 (floppy icon) | Saves current document to cloud |
| Left | **Undo** | ↩ `Ctrl+Z` | Undo last action |
| Left | **Redo** | ↪ `Ctrl+Y` | Redo last undone action |
| Center | **Document title** | e.g. "Untitled" | Editable inline; click to rename |
| Right | **Notifications** | 🔔 bell | Shows cloud sync, rendering status |
| Right | **Job Status** | ☁ cloud | Cloud processing indicator |
| Right | **Help** | `?` | Opens learning panel, search help topics |
| Right | **My Profile** | Avatar circle | Account settings, preferences |

### Key Behaviors:
- **File > New Design** creates a blank parametric design
- **File > Export** offers: F3D, STEP, IGES, STL, OBJ, SAT, SMT, 3MF, DXF
- **File > 3D Print** sends directly to slicer
- Application bar stays constant across all workspaces

---

## 3. Toolbar (Primary Interaction — Changes by Workspace)

### 3.1 Workspace Tabs (Left side of toolbar)

The toolbar starts with a **workspace switcher dropdown**:

| Workspace | Icon | Purpose |
|-----------|------|---------|
| **DESIGN** | 🔧 cube | Part modeling — main workspace (default) |
| **RENDER** | 🎨 scene | Photorealistic rendering |
| **ANIMATION** | 🎬 film | Exploded view animations |
| **SIMULATION** | 📊 analysis | FEA stress/thermal analysis |
| **MANUFACTURE** | ⚙ gear | CAM toolpaths, G-code |
| **DRAWING** | 📐 paper | 2D engineering drawings |

When user switches workspace, **the entire toolbar ribbon changes**.

### 3.2 DESIGN Workspace Toolbar Tabs

The Design workspace has these **tab groups** in the toolbar:

```
[SOLID ▼] [SURFACE ▼] [SHEET METAL ▼] [MESH ▼] [PLASTIC ▼] [UTILITIES ▼]
```

Each tab is a **dropdown** that reveals its tool group. The selected tab's tools are also shown as **quick-access icons** in the ribbon.

---

### 3.3 SOLID Tab — Tool Groups (Most Important)

#### CREATE group
| Tool | Icon | Keyboard | Behavior |
|------|------|----------|----------|
| **New Component** | 📦+ | — | Creates new component in assembly context |
| **Create Sketch** | ✏ pencil | `S` opens search | Pick a plane/face → enters sketch mode |
| **Extrude** | ⬆ arrow up | `E` | Select profile → set distance, direction, operation |
| **Revolve** | 🔄 circular arrow | — | Select profile + axis → set angle |
| **Sweep** | 🌊 path arrow | — | Select profile + path → sweep along path |
| **Loft** | 📐 dual profiles | — | Select 2+ profiles → create smooth blend |
| **Rib** | 🦴 rib shape | — | Add structural rib to thin features |
| **Web** | 🕸 web shape | — | Create web features between walls |
| **Hole** | ⭕ circle with depth | `H` | Select face → set diameter, depth, type (simple/counterbore/countersink/tapped) |
| **Thread** | 🔩 threaded cylinder | — | Select cylindrical face → set thread spec |
| **Box** | ▢ 3D box | — | Create primitive box |
| **Cylinder** | ⬤ 3D cylinder | — | Create primitive cylinder |
| **Sphere** | ● 3D sphere | — | Create primitive sphere |
| **Torus** | 🍩 torus | — | Create primitive torus |
| **Coil** | 🌀 helix | — | Create coil/helix |
| **Pipe** | 🔧 pipe | — | Create pipe along path |
| **Pattern** | ⊞ array | — | Sub-menu: Rectangular Pattern, Circular Pattern, Pattern on Path |
| **Mirror** | ⟷ mirror line | — | Mirror features across a plane |
| **Thicken** | 📏 offset | — | Thicken surface to solid |

#### MODIFY group
| Tool | Icon | Keyboard | Behavior |
|------|------|----------|----------|
| **Press Pull** | ↕ push/pull | `Q` | Directly push/pull faces, edges, features |
| **Fillet** | ◠ rounded corner | `F` | Select edges → set radius |
| **Chamfer** | ◣ angled corner | — | Select edges → set distance + angle |
| **Shell** | ◻ hollow box | — | Select face(s) to remove → set thickness |
| **Draft** | ↗ angled face | — | Select faces → set angle from pull direction |
| **Scale** | ⤢ resize | — | Scale body uniformly or non-uniformly |
| **Combine** | ⊕ boolean | — | Union / Cut / Intersect between bodies |
| **Replace Face** | ↔ face swap | — | Replace face with another surface |
| **Split Body** | ✂ split | — | Split body with plane/face |
| **Split Face** | ✂ face split | — | Split face with line/plane |
| **Move/Copy** | ↗ move arrow | `M` | Move or copy bodies/components |
| **Align** | ⫿ align | — | Align faces/edges between parts |
| **Physical Material** | 🎨 material | — | Assign material (aluminum, steel, etc.) |
| **Manage Materials** | 📋 material list | — | Material library browser |
| **Appearance** | 🖌 paintbrush | `A` | Assign visual appearance |
| **Change Parameters** | 🔢 params | — | Edit named dimensions |

#### ASSEMBLE group
| Tool | Icon | Behavior |
|------|------|----------|
| **As-built Joint** | 🔗 joint | Create joint between components at current position |
| **Joint** | 🔗⚙ joint setup | Define joint with mate connectors |
| **Joint Origin** | 🎯 origin point | Define mate connector point |
| **Rigid Group** | 🔒 lock group | Lock multiple components together |
| **Tangent Relationship** | ↗ tangent | Make components tangent |
| **Motion Link** | ⚙↔⚙ gears | Link joint motions (gear ratios) |

#### CONSTRUCT group
| Tool | Icon | Behavior |
|------|------|----------|
| **Offset Plane** | ═ parallel plane | Create plane at offset distance |
| **Plane at Angle** | ∠ angled plane | Create plane at angle to edge |
| **Tangent Plane** | ↗ plane | Create plane tangent to face |
| **Midplane** | ═ midplane | Create plane midway between two planes/faces |
| **Axis Through Cylinder** | | axis | Create axis through cylindrical face |
| **Axis Through Points** | • | •axis | Create axis through two points |
| **Point at Vertex** | • point | Create construction point |

#### INSPECT group
| Tool | Icon | Keyboard | Behavior |
|------|------|----------|----------|
| **Measure** | 📏 ruler | `I` | Click two entities → shows distance, angle |
| **Interference** | ⊗ overlap | — | Check for part collisions |
| **Section Analysis** | ✂ section | — | Create section cut plane, see cross-section |
| **Center of Mass** | ⊙ CoM | — | Show center of mass marker |
| **Component Color Cycling** | 🎨 cycle | — | Visually distinguish components |

#### INSERT group
| Tool | Icon | Behavior |
|------|------|----------|
| **Insert Derive** | 📁→ import | Link external F3D as derived design |
| **Insert Decal** | 🖼 image | Place image on face |
| **Insert Canvas** | 🖼 background | Place reference image on plane |
| **Insert Mesh** | △ mesh | Insert OBJ/STL mesh body |
| **Insert SVG** | 📄 svg | Insert SVG into sketch |
| **Insert DXF** | 📄 dxf | Insert DXF into sketch |
| **Insert McMaster-Carr** | 🔩 mcmaster | Open McMaster-Carr catalog → insert hardware |

---

### 3.4 SKETCH Mode (Activated when you click "Create Sketch" and pick a plane)

When sketch mode is active, the **toolbar completely changes** to show sketch tools:

```
[CREATE ▼] [MODIFY ▼] [CONSTRAINTS ▼] [INSPECT ▼] [INSERT ▼]  ... [FINISH SKETCH ✓]
```

#### SKETCH > CREATE
| Tool | Icon | Keyboard | Behavior |
|------|------|----------|----------|
| **Line** | ╱ line | `L` | Click two points → creates line. Chain mode by default |
| **Rectangle** | ▭ rect | `R` | Sub-menu: 2-Point Rectangle, 3-Point Rectangle, Center Rectangle |
| **Circle** | ○ circle | `C` | Sub-menu: Center Diameter Circle, 2-Point Circle, 3-Point Circle, 2-Tangent Circle, 3-Tangent Circle |
| **Arc** | ◠ arc | `A` | Sub-menu: 3-Point Arc, Center Point Arc, Tangent Arc |
| **Polygon** | ⬡ polygon | — | Sub-menu: Circumscribed Polygon, Inscribed Polygon, Edge Polygon |
| **Ellipse** | ⬮ ellipse | — | Center + major axis + minor axis |
| **Slot** | ⊂⊃ slot | — | Sub-menu: Center to Center Slot, Overall Slot, Center Point Slot |
| **Spline** | ∿ spline | — | Sub-menu: Fit Point Spline, Control Point Spline |
| **Conic Curve** | ◠ conic | — | Create conic section curve |
| **Point** | • point | — | Place sketch point |
| **Text** | T text | — | Place text on sketch plane |
| **Mirror** | ⟷ mirror | — | Mirror sketch entities about a line |
| **Circular Pattern** | ⊕ array | — | Pattern sketch entities circularly |
| **Rectangular Pattern** | ⊞ array | — | Pattern sketch entities in grid |
| **Project / Include** | ⊙ project | `P` | Project 3D edges/faces onto sketch plane |

#### SKETCH > MODIFY
| Tool | Icon | Keyboard | Behavior |
|------|------|----------|----------|
| **Fillet** | ◠ fillet | — | Round sketch corners |
| **Chamfer** | ◣ chamfer | — | Bevel sketch corners |
| **Trim** | ✂ scissors | `T` | Click segments to trim at intersections |
| **Extend** | ─→ extend | — | Extend line to next intersection |
| **Offset** | ═ offset | `O` | Offset sketch curves by distance |
| **Break** | ⊥ break | — | Break curve at point |
| **Sketch Scale** | ⤢ scale | — | Scale sketch entities |
| **Move/Copy** | ↗ move | — | Move or copy sketch entities |

#### SKETCH > CONSTRAINTS
| Constraint | Icon | Behavior |
|-----------|------|----------|
| **Coincident** | • → • | Force two points to same location |
| **Collinear** | ═ aligned | Force two lines to same infinite line |
| **Concentric** | ⊚ rings | Force arcs/circles to same center |
| **Midpoint** | •─•─• | Force point to midpoint of line |
| **Fix/Unfix** | 📌 pin | Lock entity in place |
| **Parallel** | ∥ parallel | Force lines parallel |
| **Perpendicular** | ⊥ perp | Force lines perpendicular |
| **Horizontal/Vertical** | ─ / | | Force line horizontal or vertical |
| **Tangent** | ↗○ tangent | Force curve tangent to another |
| **Smooth (G2)** | ∿ smooth | Force G2 continuity at spline junction |
| **Symmetry** | ⟷ symmetric | Force entities symmetric about line |
| **Equal** | = equal | Force lines same length / arcs same radius |
| **Sketch Dimension** | 📏 dimension | `D` — Add driving dimension to any entity |

##### Constraint Behavior:
- **Auto-constraints**: Fusion infers constraints as you sketch (H/V snaps, coincident at endpoints, tangent to arcs)
- **Blue lines** = under-constrained (can still move)
- **Black lines** = fully constrained
- **Red lines** = over-constrained (conflict)
- **DOF indicator**: Bottom-right shows "X DOF remaining" during sketch
- **Constraint icons**: Small icons appear near constrained entities (‖ for parallel, ⊥ for perpendicular, etc.)

---

## 4. Data Panel (Left Sidebar — Toggle with grid icon)

| Element | Behavior |
|---------|----------|
| **Project list** | Shows all cloud projects |
| **Recent designs** | Quick access to recent files |
| **Samples** | Pre-built example models |
| **Upload** | Upload local files to cloud |
| **Search** | Search across all projects |

The Data Panel slides out from the left and overlays the viewport. It can be pinned open or toggled. It is NOT the same as the Browser.

---

## 5. Browser (Left Panel — Always Visible)

The Browser shows the **document structure tree** (similar to Onshape's Feature Tree):

```
▼ Document Settings
▼ Named Views
  └ Home
▼ Origin
  ├ XY Plane (alias: "Top")
  ├ XZ Plane (alias: "Front")
  ├ YZ Plane (alias: "Right")
  ├ X Axis
  ├ Y Axis
  └ Z Axis
▼ Bodies
  ├ Body 1
  └ Body 2
▼ Sketches
  ├ Sketch 1
  └ Sketch 2
▼ Construction
  └ Plane 1
```

### Browser Behaviors:
- **Click** item → selects in viewport
- **Right-click** item → context menu (Edit, Rename, Delete, Suppress, Show/Hide)
- **Eye icon** (👁) → toggle visibility
- **Lightbulb icon** → toggle visibility of entire folder
- **Drag** items → reorder (limited)
- **Double-click** sketch → enters sketch edit mode
- **Expand/Collapse** arrows → show/hide children
- Components are nested in the tree for assemblies

---

## 6. Timeline (Bottom Strip — Parametric History)

The Timeline is the **parametric feature history**. It's a horizontal strip at the bottom showing every operation in order.

```
[Sketch1] → [Extrude1] → [Fillet1] → [Sketch2] → [Extrude2] → [Chamfer1] → [Hole1]
```

### Timeline Behaviors:
| Action | Behavior |
|--------|----------|
| **Click feature** | Selects it, highlights in viewport |
| **Double-click feature** | Opens feature for editing (re-enters dialog) |
| **Right-click feature** | Context menu: Edit, Delete, Suppress, Move, Group, Create Base Feature |
| **Drag feature** | Reorder in timeline (may cause errors if dependencies break) |
| **Rollback bar** (yellow/orange marker) | Drag to roll back model to earlier state |
| **Suppress** (right-click) | Temporarily disable feature without deleting |
| **Feature icons** | Each feature has a unique icon matching its type |
| **Error markers** | Red ⚠ on failed features; yellow ⚠ on warnings |
| **Group** | Drag-select multiple features → Group them |

### Feature States in Timeline:
- **Normal**: Feature icon shown clearly
- **Suppressed**: Feature icon shown faded/grey with strikethrough
- **Error**: Red warning triangle overlay
- **Editing**: Feature highlighted in blue

---

## 7. Navigation Bar (Bottom Center)

The Navigation Bar sits at the bottom center of the viewport:

```
[Orbit 🔄] [Look At 👁] [Pan ✋] [Zoom 🔍] [Fit All ⬜] [Display Settings ⚙]
```

| Tool | Icon | Keyboard/Mouse | Behavior |
|------|------|---------------|----------|
| **Orbit** | 🔄 circle arrows | Middle-click drag | Tumble/rotate view around model |
| **Look At** | 👁 eye target | — | Click face → view looks perpendicular to it |
| **Pan** | ✋ hand | Middle-click + Shift | Pan view |
| **Zoom** | 🔍 magnifier | Scroll wheel | Zoom in/out |
| **Fit All** | ⬜ fit icon | `F6` | Fits all visible geometry to viewport |

### Display Settings (⚙ gear at right end of nav bar):
| Setting | Options |
|---------|---------|
| **Visual Style** | Shaded, Shaded with Visible Edges Only, Shaded with Hidden Edges, Wireframe |
| **Environment** | Show/hide environment background |
| **Effects** | Shadows, Ground Reflections, Ambient Occlusion |
| **Object Visibility** | Show/hide: Sketches, Bodies, Construction, Joints, Contacts, Named Views, Origin |
| **Grid & Snaps** | Layout Grid, Snap to Grid |
| **Camera** | Perspective / Orthographic toggle |

---

## 8. ViewCube (Top-Right of Viewport)

A 3D orientation cube with labeled faces:

```
        ┌──────┐
        │ TOP  │
   ┌────┼──────┼────┐
   │LEFT│ FRONT│RIGHT│
   └────┼──────┼────┘
        │BOTTOM│
        └──────┘
```

### ViewCube Behaviors:
- **Click face** (FRONT, TOP, RIGHT, etc.) → snaps to that orthographic view
- **Click edge** → snaps to edge view (e.g., Front-Top)
- **Click corner** → snaps to isometric view
- **Drag cube** → free orbit
- **Home icon** (🏠) next to cube → snap to default isometric home view
- **Right-click cube** → Set current view as Home, Orthographic/Perspective toggle

---

## 9. Feature Dialog Panels (Right-Side Pop-up)

When you activate a feature tool (e.g., Extrude), a **dialog panel** appears, typically docked to the right side or as a floating panel:

### Extrude Dialog Example:
```
┌─── Extrude ─────────────────┐
│ Profile:     [1 selected]    │
│ Direction:   [One Side ▼]    │
│ Extent Type: [Distance ▼]   │
│ Distance:    [10.00 mm]     │
│ Taper Angle: [0.0°]         │
│ Operation:   [New Body ▼]   │
│              ├─ New Body     │
│              ├─ Join         │
│              ├─ Cut          │
│              ├─ Intersect    │
│              └─ New Component│
│                              │
│  [OK]  [Cancel]             │
└──────────────────────────────┘
```

### Common Dialog Patterns:
- **Profile selection**: Click sketch profile(s) in viewport — blue highlight
- **Direction arrows**: Manipulator arrows in viewport to drag distance
- **Dropdown menus**: For options like direction, operation, extent type
- **Numeric input**: Click field → type exact value → Enter
- **OK / Cancel**: Accept or discard the feature
- **Feature editing**: Double-click timeline → re-opens same dialog with current values

### Extrude Specifics:
- **Direction**: One Side, Two Sides (Symmetric), Two Sides (asymmetric)
- **Extent Type**: Distance, To Object, All, Between
- **Operation**: New Body, Join, Cut, Intersect, New Component

### Fillet Dialog:
```
┌─── Fillet ──────────────────┐
│ Edges:      [3 selected]     │
│ Type:       [Constant ▼]     │
│ Radius:     [2.00 mm]       │
│ Tangent Chain: [✓]          │
│  [OK]  [Cancel]             │
└──────────────────────────────┘
```

### Chamfer Dialog:
```
┌─── Chamfer ─────────────────┐
│ Edges:      [2 selected]     │
│ Type:       [Equal Distance ▼]│
│ Distance:   [1.00 mm]       │
│  [OK]  [Cancel]             │
└──────────────────────────────┘
```

### Shell Dialog:
```
┌─── Shell ───────────────────┐
│ Faces to Remove: [1 sel]     │
│ Inside Thickness:[1.50 mm]   │
│ Direction:  [Inside ▼]      │
│  [OK]  [Cancel]             │
└──────────────────────────────┘
```

---

## 10. Sketch Mode Behavior (User Workflow)

### Entering Sketch Mode:
1. User clicks **Create Sketch** in toolbar
2. Viewport shows **semi-transparent plane indicators** (XY, XZ, YZ + any existing faces)
3. User clicks a plane or face → camera rotates to face the plane square-on
4. Toolbar changes to sketch tools
5. Grid appears on the selected plane
6. Origin crosshair appears at plane center

### While Sketching:
- **Blue lines** = under-constrained (free to move)
- **Black/dark lines** = fully constrained
- **Green dot** = coincident snap point appearing
- **Orange dimension** = driving dimension (dragging changes geometry)
- **Inference lines** = dashed grey lines showing horizontal, vertical, tangent alignment
- **Auto-dimension**: Fusion adds dimensions automatically as you sketch (can be edited)
- **Tab key** while drawing line → toggles between X/Y input fields
- **Escape** → cancel current tool, remain in sketch
- **Right-click** → context menu (OK, Cancel, Repeat last command)

### Finishing Sketch:
- Click **Finish Sketch** (green checkmark ✓) in toolbar right side
- Or right-click → Finish Sketch
- Returns to 3D SOLID tools

### Sketch Palette (floating panel during sketch):
```
┌─── Sketch Palette ──────────┐
│ ☐ Show Constraints          │
│ ☐ Show Projected Geometry   │
│ ☐ Show Points               │
│ ☐ 3D Sketch                 │
│ ☐ Construction              │
│ ☐ Show Profile              │
│ Look At: [Sketch Plane ▼]   │
│ Slice: [✗]                  │
└──────────────────────────────┘
```

---

## 11. Part Design Workflow (Step-by-Step from Video)

The video demonstrates this exact workflow:

1. **Create Sketch** on XY plane
2. Draw **Center Rectangle** using rectangle tool
3. Add **Dimensions** (D key) — set width/height
4. **Finish Sketch**
5. **Extrude** the rectangle → set height
6. Create new **Sketch** on top face of extruded body
7. Draw **Circle** on the face
8. **Extrude > Cut** to create a hole
9. Apply **Fillet** to edges
10. Apply **Chamfer** to specific edges
11. Use **Shell** to hollow out
12. Add **Hole** feature for precise holes

### Feature Stacking:
Every operation becomes a node in the **Timeline**. Users can:
- Go back to any point by dragging the rollback bar
- Edit any feature by double-clicking it in the Timeline
- Delete/suppress features non-destructively
- The model updates parametrically when any dimension changes

---

## 12. Marking Menu (Right-Click Context)

Right-clicking in the viewport opens a **radial marking menu**:

```
        [Repeat Last]
           ↑
  [Press  ← ● → [OK]
   Pull]   ↓
        [Sketch tools...]
```

### Marking Menu Items (vary by context):
- **Repeat last command** (top)
- **OK** (right) — accept current operation
- **Cancel** (left)
- **Sketch Dimension** (if in sketch)
- **Press Pull** (if on a face)
- **Delete** (if entity selected)

---

## 13. Mouse & Keyboard Navigation

| Action | Input |
|--------|-------|
| **Orbit** | Middle mouse drag |
| **Pan** | Shift + Middle mouse drag |
| **Zoom** | Scroll wheel |
| **Select** | Left click |
| **Multi-select** | Ctrl + Left click |
| **Window select** | Left-drag (left-to-right = crossing, right-to-left = window) |
| **Deselect all** | Click empty space |
| **Context menu** | Right click |

### Key Shortcuts:
| Key | Action |
|-----|--------|
| `S` | Open search/shortcut toolbar |
| `L` | Line (in sketch) |
| `C` | Circle (in sketch) |
| `R` | Rectangle (in sketch) |
| `D` | Dimension (in sketch) |
| `T` | Trim (in sketch) |
| `O` | Offset (in sketch) |
| `P` | Project (in sketch) |
| `E` | Extrude |
| `Q` | Press Pull |
| `F` | Fillet |
| `H` | Hole |
| `M` | Move |
| `A` | Appearance |
| `I` | Measure / Inspect |
| `F6` | Fit all to viewport |
| `Esc` | Cancel / deselect |
| `Delete` | Delete selected |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save |

---

## 14. Color Scheme & Visual Design

### Fusion 360 Default Dark Theme:
| Element | Color (approx hex) |
|---------|-------------------|
| Background gradient (top) | `#3b3b3b` dark grey |
| Background gradient (bottom) | `#2b2b2b` darker grey |
| Application bar | `#333333` |
| Toolbar background | `#404040` |
| Toolbar text/icons | `#cccccc` light grey |
| Active tool highlight | `#2d8cd4` blue |
| Selected entity | `#2d8cd4` blue highlight |
| Browser background | `#333333` |
| Browser text | `#cccccc` |
| Browser hover | `#4a4a4a` |
| Timeline background | `#2d2d2d` |
| Timeline feature icon | `#888888` |
| Timeline active feature | `#2d8cd4` blue |
| Rollback bar | `#f0a030` orange |
| Dialog background | `#404040` |
| Dialog input field | `#333333` |
| OK button | `#2d8cd4` blue |
| Cancel button | `#555555` grey |
| Grid lines | `#444444` |
| Grid major lines | `#555555` |
| Origin X axis | `#ff3333` red |
| Origin Y axis | `#33ff33` green |
| Origin Z axis | `#3333ff` blue |
| Sketch: under-constrained | `#4488ff` blue lines |
| Sketch: fully constrained | `#000000` or `#cccccc` dark/light |
| Sketch: over-constrained | `#ff3333` red lines |
| Error/warning | `#ff6600` orange, `#ff3333` red |

---

## 15. Assembly Mode (within DESIGN workspace)

Fusion 360 treats assembly as part of the Design workspace using **Components**:

### Assembly Behaviors:
- **New Component**: Creates a sub-component node in the Browser
- **Joint**: Define how two components connect (revolute, slider, rigid, etc.)
- **Ground**: First component is automatically grounded
- **Motion Study**: Test joint motions with drag
- **Interference**: Check for part collisions
- **Exploded View**: In Animation workspace, not in Design

### Joint Types:
| Joint | DOF | Description |
|-------|-----|-------------|
| Rigid | 0 | No movement |
| Revolute | 1 | Rotation around axis |
| Slider | 1 | Translation along axis |
| Cylindrical | 2 | Rotation + translation on same axis |
| Pin-Slot | 2 | Rotation + translation on different axes |
| Planar | 3 | Movement on a plane |
| Ball | 3 | Rotation in all directions |

---

## 16. Key Differences from Current r3ditor Implementation

| Aspect | Fusion 360 | Current r3ditor (Onshape-style) |
|--------|-----------|-------------------------------|
| **Workspace tabs** | Dropdown: DESIGN, RENDER, etc. | Bottom tabs: Part Studio, Assembly |
| **Toolbar tabs** | SOLID / SURFACE / SHEET METAL within Design | Single contextual toolbar |
| **Feature history** | Bottom Timeline (horizontal strip) | Feature Tree (vertical, left panel) |
| **Feature tree** | Left Browser (document structure) | Combined in Feature Tree |
| **Dialog placement** | Floating panel near selection | Right-side floating |
| **Sketch plane entry** | Click plane → camera auto-rotates | Manual plane selection |
| **Constraint colors** | Blue/Black/Red for DOF states | Not implemented |
| **Marking menu** | Right-click radial menu | Simple context menu |
| **Navigation bar** | Bottom center with orbit/pan/zoom/fit | Not present |

---

## 17. Implementation Priority for r3ditor

To match this Fusion 360 layout exactly, the following changes to r3ditor are needed:

1. **Application Bar** → Keep DocumentHeader but match Fusion labeling (File menu, Save, Undo/Redo, doc title center, help right)
2. **Toolbar Tabs** → Add workspace dropdown (DESIGN/RENDER/MANUFACTURE) + sub-tabs (SOLID/SURFACE/SHEET METAL) + tool groups (CREATE/MODIFY/ASSEMBLE/CONSTRUCT/INSPECT/INSERT)
3. **Browser** (left) → Keep FeatureTree but relabel as "BROWSER" with Fusion-style structure (Document Settings, Named Views, Origin, Bodies, Sketches, Construction)
4. **Timeline** (bottom) → NEW: Horizontal parametric history strip with feature icons, rollback bar, drag-to-reorder
5. **Navigation Bar** (bottom center) → NEW: Orbit, Look At, Pan, Zoom, Fit All, Display Settings
6. **ViewCube** → Already have GizmoViewport, move to top-right, add face labels
7. **Feature Dialogs** → Update labels to match Fusion exactly (e.g., "One Side" not "blind", "New Body" not "new")
8. **Sketch Mode** → Full toolbar swap, DOF colors (blue/black/red), auto-constraints
9. **Marking Menu** → Radial right-click context menu
10. **Color scheme** → Switch from Onshape blues to Fusion 360 greys with blue accents
