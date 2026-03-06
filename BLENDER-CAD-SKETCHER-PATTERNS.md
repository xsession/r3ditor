# Blender & CAD_Sketcher — Extracted Patterns for r3ditor

> **Comprehensive extraction of algorithms, techniques, UX patterns, and architectural insights**
> from [Blender](https://github.com/blender/blender) and [CAD_Sketcher](https://github.com/hlorus/CAD_Sketcher)
>
> Mapped to r3ditor (Rust + React/Three.js + Tauri 2) implementation priorities

---

## Table of Contents

1. [Stateful Operator / Tool Framework](#1-stateful-operator--tool-framework)
2. [GPU Color-Buffer Entity Picking](#2-gpu-color-buffer-entity-picking)
3. [Constraint Solver Integration](#3-constraint-solver-integration)
4. [Trim Algorithm](#4-trim-algorithm)
5. [Bevel Algorithm](#5-bevel-algorithm)
6. [Offset Algorithm & Entity Walker](#6-offset-algorithm--entity-walker)
7. [Sketch-to-Geometry Conversion Pipeline](#7-sketch-to-geometry-conversion-pipeline)
8. [Serialization / Snapshot / Undo System](#8-serialization--snapshot--undo-system)
9. [Copy/Paste with Dependency Resolution](#9-copypaste-with-dependency-resolution)
10. [Entity Data Model & Type Hierarchy](#10-entity-data-model--type-hierarchy)
11. [Visual Feedback / Theme System](#11-visual-feedback--theme-system)
12. [Blender Boolean Mesh Operations](#12-blender-boolean-mesh-operations)
13. [Blender Snap System](#13-blender-snap-system)
14. [Blender Transform Gizmos & Orientation](#14-blender-transform-gizmos--orientation)
15. [Implementation Priority Matrix](#15-implementation-priority-matrix)

---

## 1. Stateful Operator / Tool Framework

**Source**: `CAD_Sketcher/stateful_operator/` — the crown jewel pattern

### Architecture

```
_StateMachineMixin          (state_machine.py)  — pure state traversal
    └── StatefulOperatorLogic  (logic.py)        — numeric input, modal loop, undo, continuous draw
        └── StatefulOperator    (integration.py) — Blender-specific wiring (events, UI draw)
            └── GenericEntityOp (base_stateful.py) — CAD-specific: pick_element, snapshot via serialization
```

### OperatorState Dataclass (Declarative Tool Definition)

Each tool declares its states as a frozen tuple of `OperatorState`:

```python
@dataclass(frozen=True)
class OperatorState:
    name: str                    # "Start Point"
    description: str             # "Pick start point of line"
    pointer: str                 # "p1" — attribute name on operator
    types: tuple                 # (SlvsPoint2D,) — acceptable entity types
    property: str | None         # RNA property name for numeric fallback
    no_event: bool = False       # Skip event handling (auto-resolve)
    interactive: bool = True     # User picks vs computed
    use_create: bool = True      # Create new entity if nothing picked
    state_func: callable = None  # coords → value (screen → world conversion)
    allow_prefill: bool = True   # Auto-fill from selection
    parse_selection: callable    # Selection → state value
    pick_element: callable       # Hover → entity
    create_element: callable     # Values → new entity
    check_pointer: callable      # Validate pointer
    optional: bool = False       # State can be skipped
```

### State Machine Lifecycle

**Modal path (interactive)**:
```
invoke()
  → create_snapshot()           # Save scene for undo
  → prefill_state_props()       # Auto-fill states from current selection
  → MODAL LOOP:
      modal(event)
        → evaluate_state()
            → _pick_hovered()   # Check entity under cursor
            → _resolve_values() # Get value from hover or state_func
            → next_state() | _end() | do_continuous_draw()
```

**Execute path (redo from properties panel)**:
```
execute()
  → redo_states()               # Recreate non-persistent elements
  → main()                      # Run the actual operation
  → _end()
```

### Three Interaction Paradigms

1. **Select → Invoke**: User selects entities first, invokes tool, states auto-fill via `prefill_state_props()`
2. **Invoke → Select**: User invokes tool, then picks entities for each state
3. **Mixed**: Partial selection pre-fills some states, remaining states require interactive picking

### Continuous Draw (Chain Drawing)

For polyline-like tools — finish one segment, immediately start the next:

```python
def do_continuous_draw(self, context):
    self._end(context, True)                      # Finish current segment
    bpy.ops.ed.undo_push(message=self.bl_label)   # Save undo point
    last_index, values, last_type = self._take_last_state_pointer()  # Save endpoint
    self._reset_op()                               # Reset operator state
    # Re-inject saved endpoint as first state of new segment
    data = self.get_state_data(0)
    data["is_existing_entity"] = True
    if last_type:
        data["type"] = last_type
    self.set_state_pointer(values, index=0, implicit=True)
    self.set_state(context, 1)                     # Jump to second state
    self._state_snapshot = self.create_snapshot(context)
```

### Numeric Input System

Per-substate text buffers (X, Y, Z), TAB cycles substates, validation against RNA property bounds.

### r3ditor Implementation

**Rust side** — `crates/r3ditor-tools/`:
```rust
#[derive(Debug, Clone)]
pub struct ToolState {
    pub name: &'static str,
    pub description: &'static str,
    pub entity_types: &'static [EntityTypeId],
    pub property: Option<&'static str>,
    pub optional: bool,
    pub allow_prefill: bool,
    pub use_create: bool,
}

pub trait StatefulTool: Send + Sync {
    fn states(&self) -> &[ToolState];
    fn state_func(&self, state_idx: usize, coords: Vec2) -> Option<ToolValue>;
    fn pick_element(&self, scene: &Scene, coords: Vec2) -> Option<EntityId>;
    fn create_element(&mut self, scene: &mut Scene, state_idx: usize, value: ToolValue) -> Option<EntityId>;
    fn main(&mut self, scene: &mut Scene) -> Result<(), ToolError>;
    fn finish(&mut self, scene: &mut Scene, succeeded: bool);
    fn supports_continuous_draw(&self) -> bool { false }
}
```

**Frontend** — `ToolStateMachine` in Zustand store managing state transitions, with numeric input overlay.

---

## 2. GPU Color-Buffer Entity Picking

**Source**: `CAD_Sketcher/draw_handler.py`, `gizmos/preselection.py`, `model/base_entity.py`

### How It Works

1. **Offscreen render**: Create `GPUOffScreen(width, height)`, draw all entities with unique RGB colors
2. **Entity → RGB**: `index_to_rgb(slvs_index)` converts entity ID to unique color
3. **Enlarged pick targets**: `draw_id()` uses larger `point_size_select` and `line_width_select` for easier picking
4. **Lazy redraw**: Only redraws selection buffer when `redraw_selection_buffer` flag is set
5. **Pixel sampling**: On every mouse move, read pixel at cursor position
6. **Spiral search**: If no hit at exact pixel, spiral outward (PICK_SIZE=10) for fuzzy picking
7. **RGB → Entity**: `rgb_to_index()` converts pixel color back to entity ID
8. **Global hover**: Store result in `global_data.hover = entity_index`

### Spiral Search Algorithm

```python
def _spiral(N, M):
    x, y = 0, 0
    dx, dy = 0, -1
    for _ in range(N * M):
        if abs(x) == abs(y) and [dx, dy] != [1, 0] or x > 0 and y == 1 - x:
            dx, dy = -dy, dx            # corner, change direction
        if abs(x) > N/2 or abs(y) > M/2:
            dx, dy = -dy, dx            # change direction
            x, y = -y + dx, x + dy      # jump
        yield x, y
        x, y = x + dx, y + dy
```

### Box Selection

Reads rectangular region from offscreen buffer, filters unique RGB values, converts to entity indices — instant selection of hundreds of entities.

### r3ditor Implementation

**Three.js** — Use a second render target with `MeshBasicMaterial` per entity, unique color per entity ID:

```typescript
// In Three.js render loop
const pickRT = new THREE.WebGLRenderTarget(width, height);
const pickScene = new THREE.Scene();
// For each entity: pickMesh.material = new MeshBasicMaterial({ color: entityIdToColor(id) });

// On mousemove: read pixel
renderer.readRenderTargetPixels(pickRT, x, y, 1, 1, pixelBuffer);
const entityId = colorToEntityId(pixelBuffer[0], pixelBuffer[1], pixelBuffer[2]);
```

Use spiral search around cursor for fuzzy picking. Cache the pick render — only re-render when entities change (dirty flag).

---

## 3. Constraint Solver Integration

**Source**: `CAD_Sketcher/solver.py`

### Architecture

- **Backend**: SolveSpace's geometric constraint solver (Python bindings via `slvs` module)
- **Group-based solving**: Fixed group (1), 3D group (2), per-sketch groups (3+)
- **Lazy initialization**: Only init solver data for constraints in the active group
- **Entity registration**: Each entity has `create_slvs_data(solvesys, group)` — registers itself with solver
- **Constraint registration**: Each constraint has `create_slvs_data(solvesys, group)` — adds constraint to solver
- **Solve result**: Returns state enum (OK, Inconsistent, Redundant, TooManyUnknowns, Failed)
- **DOF tracking**: Each sketch tracks its degrees of freedom after solving

### Tweak (Real-time Dragging)

```python
def tweak(self, entity, pos):
    self.tweak_entity = entity
    self.tweak_pos = pos
    # Creates temporary coincident constraint at mouse position
    # Calls solvesys.dragged() to mark entity as being dragged
    # Solver re-solves with drag constraint active
```

### Solve-After-Operation Pattern

Every geometry-modifying operation ends with `solve_system(context)` — ensures constraints are always satisfied.

### r3ditor Implementation

Use a Rust constraint solver crate (or port SolveSpace's C solver via FFI). Key trait:

```rust
pub trait ConstraintSolver {
    fn clear(&mut self);
    fn add_entity(&mut self, entity: &Entity, group: SolverGroup) -> SolverHandle;
    fn add_constraint(&mut self, constraint: &Constraint, group: SolverGroup) -> SolverHandle;
    fn solve(&mut self, group: SolverGroup) -> SolveResult;
    fn tweak(&mut self, entity: SolverHandle, target_pos: Vec2);
    fn dof(&self, group: SolverGroup) -> u32;
}
```

---

## 4. Trim Algorithm

**Source**: `CAD_Sketcher/utilities/trimming.py`, `operators/trim.py`

### Algorithm

1. **Input**: User picks a segment + mouse click position
2. **Find all intersections**: Iterate every sketch entity, call `segment.intersect(entity)` to get intersection coordinates
3. **Find constraint intersections**: Check coincident and midpoint constraints that reference the segment — their points are also intersection points
4. **Sort by distance**: `distance_along_segment(mouse_pos, intersection.co)` — sorts all intersections by how far they are from the click point
5. **Find relevant pair**: The two closest non-endpoint intersections bracket the trim zone
6. **Replace segment**: `segment.replace(p1, p2)` creates new segment between each pair of relevant intersections
7. **Copy constraints**: For each new segment, copy applicable constraints from the original (skip RATIO, COINCIDENT, MIDPOINT, TANGENT for non-first segments)
8. **Remap pointers**: Update entity references in constraints to point to new segments
9. **Clean up**: Remove obsolete endpoints and constraints, remove original segment if not reused

### Key Data Structures

```python
class Intersection:
    element     # Entity, constraint, or endpoint
    co          # Coordinate of intersection
    _is_endpoint # True if this is a segment endpoint
    _point      # Cached point entity

class TrimSegment:
    segment                  # The segment being trimmed
    pos                      # Mouse click position
    _intersections           # All found intersections
    connection_points        # Segment's endpoints
    obsolete_intersections   # Points to remove after trim
    reuse_segment            # Whether to reuse original segment for first piece
```

### r3ditor Implementation

The core `trim()` function in Rust:

```rust
pub fn trim_segment(
    scene: &mut Scene,
    segment_id: EntityId,
    mouse_pos: Vec2,
) -> Result<Vec<EntityId>, TrimError> {
    let segment = scene.get_entity(segment_id)?;
    let mut intersections = Vec::new();

    // Add endpoint intersections
    for p in segment.connection_points() {
        intersections.push(Intersection::endpoint(p));
    }

    // Find entity intersections
    for entity in scene.sketch_entities() {
        if entity.id() == segment_id || !entity.is_segment() { continue; }
        for co in segment.intersect(entity) {
            intersections.push(Intersection::entity(entity.id(), co));
        }
    }

    // Sort by distance from mouse
    intersections.sort_by_key(|i| OrderedFloat(segment.distance_along(mouse_pos, i.co)));

    // Find two closest non-endpoint intersections
    let relevant = find_relevant_pair(&intersections);

    // Create replacement segments, copy constraints, clean up
    replace_segment(scene, segment_id, &relevant)
}
```

---

## 5. Bevel Algorithm

**Source**: `CAD_Sketcher/operators/bevel.py`

### Algorithm (2-state: pick point + enter radius)

1. **Find connected segments**: At the picked point, find exactly 2 connected non-construction entities
2. **Compute offset elements**: For each segment, compute parallel offset by the bevel radius
3. **Find arc center**: Intersect the two offset elements — closest intersection to the picked point is the arc center
4. **Find tangent points**: For each segment, `project_point(arc_center)` finds where the arc meets the segment tangentially
5. **Create arc entity**: Add arc between the two tangent points with the computed center
6. **Add tangent constraints**: Constrain the arc to be tangent to both segments
7. **Replace connections**: Disconnect original point, connect segments to new tangent points
8. **Handle construction lines**: For lines that reference the original point, create construction geometry to preserve references

### Key Geometric Operations

- `get_offset_elements(segment, radius)` → parallel offset representation (type + args)
- `get_intersections(offset_a, offset_b)` → intersection points between offset curves
- `project_point(point, onto_entity)` → nearest point on entity to given point
- Line offsets: parallel line at distance `radius` along normal
- Arc offsets: concentric arc with `radius ± bevel_radius`

### r3ditor Implementation

```rust
pub fn bevel_at_point(
    scene: &mut Scene,
    point_id: EntityId,
    radius: f64,
) -> Result<EntityId, BevelError> {
    let connected = find_connected_segments(scene, point_id)?;
    if connected.len() != 2 { return Err(BevelError::NeedTwoSegments); }

    let offsets: Vec<OffsetElement> = connected.iter()
        .map(|seg| compute_offset(seg, radius))
        .collect();

    let center = find_nearest_intersection(&offsets[0], &offsets[1], point_pos)?;
    let tangent_points: Vec<Vec2> = connected.iter()
        .map(|seg| project_point_onto(center, seg))
        .collect();

    let arc_id = scene.add_arc(center, tangent_points[0], tangent_points[1])?;
    scene.add_tangent_constraint(arc_id, connected[0].id())?;
    scene.add_tangent_constraint(arc_id, connected[1].id())?;
    // Reconnect segments...
    Ok(arc_id)
}
```

---

## 6. Offset Algorithm & Entity Walker

**Source**: `CAD_Sketcher/operators/offset.py`, `utilities/walker.py`

### Entity Walker — Path Finding via Shared Points

```python
class EntityWalker:
    """Finds connected paths of sketch segments via shared connection points"""

    def __init__(self, scene, sketch, entity=None):
        # Build point → entities mapping
        self.points, self.entities = point_entity_mapping(scene)
        # Filter to non-construction path entities in this sketch
        self.sketch_entities = [e for e in sketch_entities if e.is_path() and not e.construction]
        self._run()  # Discover all paths

    def walker(self, entity, path, ignore_point=None, invert=False):
        """Recursively walk connected entities, tracking direction"""
        path[0].append(entity)          # Add to path segments
        path[1].append(invert_direction)  # Track segment direction
        self.sketch_entities.remove(entity)  # Mark visited

        for point in entity.connection_points():
            if point == ignore_point: continue
            for connected_entity in self._get_connected_entities(point):
                if connected_entity in self.sketch_entities:
                    self.walker(connected_entity, path, ignore_point=point)

    def is_cyclic_path(path):
        """Check if first and last segments share a connection point"""

    def get_limitpoints(path):
        """Get start/end points of non-cyclic path"""
```

### Offset Algorithm

1. **Circle shortcut**: If entity is a circle, simply create new circle with `radius ± distance`
2. **Path finding**: Use `EntityWalker` to find the connected path containing the picked entity
3. **Compute intersection points**: For each pair of consecutive segments, compute offset intersections
4. **Create offset points**: Add points at each intersection coordinate
5. **Handle endpoints**: For non-cyclic paths, compute offset of start/end points using segment normals
6. **Create offset segments**: For each original segment, create offset version between adjacent offset points
7. **Copy constraints**: Copy applicable constraints from original path to offset path

### r3ditor Implementation

```rust
pub struct PathWalker {
    paths: Vec<(Vec<EntityId>, Vec<bool>)>,  // (segments, directions)
}

impl PathWalker {
    pub fn new(scene: &Scene, sketch_id: SketchId, start: Option<EntityId>) -> Self { ... }
    pub fn is_cyclic(path: &[(EntityId, bool)]) -> bool { ... }
    pub fn main_path(&self) -> Option<&(Vec<EntityId>, Vec<bool>)> { ... }
}
```

---

## 7. Sketch-to-Geometry Conversion Pipeline

**Source**: `CAD_Sketcher/converters.py`, `model/*.py` (to_bezier methods)

### Pipeline

```
Sketch Entities  →  EntityWalker (find paths)  →  BezierConverter  →  Blender Curve/Mesh
```

### BezierConverter

1. **Inherits EntityWalker**: Discovers all connected paths in the sketch
2. **For each path**: Create a Bezier spline (cyclic if path is closed)
3. **For each segment**: Call `segment.to_bezier(spline, startpoint, endpoint, invert_direction)`
4. **Bezier math**: Use `q = (4/3) * tan(π / (2n))` for optimal cubic approximation of arcs
5. **Handle midpoints**: Multi-segment bezier for arcs > 90° (subdivide into quarters)

### Mesh conversion

1. Convert to Bezier curve first
2. Set `curve_resolution` for subdivision
3. Call Blender's native `to_mesh()` on the curve object
4. Run `bmesh.ops.dissolve_limit()` to clean up nearly-colinear edges

### Convert Types

- **None**: No output geometry
- **Bezier**: Creates Blender curve object
- **Mesh**: Creates Blender mesh object (via bezier → to_mesh)

### r3ditor Implementation

```rust
pub trait ToBezier {
    fn to_bezier_points(&self, direction: bool) -> Vec<BezierPoint>;
    fn bezier_segment_count(&self) -> usize { 1 }
}

pub fn sketch_to_mesh(scene: &Scene, sketch_id: SketchId, resolution: u32) -> Mesh {
    let walker = PathWalker::new(scene, sketch_id, None);
    let mut mesh_builder = MeshBuilder::new();

    for path in &walker.paths {
        let bezier_curve = path_to_bezier(scene, path);
        let tessellated = tessellate_bezier(&bezier_curve, resolution);
        if is_cyclic(path) {
            mesh_builder.add_filled_polygon(&tessellated);
        } else {
            mesh_builder.add_polyline(&tessellated);
        }
    }

    mesh_builder.build()
}
```

---

## 8. Serialization / Snapshot / Undo System

**Source**: `CAD_Sketcher/serialize.py`, `operators/snapshot.py`, `stateful_operator/logic.py`

### Serialization Format

```python
# Scene → Dict using RNA introspection
SKETCHER_SNAPSHOT_PROPS = ["entities", "constraints"]

def scene_to_dict(scene) -> Dict:
    """PropertyGroup → dict via bl_rna.properties traversal"""
    elements = {}
    for prop in SKETCHER_SNAPSHOT_PROPS:
        elements[prop] = pg_to_dict(getattr(scene.sketcher, prop))
    return elements

def scene_from_dict(scene, elements):
    """Dict → PropertyGroup reconstruction"""
    for prop_name in SKETCHER_SNAPSHOT_PROPS:
        pg_from_dict(getattr(scene.sketcher, prop_name), elements[prop_name])
```

### Snapshot/Undo During Tool Execution

```python
# On tool invoke:
self._state_snapshot = self.create_snapshot(context)  # scene_to_dict()

# On undo (Ctrl+Z during tool):
def _apply_undo(self, context):
    self.restore_snapshot(context, self._state_snapshot)  # scene_from_dict()
    self.redo_states(context)  # Replay states up to current

# On cancel:
def _end(self, context, succeeded):
    if not succeeded:
        self.restore_snapshot(context, self._state_snapshot)  # Full rollback

# On success:
self._state_snapshot = None  # Discard snapshot
```

### File Save/Load

Uses Python `pickle` — serialize dict to file, deserialize back:

```python
def save(file, scene):
    dict = scene_to_dict(scene)
    pickle.dump(dict, file)

def load(file, scene):
    dict = pickle.load(file)
    update_scene_from_dict(scene, dict)
```

### r3ditor Implementation

```rust
pub trait Snapshottable {
    type Snapshot: Clone + Send;
    fn create_snapshot(&self) -> Self::Snapshot;
    fn restore_snapshot(&mut self, snapshot: &Self::Snapshot);
}

// During tool execution:
pub struct ToolUndoState<S> {
    snapshot: S,
    state_history: Vec<(usize, ToolValue)>,
}
```

---

## 9. Copy/Paste with Dependency Resolution

**Source**: `CAD_Sketcher/operators/copy_paste.py`, `utilities/data_handling.py`

### Copy Algorithm

1. **Get selected entities**
2. **Resolve dependencies**: `get_collective_dependencies(selected)` — walks dependency tree (entity → points, normals, sketch)
3. **Get scoped constraints**: Find all constraints whose entities are all within the dependency set
4. **Filter scene dict**: Take the full `scene_to_dict()` and filter to only selected + dependency entries
5. **Store to global buffer**: `global_data.COPY_BUFFER = buffer`

### Paste Algorithm

1. **Deep copy buffer** (prevent mutation)
2. **Remap sketch indices**: Replace all `sketch_i` with the active sketch index
3. **Fix pointers**: Offset all entity indices to avoid collisions with existing entities
4. **Extend scene dict**: Merge buffer entities/constraints into existing scene
5. **Select pasted entities**: Mark all new entities as selected
6. **Auto-invoke Move**: Immediately start move operator for interactive placement

### Dependency Walker

```python
def get_flat_deps(entity):
    """Recursively collect all entities this entity depends on"""
    list = []
    def walker(entity, is_root=False):
        if entity in list: return
        if not is_root: list.append(entity)
        for dep in entity.dependencies():
            if dep not in list: walker(dep)
    walker(entity, is_root=True)
    return list
```

### r3ditor Implementation

```rust
pub fn collect_dependencies(scene: &Scene, entities: &[EntityId]) -> Vec<EntityId> {
    let mut deps = Vec::new();
    let mut visited = HashSet::new();
    for &id in entities {
        walk_deps(scene, id, &mut deps, &mut visited);
    }
    deps
}

pub fn paste_entities(
    scene: &mut Scene,
    buffer: &ClipboardBuffer,
    target_sketch: SketchId,
) -> Vec<EntityId> {
    let id_remap = compute_id_remap(scene, buffer);
    let new_entities = buffer.entities.iter()
        .map(|e| scene.add_entity_with_remap(e, &id_remap, target_sketch))
        .collect();
    // Also paste constraints with remapped entity references
    new_entities
}
```

---

## 10. Entity Data Model & Type Hierarchy

**Source**: `CAD_Sketcher/model/`

### Hierarchy

```
SlvsGenericEntity (base_entity.py)
    ├── Entity2D                     # Has sketch, workplane, 2D coords
    │   ├── SlvsPoint2D              # (co: Vector2)
    │   ├── SlvsLine2D               # (p1, p2: SlvsPoint2D)
    │   ├── SlvsArc                  # (nm, ct, p1, p2: points, invert_direction)
    │   ├── SlvsCircle               # (nm, ct: normal+center, radius)
    │   └── SlvsNormal2D             # (orientation quaternion)
    ├── SlvsPoint3D                  # (location: Vector3)
    ├── SlvsLine3D                   # (p1, p2: SlvsPoint3D)
    ├── SlvsNormal3D                 # (orientation quaternion)
    ├── SlvsWorkplane                # (p1: point, nm: normal)
    └── SlvsSketch                   # (wp: workplane, convert_type, solver_state, dof)

GenericConstraint (base_constraint.py)
    ├── SlvsCoincident               # (entity1: point, entity2: point|line|circle)
    ├── SlvsDistance                  # (entity1, entity2, value, align)
    ├── SlvsAngle                    # (entity1, entity2, value, setting)
    ├── SlvsEqual                    # (entity1, entity2)
    ├── SlvsTangent                  # (entity1: curve, entity2: line|curve)
    ├── SlvsPerpendicular            # (entity1: line, entity2: line)
    ├── SlvsHorizontal               # (entity1: line|point, entity2?: point)
    ├── SlvsVertical                 # (entity1: line|point, entity2?: point)
    ├── SlvsRatio                    # (entity1, entity2, value)
    ├── SlvsMidpoint                 # (entity1: point, entity2: line)
    └── SlvsSymmetry                 # (entity1, entity2, entity3: workplane)
```

### Key Entity Methods

```python
class SlvsGenericEntity:
    slvs_index: int              # Unique compound index (type_index << 16 | local_index)
    fixed: bool                  # Locked from solver changes
    construction: bool           # Non-geometric reference entity
    visible: bool
    origin: bool

    def dependencies(self) -> List[Entity]    # Entities this depends on
    def connection_points(self) -> List[Point] # Topological connections
    def intersect(self, other) -> List[Vec2]  # Geometric intersections
    def replace(self, p1, p2) -> Entity       # Create similar entity (for trim)
    def to_bezier(self, ...) -> BezierPoint   # Convert to bezier representation
    def distance_along_segment(self, p1, p2)  # Parametric distance (for trim sorting)
    def normal(self, position=None) -> Vec2   # Normal vector at position
    def direction(self, point) -> bool        # Direction flag (for walker)
    def draw(self, context)                   # Visual render (GPU batches)
    def draw_id(self, context)                # Selection buffer render (unique RGB)
    def create_slvs_data(self, solvesys, group) # Register with constraint solver
    def update_from_slvs(self, solvesys)      # Read back solved values
    def new(self, context, **kwargs)          # Clone with modifications
```

### Entity Index System

Compound index: `slvs_index = (type_index << 16) | local_index`

- Allows up to 16 entity types with 65536 entities each
- `breakdown_index(idx) → (type_index, local_index)`
- `assemble_index(type_idx, local_idx) → slvs_index`

### r3ditor Implementation

```rust
pub type EntityId = u32;  // Compound: type_bits << 20 | local_index

pub trait Entity: Send + Sync + 'static {
    fn entity_type(&self) -> EntityType;
    fn dependencies(&self) -> Vec<EntityId>;
    fn connection_points(&self) -> Vec<EntityId>;
    fn intersect(&self, other: &dyn Entity) -> Vec<Vec2>;
    fn bounding_box(&self) -> BBox2;
    fn distance_along(&self, from: Vec2, to: Vec2) -> f64;
    fn normal_at(&self, position: Vec2) -> Vec2;
    fn to_bezier(&self) -> Vec<CubicBezier>;
    fn is_construction(&self) -> bool;
    fn is_segment(&self) -> bool;
    fn is_point(&self) -> bool;
    fn is_closed(&self) -> bool;
}
```

---

## 11. Visual Feedback / Theme System

**Source**: `CAD_Sketcher/base/theme.py`, `model/base_entity.py`

### Multi-State Color Resolution

```python
def color(self, context):
    active = self.is_active(active_sketch)
    highlight = self.is_highlight()  # hover or in highlight_entities list

    if not active:
        if highlight: return theme.entity.highlight
        if self.selected: return theme.entity.inactive_selected
        return theme.entity.inactive
    elif self.selected:
        if highlight: return theme.entity.selected_highlight
        return theme.entity.selected
    elif highlight:
        return theme.entity.highlight
    if self.fixed and not self.origin:
        return theme.entity.fixed
    return theme.entity.default
```

### Theme Structure

```python
class ThemeSettingsEntity:
    default             # Normal entity color
    highlight           # Hover/highlighted
    selected            # Selected entity
    selected_highlight  # Selected + hovered
    inactive            # Entity not in active sketch
    inactive_selected   # Selected but not in active sketch
    fixed               # Solver-fixed entity

class ThemeSettingsConstraint:
    default             # Normal constraint
    highlight           # Hovered constraint
    failed              # Failed/unsatisfied constraint
    failed_highlight    # Failed + hovered
    text                # Dimensional text color
```

### Construction Geometry

- Entities with `construction = True` draw dashed lines (via fragment shader)
- Dashed line shader uses screen-space distance for consistent dash width regardless of zoom

### Dashed Line Shader

```glsl
float distance_along_line = distance(stipple_pos, stipple_start);
float normalized_distance = fract(distance_along_line / dash_width);
if (dashed == true) {
    if (normalized_distance < 0.5) discard;
}
```

### r3ditor Implementation

```typescript
// In Three.js materials
const entityMaterial = (state: EntityState) => {
    const colors = {
        default: '#FFFFFF',
        hover: '#FFAA00',
        selected: '#FF6600',
        selected_hover: '#FFCC00',
        inactive: '#666666',
        fixed: '#00FF00',
        failed: '#FF0000',
    };
    return new THREE.LineBasicMaterial({ color: colors[state] });
};
```

---

## 12. Blender Boolean Mesh Operations

**Source**: `blender/source/blender/geometry/`, `blender/source/blender/blenlib/intern/mesh_boolean.cc`

### Three Solver Backends

| Solver | Source | Characteristics |
|--------|--------|-----------------|
| **Float** | `bmesh_intersect.cc` | Fast, BVH-tree based overlap detection, epsilon tolerance, limited coplanar handling |
| **Exact (MeshArr)** | `mesh_boolean.cc` (GMP) | Exact arithmetic via GMP mpq, based on "Mesh Arrangements" paper, handles all edge cases |
| **Manifold** | `mesh_boolean_manifold.cc` | Fast robust floating-point solver from Manifold library |

### Boolean Pipeline (Exact Solver)

```
Input Meshes → meshes_to_imesh()      # Convert to internal IMesh representation
            → boolean_mesh()           # Main boolean function
                → triangulate_polymesh() # Triangulate input
                → boolean_trimesh()      # Core boolean on triangle mesh
                    → trimesh_nary_intersect() # Find all triangle-triangle intersections
                    → classify triangles (inside/outside using raycast + winding)
                    → remove classified triangles based on operation
                → polymesh_from_trimesh_with_dissolve() # Reconstruct polygons
            → imesh_to_mesh()           # Convert back to Blender Mesh
```

### Operations

```cpp
enum class BoolOpType { None = -1, Intersect = 0, Union = 1, Difference = 2 };
enum class Operation { Intersect = 0, Union = 1, Difference = 2 };
```

### Mesh Intersect (Knife)

Separate from boolean — cuts meshes along intersections without removing faces:
```cpp
BM_mesh_intersect(bm, looptris, test_fn, user_data,
                  use_self, use_separate, use_dissolve,
                  use_island_connect, use_partial_connect,
                  use_edge_tag, boolean_mode, eps);
```

### Bisect Plane

Cut mesh along a plane:
```cpp
BM_mesh_bisect_plane(bm, plane, use_snap_center, use_tag,
                     oflag_center, oflag_new, eps);
```

### r3ditor Implementation

For Rust, use existing boolean libraries:
- **manifold-rs**: Rust bindings to the Manifold library (fastest)
- **Direct port**: Port the exact solver using `rug` crate for GMP arithmetic
- **Float solver**: Implement BVH-based intersection detection with epsilon handling

```rust
pub enum BooleanOp { Union, Intersect, Difference }
pub enum BooleanSolver { Float, Exact, Manifold }

pub fn mesh_boolean(
    meshes: &[&Mesh],
    transforms: &[Mat4],
    op: BooleanOp,
    solver: BooleanSolver,
) -> Result<Mesh, BooleanError> {
    match solver {
        BooleanSolver::Manifold => manifold_boolean(meshes, transforms, op),
        BooleanSolver::Exact => exact_boolean(meshes, transforms, op),
        BooleanSolver::Float => float_boolean(meshes, transforms, op),
    }
}
```

---

## 13. Blender Snap System

**Source**: `blender/source/blender/editors/transform/transform_snap*.cc`, `snap3d_gizmo.cc`

### Architecture

```
TransSnap (per-transform state)
    ├── snap_target_fn      # View3D / UV / Sequencer / NLA target resolution
    ├── snap_source_fn      # Median / Center / Closest / Active source
    ├── SnapObjectContext   # Manages BVH trees, caches, ray casting
    └── SnapGizmo3D         # Visual feedback gizmo (draws snap point + normal)
```

### Snap Target Types

```cpp
SCE_SNAP_TO_VERTEX       // Snap to vertices
SCE_SNAP_TO_EDGE         // Snap to edges (nearest point)
SCE_SNAP_TO_FACE         // Snap to faces (projected)
SCE_SNAP_TO_INCREMENT    // Snap to grid increments
SCE_SNAP_TO_GRID         // Snap to world grid
```

### Snap Source Types

- **Median**: Average of all selected element positions
- **Center**: Bounding box center of selection
- **Closest**: Closest selected element to snap target
- **Active**: Active element position

### Grid Snapping with Precision

```cpp
void transform_snap_grid_init(TransInfo *t, float r_snap[3], float *r_snap_precision) {
    r_snap[0] = r_snap[1] = r_snap[2] = ED_view3d_grid_view_scale(...);
    // Precision modifier: snap * precision_factor
}
```

### Snap Angle Increments

Separate 2D and 3D angle snap settings with precision sub-increments.

### r3ditor Implementation

```rust
pub enum SnapTarget { Vertex, Edge, Face, Increment, Grid }
pub enum SnapSource { Median, Center, Closest, Active }

pub struct SnapSystem {
    targets: EnumSet<SnapTarget>,
    source: SnapSource,
    grid_size: f64,
    precision_factor: f64,
    angle_increment: f64,
    bvh_cache: BvhCache,
}

impl SnapSystem {
    pub fn find_snap(
        &self,
        scene: &Scene,
        ray: Ray3,
        exclude: &[EntityId],
    ) -> Option<SnapResult> {
        let mut best: Option<SnapResult> = None;
        if self.targets.contains(SnapTarget::Vertex) {
            best = self.snap_to_vertices(scene, ray, best);
        }
        if self.targets.contains(SnapTarget::Edge) {
            best = self.snap_to_edges(scene, ray, best);
        }
        // ... etc
        best
    }
}
```

---

## 14. Blender Transform Gizmos & Orientation

**Source**: `blender/source/blender/editors/transform/transform_gizmo_3d.cc`

### Gizmo Axes

```cpp
enum {
    MAN_AXIS_TRANS_X, MAN_AXIS_TRANS_Y, MAN_AXIS_TRANS_Z,    // Translation axes
    MAN_AXIS_ROT_X, MAN_AXIS_ROT_Y, MAN_AXIS_ROT_Z, MAN_AXIS_ROT_C,  // Rotation + trackball
    MAN_AXIS_SCALE_X, MAN_AXIS_SCALE_Y, MAN_AXIS_SCALE_Z,   // Scale axes
    MAN_AXIS_TRANS_XY, MAN_AXIS_TRANS_YZ, MAN_AXIS_TRANS_ZX, // Plane translations
    MAN_AXIS_SCALE_XY, MAN_AXIS_SCALE_YZ, MAN_AXIS_SCALE_ZX, // Plane scales
};
```

### Pivot Point Types

```cpp
V3D_AROUND_CENTER_BOUNDS    // Bounding box center
V3D_AROUND_CENTER_MEDIAN    // Median point
V3D_AROUND_CURSOR           // 3D cursor position
V3D_AROUND_ACTIVE           // Active element
V3D_AROUND_LOCAL_ORIGINS    // Individual origins (per-object)
```

### Orientation System

```cpp
V3D_ORIENT_GLOBAL           // World axes
V3D_ORIENT_LOCAL            // Object local axes
V3D_ORIENT_NORMAL           // Face/edge normal
V3D_ORIENT_GIMBAL           // Gimbal axes
V3D_ORIENT_VIEW             // Camera/viewport axes
V3D_ORIENT_CURSOR           // 3D cursor orientation
V3D_ORIENT_PARENT           // Parent object axes
V3D_ORIENT_CUSTOM           // User-defined orientation
```

### Constraint System (Shift-click)

When shift-clicking a gizmo axis, it constrains to the **plane perpendicular** to that axis (i.e., constrains the other two axes).

### Message Bus Integration

Gizmos subscribe to property changes via message bus:
```cpp
// Subscribe to transform_orientation_slots changes
WM_msg_subscribe_rna(mbus, &scene_ptr, &rna_Scene_transform_orientation_slots, ...);
// Subscribe to cursor changes (when pivot = cursor)
WM_msg_subscribe_rna(mbus, &scene_ptr, &rna_Scene_cursor_location, ...);
```

### r3ditor Implementation

```rust
pub enum PivotPoint { BoundsCenter, Median, Cursor, Active, Individual }
pub enum Orientation { Global, Local, Normal, View, Cursor, Custom(Mat3) }

pub struct TransformGizmo {
    pivot: PivotPoint,
    orientation: Orientation,
    active_axis: Option<Axis>,
    constraint_plane: Option<Plane>,
}

impl TransformGizmo {
    pub fn compute_gizmo_matrix(&self, scene: &Scene, selection: &Selection) -> Mat4 {
        let pivot_pos = match self.pivot {
            PivotPoint::BoundsCenter => selection.bounds_center(),
            PivotPoint::Median => selection.median_point(),
            PivotPoint::Cursor => scene.cursor_position(),
            PivotPoint::Active => selection.active_position(),
            PivotPoint::Individual => selection.active_position(), // per-object in apply
        };
        let orient_mat = match self.orientation {
            Orientation::Global => Mat3::IDENTITY,
            Orientation::Local => selection.active_local_axes(),
            Orientation::Normal => selection.average_normal_axes(),
            Orientation::View => scene.camera.view_matrix().truncate(),
            // ...
        };
        Mat4::from_translation(pivot_pos) * Mat4::from_mat3(orient_mat)
    }
}
```

---

## 15. Implementation Priority Matrix

### Phase 1 — Foundation (Highest ROI)

| Pattern | Source | r3ditor Crate | Effort | Impact |
|---------|--------|---------------|--------|--------|
| Stateful Operator Framework | CAD_Sketcher | `r3ditor-tools` | HIGH | ★★★★★ |
| Entity Data Model | CAD_Sketcher | `r3ditor-kernel` | HIGH | ★★★★★ |
| GPU Color-Buffer Picking | CAD_Sketcher | `r3ditor-renderer` | MEDIUM | ★★★★★ |
| Theme/Visual Feedback | CAD_Sketcher | `r3ditor-ui` | LOW | ★★★★☆ |

### Phase 2 — Constraint Solving

| Pattern | Source | r3ditor Crate | Effort | Impact |
|---------|--------|---------------|--------|--------|
| Constraint Solver | CAD_Sketcher/SolveSpace | `r3ditor-solver` | HIGH | ★★★★★ |
| Snap System | Blender | `r3ditor-snap` | MEDIUM | ★★★★☆ |
| Transform Gizmos | Blender | `r3ditor-ui` | MEDIUM | ★★★★☆ |

### Phase 3 — Sketch Operations

| Pattern | Source | r3ditor Crate | Effort | Impact |
|---------|--------|---------------|--------|--------|
| Trim Algorithm | CAD_Sketcher | `r3ditor-tools` | MEDIUM | ★★★★☆ |
| Bevel Algorithm | CAD_Sketcher | `r3ditor-tools` | MEDIUM | ★★★★☆ |
| Offset + EntityWalker | CAD_Sketcher | `r3ditor-tools` | MEDIUM | ★★★★☆ |
| Sketch → Mesh Conversion | CAD_Sketcher | `r3ditor-converter` | MEDIUM | ★★★★☆ |

### Phase 4 — Advanced Operations

| Pattern | Source | r3ditor Crate | Effort | Impact |
|---------|--------|---------------|--------|--------|
| Boolean Mesh Operations | Blender | `r3ditor-boolean` | HIGH | ★★★★★ |
| Snapshot/Undo System | CAD_Sketcher | `r3ditor-kernel` | MEDIUM | ★★★★☆ |
| Copy/Paste + Deps | CAD_Sketcher | `r3ditor-tools` | LOW | ★★★☆☆ |
| Continuous Draw | CAD_Sketcher | `r3ditor-tools` | LOW | ★★★☆☆ |

---

## Quick Reference: Key Algorithms

| Algorithm | Input | Output | Key Insight |
|-----------|-------|--------|-------------|
| **Trim** | segment + click pos | split segments | Sort intersections by `distance_along_segment` from click |
| **Bevel** | point + radius | arc + tangent constraints | Intersect offset curves to find arc center |
| **Offset** | entity + distance | parallel path | EntityWalker finds paths, offset intersections give new points |
| **GPU Pick** | mouse coords | entity ID | Offscreen RGB render + spiral pixel search |
| **Boolean** | 2+ meshes + op | result mesh | Triangulate → intersect → classify → reconstruct |
| **Snap** | ray + targets | snap point | BVH traversal with distance ranking |
| **Bezier Approx** | arc/circle | cubic bezier | `q = (4/3) * tan(π/(2n))` for optimal handle length |

---

*Generated from CAD_Sketcher commit analysis and Blender source code examination — June 2025*
