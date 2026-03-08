import { create } from 'zustand';
import type {
  SketchInfo,
  SketchEntityInfo,
  ConstraintInfo,
  SketchPathInfo,
  SnapResultInfo,
  ToolStatusInfo,
} from '../api/tauri';

// ── Geometry types ──

export interface EntityTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface Entity {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  suppressed: boolean;
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
  transform: EntityTransform;
  type: 'box' | 'cylinder' | 'sphere' | 'imported' | 'brep';
}

// ── Tool / Mode types (Fusion 360 style) ──

/**
 * Fusion 360 workspaces — the tabs at the top of the toolbar.
 * DESIGN is the main parametric modeling workspace.
 */
export type FusionWorkspace = 'SOLID' | 'SURFACE' | 'SHEET METAL' | 'MESH' | 'PLASTIC';

/**
 * High-level mode: design vs assembly vs drawing (context tab sets).
 */
export type WorkspaceMode = 'design' | 'assembly' | 'drawing';

export type SketchTool =
  | 'line' | 'rectangle' | 'centerRectangle' | 'circle' | 'centerCircle'
  | 'arc3point' | 'arcCenter' | 'spline' | 'point' | 'slot'
  | 'polygon' | 'ellipse' | 'constructionToggle'
  | 'trim' | 'offset' | 'mirror2d' | 'fillet2d' | 'chamfer2d';

export type ConstraintType =
  | 'coincident' | 'concentric' | 'parallel' | 'perpendicular'
  | 'tangent' | 'horizontal' | 'vertical' | 'equal'
  | 'midpoint' | 'symmetric' | 'fix' | 'pierce';

export type FeatureTool =
  | 'select' | 'extrude' | 'revolve' | 'sweep' | 'loft'
  | 'fillet' | 'chamfer' | 'shell' | 'draft' | 'hole'
  | 'boolean' | 'mirrorFeature' | 'linearPattern' | 'circularPattern'
  | 'split' | 'thicken' | 'rib' | 'helix'
  | 'thread' | 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'pipe';

export type AssemblyTool =
  | 'select' | 'insert' | 'ground' | 'joint' | 'asBuiltJoint'
  | 'rigidGroup' | 'contactSets' | 'motion';

export type Tool = 'select' | 'move' | 'rotate' | 'scale' | 'sketch'
  | 'measure' | 'section' | FeatureTool;

export type SelectionFilter = 'body' | 'face' | 'edge' | 'vertex' | 'component';

// ── Sketch entities ──

/** Phase of the sketch workflow */
export type SketchPhase = 'selectPlane' | 'drawing' | null;

/** Plane definition for sketching — either a standard plane or a face on an object */
export interface SketchPlaneInfo {
  type: 'XY' | 'XZ' | 'YZ' | 'face';
  /** World-space origin of the plane */
  origin: [number, number, number];
  /** Unit normal of the plane */
  normal: [number, number, number];
  /** U-axis (right) in world space */
  uAxis: [number, number, number];
  /** V-axis (up) in world space */
  vAxis: [number, number, number];
  /** If type === 'face', the entity + face id */
  entityId?: string;
  faceIndex?: number;
}

export interface SketchPoint {
  x: number;
  y: number;
  id: string;
  isConstruction: boolean;
}

export interface SketchSegment {
  id: string;
  type: 'line' | 'arc' | 'circle' | 'spline' | 'rectangle';
  /** For line: [startPtId, endPtId]. For rect: [p0,p1,p2,p3]. For circle: [centerId, edgePtId] */
  points: string[];
  isConstruction: boolean;
}

export interface SketchConstraint {
  id: string;
  type: ConstraintType;
  entityIds: string[];
  value?: number;
  satisfied: boolean;
}

export interface SketchDimension {
  id: string;
  type: 'distance' | 'angle' | 'radius' | 'diameter';
  entityIds: string[];
  value: number;
  driving: boolean;
  /** Which segment this dimension annotates (for width/height on rectangles) */
  segmentId?: string;
  /** Label hint: 'width' | 'height' for rectangle dims */
  role?: 'width' | 'height' | 'radius' | 'length';
}

// ── Finished sketch (persisted after "Finish Sketch") ──

export interface FinishedSketch {
  id: string;
  name: string;
  planeInfo: SketchPlaneInfo;
  points: SketchPoint[];
  segments: SketchSegment[];
  constraints: SketchConstraint[];
  dimensions: SketchDimension[];
  /** Whether this sketch's profile outline is visible in 3D */
  visible: boolean;
  /** The ID of the body that consumed this sketch (via extrude, etc.) */
  consumedByBodyId?: string;
}

// ── Extruded body (3D solid from sketch profile) ──

export interface ExtrudedBody {
  id: string;
  name: string;
  /** Source sketch ID */
  sketchId: string;
  /** Extrusion distance */
  distance: number;
  /** Extrusion direction: 'normal' | 'symmetric' | 'two_sides' */
  direction: 'one_side' | 'symmetric' | 'two_sides';
  /** Operation: 'new_body' | 'join' | 'cut' | 'intersect' */
  operation: 'new_body' | 'join' | 'cut' | 'intersect';
  /** Taper angle in degrees */
  taper: number;
  /** Computed vertices for rendering (triangulated mesh) */
  meshVertices: number[];
  /** Computed triangle indices */
  meshIndices: number[];
  /** Face data for face picking: each face is { startIndex, count, normal } */
  faces: ExtrudedFace[];
  visible: boolean;
  /** World transform */
  transform: EntityTransform;
}

/** Live drawing state for click-drag-release */
export interface DrawState {
  /** Is the mouse currently pressed? */
  active: boolean;
  /** Start point in sketch-local 2D coords */
  startPoint: { x: number; y: number } | null;
  /** Current mouse position in sketch-local 2D coords */
  currentPoint: { x: number; y: number } | null;
}

/** Face metadata on an extruded body (for face picking → sketch-on-face) */
export interface ExtrudedFace {
  /** Index into meshIndices where this face's triangles start */
  startTriangle: number;
  /** Number of triangles in this face */
  triangleCount: number;
  /** Outward normal of this face */
  normal: [number, number, number];
  /** Face center point in local coords */
  center: [number, number, number];
  /** Face type for UX labeling */
  faceType: 'top' | 'bottom' | 'side';
}

// ── Feature tree / Browser ──

export interface BrowserNode {
  id: string;
  name: string;
  type: 'component' | 'body' | 'sketch' | 'extrude' | 'revolve' | 'fillet' | 'chamfer'
    | 'shell' | 'boolean' | 'pattern' | 'mirror' | 'hole' | 'sweep' | 'loft'
    | 'import' | 'plane' | 'axis' | 'point' | 'origin' | 'joint' | 'group'
    | 'construction' | 'documentSettings' | 'namedViews' | 'analysis';
  status: 'valid' | 'error' | 'stale' | 'suppressed';
  expanded: boolean;
  visible: boolean;
  children: BrowserNode[];
  errorMessage?: string;
}

// Keep FeatureNode as alias for backward compat
export type FeatureNode = BrowserNode;

// ── Mate / Joint in assembly (Fusion 360 style) ──

export interface JointDefinition {
  id: string;
  type: 'rigid' | 'revolute' | 'slider' | 'cylindrical' | 'pinSlot' | 'planar' | 'ball';
  component1: string;
  component2: string;
  name: string;
}

// Keep MateDefinition as alias
export interface MateDefinition {
  id: string;
  type: 'fastened' | 'revolute' | 'slider' | 'planar' | 'cylindrical' | 'pin' | 'ball' | 'parallel' | 'tangent';
  part1: string;
  part2: string;
  name: string;
}

// ── Timeline entry (Fusion 360 parametric history) ──

export interface TimelineEntry {
  id: string;
  name: string;
  type: FeatureTool | 'sketch' | 'component' | 'joint';
  icon?: string;
  suppressed: boolean;
  hasError: boolean;
}

// ── Document tab ──

export interface DocumentTab {
  id: string;
  name: string;
  type: WorkspaceMode;
  active: boolean;
}

// ── Feature dialog state ──

export interface FeatureDialogState {
  open: boolean;
  featureType: FeatureTool | null;
  params: Record<string, unknown>;
  editing: boolean;
  editingFeatureId?: string;
}

// ── Data panel state ──

export interface DataPanelState {
  open: boolean;
  projects: { id: string; name: string; recent: boolean }[];
}

// ── Marking menu state (right-click radial) ──

export interface MarkingMenuState {
  open: boolean;
  x: number;
  y: number;
}

// ── Section plane state ──

export interface SectionPlaneState {
  enabled: boolean;
  origin: [number, number, number];
  normal: [number, number, number];
}

// ── Measure tool state ──

export interface MeasureResult {
  pointA: [number, number, number] | null;
  pointB: [number, number, number] | null;
  distance: number | null;
  angle: number | null;
}

// ── Box selection state ──

export interface BoxSelectionState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  /** 'window' = left-to-right (only fully enclosed), 'crossing' = right-to-left (any overlap) */
  mode: 'window' | 'crossing';
}

// ── Main store ──

interface EditorState {
  // Document
  documentName: string;
  setDocumentName: (name: string) => void;
  documentTabs: DocumentTab[];
  activeTabId: string;
  setActiveTab: (id: string) => void;
  addTab: (tab: DocumentTab) => void;
  removeTab: (id: string) => void;

  // Fusion 360 workspace tab (SOLID / SURFACE / SHEET METAL / MESH / PLASTIC)
  fusionWorkspace: FusionWorkspace;
  setFusionWorkspace: (ws: FusionWorkspace) => void;

  // Workspace mode
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;

  // Entities
  entities: Entity[];
  setEntities: (entities: Entity[]) => void;
  addEntity: (entity: Entity) => void;
  removeEntity: (id: string) => void;
  updateEntityTransform: (id: string, transform: Partial<EntityTransform>) => void;
  toggleEntityVisibility: (id: string) => void;
  toggleEntitySuppressed: (id: string) => void;

  // Selection
  selectedIds: string[];
  select: (id: string) => void;
  multiSelect: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectionFilter: SelectionFilter;
  setSelectionFilter: (filter: SelectionFilter) => void;

  // Active tool
  activeTool: Tool;
  setTool: (tool: Tool) => void;

  // Sketch mode
  isSketchActive: boolean;
  sketchPhase: SketchPhase;
  activeSketchTool: SketchTool | null;
  sketchPlane: 'XY' | 'XZ' | 'YZ' | 'face' | null;
  sketchPlaneInfo: SketchPlaneInfo | null;
  sketchPoints: SketchPoint[];
  sketchSegments: SketchSegment[];
  sketchConstraints: SketchConstraint[];
  sketchDimensions: SketchDimension[];
  drawState: DrawState;
  /** Enter plane-selection phase (user must click a plane or face) */
  beginPlaneSelection: () => void;
  /** Commit a plane choice and transition to drawing phase */
  selectSketchPlane: (plane: SketchPlaneInfo) => void;
  startSketch: (plane: 'XY' | 'XZ' | 'YZ' | 'face') => void;
  finishSketch: () => void;
  cancelSketch: () => void;
  setSketchTool: (tool: SketchTool | null) => void;
  addSketchPoint: (pt: SketchPoint) => void;
  addSketchSegment: (seg: SketchSegment) => void;
  addSketchConstraint: (constraint: SketchConstraint) => void;
  addSketchDimension: (dim: SketchDimension) => void;
  clearSketch: () => void;
  setDrawState: (ds: Partial<DrawState>) => void;
  sketchDof: number;

  // Browser tree (Fusion 360's "Browser" = left panel with component tree)
  browserTree: BrowserNode[];
  setBrowserTree: (tree: BrowserNode[]) => void;
  toggleBrowserNode: (id: string) => void;
  toggleBrowserNodeVisibility: (id: string) => void;

  // Keep featureTree as alias for backward compat
  featureTree: BrowserNode[];
  setFeatureTree: (tree: BrowserNode[]) => void;
  toggleFeatureNode: (id: string) => void;

  // Timeline (Fusion 360 horizontal history bar)
  timeline: TimelineEntry[];
  setTimeline: (entries: TimelineEntry[]) => void;
  rollbackIndex: number;
  setRollbackIndex: (idx: number) => void;

  // Feature dialog
  featureDialog: FeatureDialogState;
  openFeatureDialog: (type: FeatureTool, params?: Record<string, unknown>) => void;
  closeFeatureDialog: () => void;
  updateFeatureDialogParam: (key: string, value: unknown) => void;

  // Data Panel (Fusion 360 left slide-out for projects/files)
  dataPanel: DataPanelState;
  toggleDataPanel: () => void;

  // Marking menu (right-click radial)
  markingMenu: MarkingMenuState;
  openMarkingMenu: (x: number, y: number) => void;
  closeMarkingMenu: () => void;

  // Assembly
  mates: MateDefinition[];
  addMate: (mate: MateDefinition) => void;
  removeMate: (id: string) => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  setHistory: (canUndo: boolean, canRedo: boolean) => void;

  // View
  showGrid: boolean;
  showAxes: boolean;
  showOrigin: boolean;
  showPlanes: boolean;
  toggleGrid: () => void;
  toggleAxes: () => void;
  toggleOrigin: () => void;
  togglePlanes: () => void;

  // Appearance
  viewStyle: 'shaded' | 'shadedEdges' | 'wireframe' | 'hidden';
  setViewStyle: (style: 'shaded' | 'shadedEdges' | 'wireframe' | 'hidden') => void;

  // Camera projection
  cameraProjection: 'perspective' | 'orthographic';
  toggleCameraProjection: () => void;
  setCameraProjection: (proj: 'perspective' | 'orthographic') => void;

  // Navigation style
  navigationStyle: string;
  setNavigationStyle: (style: string) => void;

  // Status
  statusMessage: string;
  setStatusMessage: (msg: string) => void;

  // Inspector panel (Fusion 360 right side)
  inspectorOpen: boolean;
  inspectorTab: 'properties' | 'appearance' | 'physical' | 'notes';
  toggleInspector: () => void;
  setInspectorTab: (tab: 'properties' | 'appearance' | 'physical' | 'notes') => void;

  // Browser panel (left)
  browserOpen: boolean;
  toggleBrowser: () => void;

  // Navigation bar display settings
  displaySettingsOpen: boolean;
  toggleDisplaySettings: () => void;

  // Clipboard for copy/paste
  clipboard: string[];

  // View commands (consumed by Viewport3D to animate camera)
  viewCommand: 'zoomFit' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'iso' | null;
  clearViewCommand: () => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Section analysis plane
  sectionPlane: SectionPlaneState;
  setSectionPlane: (state: Partial<SectionPlaneState>) => void;
  toggleSectionPlane: () => void;

  // Measure tool
  measureResult: MeasureResult;
  setMeasurePoint: (point: 'A' | 'B', pos: [number, number, number]) => void;
  clearMeasure: () => void;

  // Box / Window selection
  boxSelection: BoxSelectionState;
  startBoxSelection: (x: number, y: number) => void;
  updateBoxSelection: (x: number, y: number) => void;
  endBoxSelection: () => void;

  // Auto-constraints (during sketch drawing)
  autoConstraintsEnabled: boolean;
  toggleAutoConstraints: () => void;

  // Grid snap
  gridSnapEnabled: boolean;
  gridSnapSize: number;
  toggleGridSnap: () => void;
  setGridSnapSize: (size: number) => void;

  // ── Finished Sketches (persisted after "Finish Sketch") ──
  finishedSketches: FinishedSketch[];
  addFinishedSketch: (sketch: FinishedSketch) => void;
  updateFinishedSketch: (id: string, updates: Partial<FinishedSketch>) => void;
  removeFinishedSketch: (id: string) => void;
  /** Re-enter edit mode for a finished sketch */
  editFinishedSketch: (sketchId: string) => void;

  // ── Extruded Bodies (3D solids created from sketch profiles) ──
  extrudedBodies: ExtrudedBody[];
  addExtrudedBody: (body: ExtrudedBody) => void;
  updateExtrudedBody: (id: string, updates: Partial<ExtrudedBody>) => void;
  removeExtrudedBody: (id: string) => void;
  /** Create extrusion from a finished sketch */
  extrudeSketch: (sketchId: string, params: {
    distance: number;
    direction: 'one_side' | 'symmetric' | 'two_sides';
    operation: 'new_body' | 'join' | 'cut' | 'intersect';
    taper: number;
  }) => void;

  // ── Sketch-on-face workflow ──
  /** Start sketching on a face of an extruded body */
  beginSketchOnFace: (bodyId: string, faceIndex: number) => void;
  /** The body+face being sketched on (null if sketching on a reference plane) */
  sketchOnFaceRef: { bodyId: string; faceIndex: number } | null;

  // ── Dimension editing ──
  /** The dimension ID currently being edited (click-to-edit) */
  editingDimensionId: string | null;
  setEditingDimensionId: (id: string | null) => void;
  /** Update a dimension value (drives geometry) */
  updateDimensionValue: (dimId: string, newValue: number) => void;

  // ── Kernel-backed sketch state (Rust CAD kernel via Tauri) ──

  /** All sketches stored in the Rust kernel */
  kernelSketches: SketchInfo[];
  setKernelSketches: (sketches: SketchInfo[]) => void;

  /** Currently active sketch ID in the kernel */
  activeKernelSketchId: string | null;
  setActiveKernelSketchId: (id: string | null) => void;

  /** Entities of the currently active kernel sketch */
  kernelSketchEntities: SketchEntityInfo[];
  setKernelSketchEntities: (entities: SketchEntityInfo[]) => void;

  /** Constraints of the currently active kernel sketch */
  kernelSketchConstraints: ConstraintInfo[];
  setKernelSketchConstraints: (constraints: ConstraintInfo[]) => void;

  /** Discovered paths in the active kernel sketch */
  kernelSketchPaths: SketchPathInfo[];
  setKernelSketchPaths: (paths: SketchPathInfo[]) => void;

  /** Current snap result from the snap engine */
  snapResult: SnapResultInfo | null;
  setSnapResult: (result: SnapResultInfo | null) => void;

  /** Snap engine configuration */
  snapEnabled: boolean;
  snapRadius: number;
  snapToGrid: boolean;
  snapToEndpoints: boolean;
  snapToMidpoints: boolean;
  snapToCenters: boolean;
  toggleSnapEnabled: () => void;
  setSnapRadius: (radius: number) => void;
  toggleSnapToGrid: () => void;
  toggleSnapToEndpoints: () => void;
  toggleSnapToMidpoints: () => void;
  toggleSnapToCenters: () => void;

  /** Tool status from the kernel's stateful tool system */
  kernelToolStatus: ToolStatusInfo | null;
  setKernelToolStatus: (status: ToolStatusInfo | null) => void;

  /** Sketch snapshot depth (for undo indicator) */
  sketchSnapshotDepth: number;
  setSketchSnapshotDepth: (depth: number) => void;
}

let pointIdCounter = 0;
const makePointId = () => `pt_${++pointIdCounter}`;

/** Build a SketchPlaneInfo from a named plane ('XY' | 'XZ' | 'YZ') */
function standardPlaneInfo(plane: 'XY' | 'XZ' | 'YZ' | 'face'): SketchPlaneInfo {
  switch (plane) {
    case 'XZ':
      return { type: 'XZ', origin: [0, 0, 0], normal: [0, 1, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1] };
    case 'YZ':
      return { type: 'YZ', origin: [0, 0, 0], normal: [1, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1] };
    case 'XY':
    default:
      return { type: 'XY', origin: [0, 0, 0], normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0] };
  }
}

// Helper to recursively toggle node expansion
function toggleNodeInTree(nodes: BrowserNode[], id: string): BrowserNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, expanded: !n.expanded };
    if (n.children.length > 0) return { ...n, children: toggleNodeInTree(n.children, id) };
    return n;
  });
}

function toggleNodeVisibility(nodes: BrowserNode[], id: string): BrowserNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, visible: !n.visible };
    if (n.children.length > 0) return { ...n, children: toggleNodeVisibility(n.children, id) };
    return n;
  });
}

// ── Geometry helpers for extrusion ──

/** Build an ordered 2D profile polygon from sketch segments */
function buildOrderedProfile(
  segments: SketchSegment[],
  pointMap: Map<string, SketchPoint>,
): { x: number; y: number }[] {
  const lineSegs = segments.filter((s) => s.type === 'line');
  if (lineSegs.length === 0) return [];

  // Build adjacency: point → segments that use it
  const pointToSegs = new Map<string, SketchSegment[]>();
  for (const seg of lineSegs) {
    for (const pid of seg.points) {
      if (!pointToSegs.has(pid)) pointToSegs.set(pid, []);
      pointToSegs.get(pid)!.push(seg);
    }
  }

  // Walk the profile starting from the first segment
  const visited = new Set<string>();
  const profile: { x: number; y: number }[] = [];

  let currentSeg = lineSegs[0];
  let currentPtId = currentSeg.points[0];
  const startPt = pointMap.get(currentPtId);
  if (startPt) profile.push({ x: startPt.x, y: startPt.y });

  for (let i = 0; i < lineSegs.length; i++) {
    visited.add(currentSeg.id);
    // Get the other end of current segment
    const nextPtId = currentSeg.points.find((pid) => pid !== currentPtId) ?? currentSeg.points[1];
    const nextPt = pointMap.get(nextPtId);
    if (nextPt) profile.push({ x: nextPt.x, y: nextPt.y });

    // Find next unvisited segment sharing nextPtId
    const neighbors = pointToSegs.get(nextPtId) ?? [];
    const nextSeg = neighbors.find((s) => !visited.has(s.id));
    if (!nextSeg) break;

    currentSeg = nextSeg;
    currentPtId = nextPtId;
  }

  return profile;
}

/** Triangulate a simple convex/concave polygon using ear clipping (simple fan for convex) */
function triangulatePolygon(points: { x: number; y: number }[]): number[] {
  if (points.length < 3) return [];
  // Simple fan triangulation (works for convex polygons, approximate for concave)
  const indices: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    indices.push(0, i, i + 1);
  }
  return indices;
}

/** Compute polygon signed area (positive = CCW) */
function polygonArea(pts: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

/** Extrude a 2D profile along the sketch plane normal to create a 3D mesh */
function extrudeProfile(
  profile2D: { x: number; y: number }[],
  planeInfo: SketchPlaneInfo,
  distance: number,
  direction: 'one_side' | 'symmetric' | 'two_sides',
  _taper: number,
): { vertices: number[]; indices: number[]; faces: ExtrudedFace[] } {
  const n = profile2D.length;
  if (n < 3) return { vertices: [], indices: [], faces: [] };

  // Ensure CCW winding
  if (polygonArea(profile2D) < 0) {
    profile2D.reverse();
  }

  const origin = planeInfo.origin;
  const uAxis = planeInfo.uAxis;
  const vAxis = planeInfo.vAxis;
  const normal = planeInfo.normal;

  // Compute extrusion offsets along normal
  let startOffset = 0;
  let endOffset = distance;
  if (direction === 'symmetric') {
    startOffset = -distance / 2;
    endOffset = distance / 2;
  }

  // Convert 2D points to 3D
  function to3D(pt: { x: number; y: number }, offset: number): [number, number, number] {
    return [
      origin[0] + pt.x * uAxis[0] + pt.y * vAxis[0] + offset * normal[0],
      origin[1] + pt.x * uAxis[1] + pt.y * vAxis[1] + offset * normal[1],
      origin[2] + pt.x * uAxis[2] + pt.y * vAxis[2] + offset * normal[2],
    ];
  }

  const vertices: number[] = [];
  const indices: number[] = [];
  const faces: ExtrudedFace[] = [];

  // Bottom face vertices: indices 0..n-1
  for (const pt of profile2D) {
    const p = to3D(pt, startOffset);
    vertices.push(p[0], p[1], p[2]);
  }
  // Top face vertices: indices n..2n-1
  for (const pt of profile2D) {
    const p = to3D(pt, endOffset);
    vertices.push(p[0], p[1], p[2]);
  }

  // Bottom face triangles (reversed winding for outward normal)
  const bottomStart = indices.length / 3;
  const bottomTriIndices = triangulatePolygon(profile2D);
  for (let i = 0; i < bottomTriIndices.length; i += 3) {
    indices.push(bottomTriIndices[i], bottomTriIndices[i + 2], bottomTriIndices[i + 1]);
  }
  const bottomCenter = to3D(
    { x: profile2D.reduce((s, p) => s + p.x, 0) / n, y: profile2D.reduce((s, p) => s + p.y, 0) / n },
    startOffset,
  );
  faces.push({
    startTriangle: bottomStart,
    triangleCount: bottomTriIndices.length / 3,
    normal: [-normal[0], -normal[1], -normal[2]],
    center: bottomCenter,
    faceType: 'bottom',
  });

  // Top face triangles
  const topStart = indices.length / 3;
  for (let i = 0; i < bottomTriIndices.length; i += 3) {
    indices.push(n + bottomTriIndices[i], n + bottomTriIndices[i + 1], n + bottomTriIndices[i + 2]);
  }
  const topCenter = to3D(
    { x: profile2D.reduce((s, p) => s + p.x, 0) / n, y: profile2D.reduce((s, p) => s + p.y, 0) / n },
    endOffset,
  );
  faces.push({
    startTriangle: topStart,
    triangleCount: bottomTriIndices.length / 3,
    normal: [normal[0], normal[1], normal[2]],
    center: topCenter,
    faceType: 'top',
  });

  // Side faces: one quad (two triangles) per edge of the profile
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const sideStart = indices.length / 3;

    // Quad: bottom[i], bottom[j], top[j], top[i]
    indices.push(i, j, n + j);
    indices.push(i, n + j, n + i);

    // Compute side face normal
    const bi = to3D(profile2D[i], startOffset);
    const bj = to3D(profile2D[j], startOffset);
    const ti = to3D(profile2D[i], endOffset);
    // edge1 = bj - bi, edge2 = ti - bi
    const e1 = [bj[0] - bi[0], bj[1] - bi[1], bj[2] - bi[2]];
    const e2 = [ti[0] - bi[0], ti[1] - bi[1], ti[2] - bi[2]];
    const sn = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const snLen = Math.sqrt(sn[0] ** 2 + sn[1] ** 2 + sn[2] ** 2) || 1;

    const sideCenter: [number, number, number] = [
      (bi[0] + bj[0] + ti[0] + to3D(profile2D[j], endOffset)[0]) / 4,
      (bi[1] + bj[1] + ti[1] + to3D(profile2D[j], endOffset)[1]) / 4,
      (bi[2] + bj[2] + ti[2] + to3D(profile2D[j], endOffset)[2]) / 4,
    ];

    faces.push({
      startTriangle: sideStart,
      triangleCount: 2,
      normal: [sn[0] / snLen, sn[1] / snLen, sn[2] / snLen],
      center: sideCenter,
      faceType: 'side',
    });
  }

  return { vertices, indices, faces };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Document
  documentName: 'Untitled',
  setDocumentName: (documentName) => set({ documentName }),
  documentTabs: [
    { id: 'design1', name: 'Design 1', type: 'design', active: true },
  ],
  activeTabId: 'design1',
  setActiveTab: (id) =>
    set((s) => ({
      activeTabId: id,
      documentTabs: s.documentTabs.map((t) => ({ ...t, active: t.id === id })),
      workspaceMode: s.documentTabs.find((t) => t.id === id)?.type ?? 'design',
    })),
  addTab: (tab) =>
    set((s) => ({ documentTabs: [...s.documentTabs, tab] })),
  removeTab: (id) =>
    set((s) => ({
      documentTabs: s.documentTabs.filter((t) => t.id !== id),
      activeTabId: s.activeTabId === id ? s.documentTabs[0]?.id ?? '' : s.activeTabId,
    })),

  // Fusion workspace tab
  fusionWorkspace: 'SOLID',
  setFusionWorkspace: (fusionWorkspace) => set({ fusionWorkspace }),

  // Workspace
  workspaceMode: 'design',
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),

  // Entities
  entities: [],
  setEntities: (entities) => set({ entities }),
  addEntity: (entity) =>
    set((s) => ({ entities: [...s.entities, entity] })),
  removeEntity: (id) =>
    set((s) => ({
      entities: s.entities.filter((e) => e.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),
  updateEntityTransform: (id, transform) =>
    set((s) => ({
      entities: s.entities.map((e) =>
        e.id === id ? { ...e, transform: { ...e.transform, ...transform } } : e
      ),
    })),
  toggleEntityVisibility: (id) =>
    set((s) => ({
      entities: s.entities.map((e) =>
        e.id === id ? { ...e, visible: !e.visible } : e
      ),
    })),
  toggleEntitySuppressed: (id) =>
    set((s) => ({
      entities: s.entities.map((e) =>
        e.id === id ? { ...e, suppressed: !e.suppressed } : e
      ),
    })),

  // Selection
  selectedIds: [],
  select: (id) => set({ selectedIds: [id] }),
  multiSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds
        : [...s.selectedIds, id],
    })),
  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((sid) => sid !== id)
        : [...s.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  selectionFilter: 'body',
  setSelectionFilter: (selectionFilter) => set({ selectionFilter }),

  // Tool
  activeTool: 'select',
  setTool: (tool) => set({ activeTool: tool, statusMessage: `Tool: ${tool}` }),

  // Sketch
  isSketchActive: false,
  sketchPhase: null,
  activeSketchTool: null,
  sketchPlane: null,
  sketchPlaneInfo: null,
  sketchPoints: [],
  sketchSegments: [],
  sketchConstraints: [],
  sketchDimensions: [],
  sketchDof: 0,
  drawState: { active: false, startPoint: null, currentPoint: null },

  /** Step 1: user clicked "Create Sketch" — show plane/face selection highlights */
  beginPlaneSelection: () =>
    set({
      isSketchActive: true,
      sketchPhase: 'selectPlane',
      sketchPlane: null,
      sketchPlaneInfo: null,
      activeSketchTool: null,
      activeTool: 'sketch',
      sketchPoints: [],
      sketchSegments: [],
      sketchConstraints: [],
      sketchDimensions: [],
      sketchDof: 0,
      drawState: { active: false, startPoint: null, currentPoint: null },
      statusMessage: 'Select a plane or face to sketch on…',
      showPlanes: true, // show reference planes so user can click them
    }),

  /** Step 2: user picked a plane/face — camera will animate, then enter drawing */
  selectSketchPlane: (info: SketchPlaneInfo) =>
    set({
      sketchPhase: 'drawing',
      sketchPlane: info.type,
      sketchPlaneInfo: info,
      activeSketchTool: 'line',
      statusMessage: `Sketching on ${info.type} plane — draw with click-drag-release`,
    }),

  startSketch: (plane) => {
    // Legacy shortcut — build a SketchPlaneInfo from the named plane and go straight to drawing
    const info = standardPlaneInfo(plane);
    set({
      isSketchActive: true,
      sketchPhase: 'drawing',
      sketchPlane: plane,
      sketchPlaneInfo: info,
      activeSketchTool: 'line',
      activeTool: 'sketch',
      sketchPoints: [],
      sketchSegments: [],
      sketchConstraints: [],
      sketchDimensions: [],
      sketchDof: 0,
      drawState: { active: false, startPoint: null, currentPoint: null },
      statusMessage: `Sketching on ${plane} plane`,
    });
  },
  finishSketch: () => {
    const state = get();
    if (state.sketchPoints.length > 0 || state.sketchSegments.length > 0) {
      const sketchCount = state.timeline.filter((e) => e.type === 'sketch').length + 1;
      const sketchId = `sketch_${Date.now()}`;
      const sketchName = `Sketch ${sketchCount}`;
      const newEntry: TimelineEntry = {
        id: sketchId,
        name: sketchName,
        type: 'sketch',
        suppressed: false,
        hasError: false,
      };
      const newNode: BrowserNode = {
        id: sketchId,
        name: sketchName,
        type: 'sketch',
        status: 'valid',
        expanded: false,
        visible: true,
        children: [],
      };

      // Persist the sketch geometry as a FinishedSketch
      const finishedSketch: FinishedSketch = {
        id: sketchId,
        name: sketchName,
        planeInfo: state.sketchPlaneInfo!,
        points: [...state.sketchPoints],
        segments: [...state.sketchSegments],
        constraints: [...state.sketchConstraints],
        dimensions: [...state.sketchDimensions],
        visible: true,
      };

      set((s) => {
        // Add sketch to the first component's children (under Sketches folder)
        const tree = s.browserTree.map((node) => {
          if (node.type === 'component') {
            return {
              ...node,
              children: node.children.map((child) => {
                if (child.name === 'Sketches') {
                  return { ...child, children: [...child.children, newNode] };
                }
                return child;
              }),
            };
          }
          return node;
        });
        return {
          isSketchActive: false,
          sketchPhase: null,
          activeSketchTool: null,
          sketchPlane: null,
          sketchPlaneInfo: null,
          activeTool: 'select',
          sketchPoints: [],
          sketchSegments: [],
          sketchConstraints: [],
          sketchDimensions: [],
          sketchDof: 0,
          drawState: { active: false, startPoint: null, currentPoint: null },
          browserTree: tree,
          featureTree: tree,
          timeline: [...s.timeline, newEntry],
          finishedSketches: [...s.finishedSketches, finishedSketch],
          sketchOnFaceRef: null,
          editingDimensionId: null,
          statusMessage: `Sketch "${sketchName}" completed — select it and click Extrude to create a 3D body`,
          // Auto-select the finished sketch so user can immediately extrude
          selectedIds: [sketchId],
        };
      });
    } else {
      set({
        isSketchActive: false,
        sketchPhase: null,
        activeSketchTool: null,
        sketchPlane: null,
        sketchPlaneInfo: null,
        activeTool: 'select',
        sketchPoints: [],
        sketchSegments: [],
        sketchConstraints: [],
        sketchDimensions: [],
        sketchDof: 0,
        drawState: { active: false, startPoint: null, currentPoint: null },
        statusMessage: 'Sketch cancelled (empty)',
      });
    }
  },
  cancelSketch: () =>
    set({
      isSketchActive: false,
      sketchPhase: null,
      activeSketchTool: null,
      sketchPlane: null,
      sketchPlaneInfo: null,
      activeTool: 'select',
      sketchPoints: [],
      sketchSegments: [],
      sketchConstraints: [],
      sketchDimensions: [],
      sketchDof: 0,
      drawState: { active: false, startPoint: null, currentPoint: null },
      sketchOnFaceRef: null,
      editingDimensionId: null,
      statusMessage: 'Sketch cancelled',
    }),
  setSketchTool: (tool) => set({ activeSketchTool: tool }),
  setDrawState: (ds) =>
    set((s) => ({ drawState: { ...s.drawState, ...ds } })),
  addSketchPoint: (pt) =>
    set((s) => {
      const np = { ...pt, id: pt.id || makePointId() };
      return { sketchPoints: [...s.sketchPoints, np], sketchDof: s.sketchDof + 2 };
    }),
  addSketchSegment: (seg) =>
    set((s) => ({ sketchSegments: [...s.sketchSegments, seg] })),
  addSketchConstraint: (c) =>
    set((s) => ({
      sketchConstraints: [...s.sketchConstraints, c],
      sketchDof: Math.max(0, s.sketchDof - 1),
    })),
  addSketchDimension: (d) =>
    set((s) => ({
      sketchDimensions: [...s.sketchDimensions, d],
      sketchDof: d.driving ? Math.max(0, s.sketchDof - 1) : s.sketchDof,
    })),
  clearSketch: () =>
    set({
      sketchPoints: [],
      sketchSegments: [],
      sketchConstraints: [],
      sketchDimensions: [],
      sketchDof: 0,
    }),

  // Browser tree (Fusion 360 component hierarchy)
  browserTree: [
    {
      id: 'doc_settings',
      name: 'Document Settings',
      type: 'documentSettings',
      status: 'valid',
      expanded: false,
      visible: true,
      children: [
        { id: 'named_views', name: 'Named Views', type: 'namedViews', status: 'valid', expanded: false, visible: true, children: [] },
        { id: 'analysis', name: 'Analysis', type: 'analysis', status: 'valid', expanded: false, visible: true, children: [] },
      ],
    },
    {
      id: 'comp1',
      name: 'Component1',
      type: 'component',
      status: 'valid',
      expanded: true,
      visible: true,
      children: [
        {
          id: 'origin',
          name: 'Origin',
          type: 'origin',
          status: 'valid',
          expanded: false,
          visible: true,
          children: [
            { id: 'plane_xy', name: 'XY Plane', type: 'plane', status: 'valid', expanded: false, visible: true, children: [] },
            { id: 'plane_xz', name: 'XZ Plane', type: 'plane', status: 'valid', expanded: false, visible: true, children: [] },
            { id: 'plane_yz', name: 'YZ Plane', type: 'plane', status: 'valid', expanded: false, visible: true, children: [] },
            { id: 'axis_x', name: 'X Axis', type: 'axis', status: 'valid', expanded: false, visible: true, children: [] },
            { id: 'axis_y', name: 'Y Axis', type: 'axis', status: 'valid', expanded: false, visible: true, children: [] },
            { id: 'axis_z', name: 'Z Axis', type: 'axis', status: 'valid', expanded: false, visible: true, children: [] },
            { id: 'origin_pt', name: 'Origin', type: 'point', status: 'valid', expanded: false, visible: true, children: [] },
          ],
        },
        { id: 'bodies', name: 'Bodies', type: 'group', status: 'valid', expanded: true, visible: true, children: [] },
        { id: 'sketches', name: 'Sketches', type: 'group', status: 'valid', expanded: true, visible: true, children: [] },
        { id: 'construction', name: 'Construction', type: 'construction', status: 'valid', expanded: false, visible: true, children: [] },
      ],
    },
  ],
  setBrowserTree: (browserTree) => set({ browserTree, featureTree: browserTree }),
  toggleBrowserNode: (id) =>
    set((s) => {
      const tree = toggleNodeInTree(s.browserTree, id);
      return { browserTree: tree, featureTree: tree };
    }),
  toggleBrowserNodeVisibility: (id) =>
    set((s) => {
      const tree = toggleNodeVisibility(s.browserTree, id);
      return { browserTree: tree, featureTree: tree };
    }),

  // Feature tree aliases (backward compat)
  get featureTree() { return (this as any).browserTree; },
  setFeatureTree: (tree) => set({ browserTree: tree, featureTree: tree }),
  toggleFeatureNode: (id) =>
    set((s) => {
      const tree = toggleNodeInTree(s.browserTree, id);
      return { browserTree: tree, featureTree: tree };
    }),

  // Timeline
  timeline: [],
  setTimeline: (timeline) => set({ timeline }),
  rollbackIndex: -1,
  setRollbackIndex: (rollbackIndex) => set({ rollbackIndex }),

  // Feature dialog
  featureDialog: { open: false, featureType: null, params: {}, editing: false },
  openFeatureDialog: (type, params = {}) => {
    const defaults: Record<string, Record<string, unknown>> = {
      extrude: { distance: 10, direction: 'one_side', operation: 'new_body', taper: 0, symmetric: false },
      revolve: { angle: 360, direction: 'full', operation: 'new_body' },
      fillet: { radius: 2 },
      chamfer: { distance: 1, angle: 45, chamferType: 'equal_distance' },
      shell: { thickness: 1, direction: 'inside' },
      hole: { diameter: 5, depth: 10, holeType: 'simple' },
      boolean: { operation: 'combine' },
      linearPattern: { count: 3, spacing: 20, direction: 'x' },
      circularPattern: { count: 6, angle: 360, axis: 'z' },
      sweep: { orientation: 'perpendicular', operation: 'new_body' },
      loft: { operation: 'new_body' },
      thread: { threadType: 'ISO Metric', size: 'M6x1', fullLength: true },
    };
    set({
      featureDialog: {
        open: true,
        featureType: type,
        params: { ...(defaults[type] ?? {}), ...params },
        editing: false,
      },
    });
  },
  closeFeatureDialog: () =>
    set({ featureDialog: { open: false, featureType: null, params: {}, editing: false } }),
  updateFeatureDialogParam: (key, value) =>
    set((s) => ({
      featureDialog: {
        ...s.featureDialog,
        params: { ...s.featureDialog.params, [key]: value },
      },
    })),

  // Data Panel
  dataPanel: {
    open: false,
    projects: [
      { id: 'proj1', name: 'My First Project', recent: true },
      { id: 'proj2', name: 'Sample Designs', recent: true },
    ],
  },
  toggleDataPanel: () =>
    set((s) => ({ dataPanel: { ...s.dataPanel, open: !s.dataPanel.open } })),

  // Marking menu
  markingMenu: { open: false, x: 0, y: 0 },
  openMarkingMenu: (x, y) => set({ markingMenu: { open: true, x, y } }),
  closeMarkingMenu: () => set({ markingMenu: { open: false, x: 0, y: 0 } }),

  // Assembly
  mates: [],
  addMate: (mate) =>
    set((s) => ({ mates: [...s.mates, mate] })),
  removeMate: (id) =>
    set((s) => ({ mates: s.mates.filter((m) => m.id !== id) })),

  // History
  canUndo: false,
  canRedo: false,
  setHistory: (canUndo, canRedo) => set({ canUndo, canRedo }),

  // View
  showGrid: true,
  showAxes: true,
  showOrigin: true,
  showPlanes: false,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
  toggleOrigin: () => set((s) => ({ showOrigin: !s.showOrigin })),
  togglePlanes: () => set((s) => ({ showPlanes: !s.showPlanes })),

  // Appearance
  viewStyle: 'shadedEdges',
  setViewStyle: (viewStyle) => set({ viewStyle }),

  // Camera projection
  cameraProjection: 'perspective',
  toggleCameraProjection: () =>
    set((s) => ({
      cameraProjection: s.cameraProjection === 'perspective' ? 'orthographic' : 'perspective',
    })),
  setCameraProjection: (cameraProjection) => set({ cameraProjection }),

  // Navigation style
  navigationStyle: 'fusion360',
  setNavigationStyle: (navigationStyle) => set({ navigationStyle }),

  // Status
  statusMessage: 'Ready',
  setStatusMessage: (statusMessage) => set({ statusMessage }),

  // Inspector panel
  inspectorOpen: false,
  inspectorTab: 'properties',
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),

  // Browser panel
  browserOpen: true,
  toggleBrowser: () => set((s) => ({ browserOpen: !s.browserOpen })),

  // Display settings
  displaySettingsOpen: false,
  toggleDisplaySettings: () => set((s) => ({ displaySettingsOpen: !s.displaySettingsOpen })),

  // Clipboard
  clipboard: [],

  // View commands
  viewCommand: null,
  clearViewCommand: () => set({ viewCommand: null }),

  // Command palette
  commandPaletteOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

  // Section analysis plane
  sectionPlane: { enabled: false, origin: [0, 0, 0], normal: [0, 1, 0] },
  setSectionPlane: (partial) =>
    set((s) => ({ sectionPlane: { ...s.sectionPlane, ...partial } })),
  toggleSectionPlane: () =>
    set((s) => ({ sectionPlane: { ...s.sectionPlane, enabled: !s.sectionPlane.enabled } })),

  // Measure tool
  measureResult: { pointA: null, pointB: null, distance: null, angle: null },
  setMeasurePoint: (point, pos) =>
    set((s) => {
      const next = { ...s.measureResult };
      if (point === 'A') {
        next.pointA = pos;
        next.pointB = null;
        next.distance = null;
        next.angle = null;
      } else {
        next.pointB = pos;
        if (next.pointA) {
          const dx = pos[0] - next.pointA[0];
          const dy = pos[1] - next.pointA[1];
          const dz = pos[2] - next.pointA[2];
          next.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
      }
      return { measureResult: next };
    }),
  clearMeasure: () =>
    set({ measureResult: { pointA: null, pointB: null, distance: null, angle: null } }),

  // Box / Window selection
  boxSelection: { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, mode: 'window' },
  startBoxSelection: (x, y) =>
    set({ boxSelection: { active: true, startX: x, startY: y, currentX: x, currentY: y, mode: 'window' } }),
  updateBoxSelection: (x, y) =>
    set((s) => {
      const mode = x >= s.boxSelection.startX ? 'window' : 'crossing';
      return { boxSelection: { ...s.boxSelection, currentX: x, currentY: y, mode } };
    }),
  endBoxSelection: () =>
    set({ boxSelection: { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, mode: 'window' } }),

  // Auto-constraints
  autoConstraintsEnabled: true,
  toggleAutoConstraints: () => set((s) => ({ autoConstraintsEnabled: !s.autoConstraintsEnabled })),

  // Grid snap
  gridSnapEnabled: true,
  gridSnapSize: 1,
  toggleGridSnap: () => set((s) => ({ gridSnapEnabled: !s.gridSnapEnabled })),
  setGridSnapSize: (gridSnapSize) => set({ gridSnapSize }),

  // ── Finished Sketches ──
  finishedSketches: [],
  addFinishedSketch: (sketch) =>
    set((s) => ({ finishedSketches: [...s.finishedSketches, sketch] })),
  updateFinishedSketch: (id, updates) =>
    set((s) => ({
      finishedSketches: s.finishedSketches.map((sk) =>
        sk.id === id ? { ...sk, ...updates } : sk
      ),
    })),
  removeFinishedSketch: (id) =>
    set((s) => ({ finishedSketches: s.finishedSketches.filter((sk) => sk.id !== id) })),
  editFinishedSketch: (sketchId) => {
    const state = get();
    const sketch = state.finishedSketches.find((s) => s.id === sketchId);
    if (!sketch) return;
    // Re-enter sketch editing mode with the saved geometry
    set({
      isSketchActive: true,
      sketchPhase: 'drawing',
      sketchPlane: sketch.planeInfo.type as 'XY' | 'XZ' | 'YZ' | 'face',
      sketchPlaneInfo: sketch.planeInfo,
      activeSketchTool: 'line',
      activeTool: 'sketch',
      sketchPoints: [...sketch.points],
      sketchSegments: [...sketch.segments],
      sketchConstraints: [...sketch.constraints],
      sketchDimensions: [...sketch.dimensions],
      sketchDof: sketch.points.length * 2 - sketch.constraints.length - sketch.dimensions.filter((d) => d.driving).length,
      drawState: { active: false, startPoint: null, currentPoint: null },
      // Remove the sketch from finishedSketches — it'll be re-added on finishSketch
      finishedSketches: state.finishedSketches.filter((s) => s.id !== sketchId),
      statusMessage: `Editing ${sketch.name}`,
    });
  },

  // ── Extruded Bodies ──
  extrudedBodies: [],
  addExtrudedBody: (body) =>
    set((s) => ({ extrudedBodies: [...s.extrudedBodies, body] })),
  updateExtrudedBody: (id, updates) =>
    set((s) => ({
      extrudedBodies: s.extrudedBodies.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    })),
  removeExtrudedBody: (id) =>
    set((s) => ({ extrudedBodies: s.extrudedBodies.filter((b) => b.id !== id) })),

  extrudeSketch: (sketchId, params) => {
    const state = get();
    const sketch = state.finishedSketches.find((s) => s.id === sketchId);
    if (!sketch) {
      set({ statusMessage: 'Error: No sketch found to extrude. Select a sketch first.' });
      return;
    }

    // Build the 2D profile polygon from sketch segments
    const pointMap = new Map<string, SketchPoint>();
    for (const pt of sketch.points) pointMap.set(pt.id, pt);

    // Collect all line segments into an ordered polygon
    const profile2D = buildOrderedProfile(sketch.segments, pointMap);
    if (profile2D.length < 3) {
      set({ statusMessage: 'Error: Sketch profile must have at least 3 points to extrude.' });
      return;
    }

    // Generate 3D mesh from 2D profile via extrusion
    const mesh = extrudeProfile(profile2D, sketch.planeInfo, params.distance, params.direction, params.taper);

    const bodyCount = state.extrudedBodies.length + 1;
    const bodyId = `body_${Date.now()}`;
    const bodyName = `Body ${bodyCount}`;

    const newBody: ExtrudedBody = {
      id: bodyId,
      name: bodyName,
      sketchId,
      distance: params.distance,
      direction: params.direction,
      operation: params.operation,
      taper: params.taper,
      meshVertices: mesh.vertices,
      meshIndices: mesh.indices,
      faces: mesh.faces,
      visible: true,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    };

    // Add body to browser tree
    const bodyNode: BrowserNode = {
      id: bodyId,
      name: bodyName,
      type: 'body',
      status: 'valid',
      expanded: false,
      visible: true,
      children: [],
    };

    const extrudeEntry: TimelineEntry = {
      id: `extrude_${Date.now()}`,
      name: `Extrude (${bodyName})`,
      type: 'extrude',
      suppressed: false,
      hasError: false,
    };

    set((s) => {
      const tree = s.browserTree.map((node) => {
        if (node.type === 'component') {
          return {
            ...node,
            children: node.children.map((child) => {
              if (child.name === 'Bodies') {
                return { ...child, children: [...child.children, bodyNode] };
              }
              return child;
            }),
          };
        }
        return node;
      });

      return {
        extrudedBodies: [...s.extrudedBodies, newBody],
        finishedSketches: s.finishedSketches.map((sk) =>
          sk.id === sketchId ? { ...sk, visible: false, consumedByBodyId: bodyId } : sk
        ),
        browserTree: tree,
        featureTree: tree,
        timeline: [...s.timeline, extrudeEntry],
        selectedIds: [bodyId],
        statusMessage: `Extruded "${bodyName}" — ${params.distance}mm. Select a face to sketch on it.`,
      };
    });
  },

  // ── Sketch-on-face ──
  sketchOnFaceRef: null,
  beginSketchOnFace: (bodyId, faceIndex) => {
    const state = get();
    const body = state.extrudedBodies.find((b) => b.id === bodyId);
    if (!body || faceIndex >= body.faces.length) return;

    const face = body.faces[faceIndex];
    const normal = face.normal;
    const center = face.center;

    // Transform center to world space accounting for body transform
    const worldCenter: [number, number, number] = [
      center[0] + body.transform.position[0],
      center[1] + body.transform.position[1],
      center[2] + body.transform.position[2],
    ];

    // Compute u/v axes for the face plane
    const n = { x: normal[0], y: normal[1], z: normal[2] };
    // Pick a reference direction that isn't parallel to the normal
    const ref = Math.abs(n.y) < 0.99
      ? { x: 0, y: 1, z: 0 }
      : { x: 1, y: 0, z: 0 };
    // u = normalize(ref × normal)
    const ux = ref.y * n.z - ref.z * n.y;
    const uy = ref.z * n.x - ref.x * n.z;
    const uz = ref.x * n.y - ref.y * n.x;
    const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    const uAxis: [number, number, number] = [ux / uLen, uy / uLen, uz / uLen];
    // v = normal × u
    const vx = n.y * uAxis[2] - n.z * uAxis[1];
    const vy = n.z * uAxis[0] - n.x * uAxis[2];
    const vz = n.x * uAxis[1] - n.y * uAxis[0];
    const vAxis: [number, number, number] = [vx, vy, vz];

    const planeInfo: SketchPlaneInfo = {
      type: 'face',
      origin: worldCenter,
      normal: normal,
      uAxis,
      vAxis,
      entityId: bodyId,
      faceIndex,
    };

    set({
      isSketchActive: true,
      sketchPhase: 'drawing',
      sketchPlane: 'face',
      sketchPlaneInfo: planeInfo,
      activeSketchTool: 'line',
      activeTool: 'sketch',
      sketchPoints: [],
      sketchSegments: [],
      sketchConstraints: [],
      sketchDimensions: [],
      sketchDof: 0,
      drawState: { active: false, startPoint: null, currentPoint: null },
      sketchOnFaceRef: { bodyId, faceIndex },
      statusMessage: `Sketching on face of ${body.name} — draw your profile`,
      showPlanes: false,
    });
  },

  // ── Dimension editing ──
  editingDimensionId: null,
  setEditingDimensionId: (id) => set({ editingDimensionId: id }),
  updateDimensionValue: (dimId, newValue) => {
    const state = get();
    const dim = state.sketchDimensions.find((d) => d.id === dimId);
    if (!dim || newValue <= 0) return;

    // Update the dimension
    const newDimensions = state.sketchDimensions.map((d) =>
      d.id === dimId ? { ...d, value: newValue } : d
    );

    // Drive geometry: adjust points connected to this dimension's segment
    let newPoints = [...state.sketchPoints];
    if (dim.segmentId && dim.role) {
      const seg = state.sketchSegments.find((s) => s.id === dim.segmentId);
      if (seg && seg.type === 'line' && seg.points.length >= 2) {
        const p1 = newPoints.find((p) => p.id === seg.points[0]);
        const p2 = newPoints.find((p) => p.id === seg.points[1]);
        if (p1 && p2) {
          // Adjust the endpoint to match the new dimension value
          if (dim.role === 'width') {
            // Horizontal line: adjust x of endpoint
            const dx = p2.x - p1.x;
            const newDx = dx >= 0 ? newValue : -newValue;
            newPoints = newPoints.map((p) =>
              p.id === p2.id ? { ...p, x: p1.x + newDx } : p
            );
          } else if (dim.role === 'height') {
            // Vertical line: adjust y of endpoint
            const dy = p2.y - p1.y;
            const newDy = dy >= 0 ? newValue : -newValue;
            newPoints = newPoints.map((p) =>
              p.id === p2.id ? { ...p, y: p1.y + newDy } : p
            );
          } else if (dim.role === 'length') {
            // General line: scale endpoint along the line direction
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const curLen = Math.sqrt(dx * dx + dy * dy) || 1;
            const scale = newValue / curLen;
            newPoints = newPoints.map((p) =>
              p.id === p2.id ? { ...p, x: p1.x + dx * scale, y: p1.y + dy * scale } : p
            );
          }
        }
      } else if (seg && seg.type === 'circle' && seg.points.length >= 2 && dim.role === 'radius') {
        // Circle: adjust edge point to match new radius
        const center = newPoints.find((p) => p.id === seg.points[0]);
        const edge = newPoints.find((p) => p.id === seg.points[1]);
        if (center && edge) {
          newPoints = newPoints.map((p) =>
            p.id === edge.id ? { ...p, x: center.x + newValue, y: center.y } : p
          );
        }
      }
    }

    // For rectangle: need to also adjust the connected segments' shared points
    // Find all segments that share points with the modified segment and update them
    if (dim.role === 'width' || dim.role === 'height') {
      // Rebuild rectangle points from dimensions
      const widthDim = newDimensions.find((d) => d.role === 'width');
      const heightDim = newDimensions.find((d) => d.role === 'height');
      if (widthDim && heightDim) {
        // Find the 4 rectangle corner points by looking at all rectangle segments
        const rectSegs = state.sketchSegments.filter((s) =>
          [widthDim.segmentId, heightDim.segmentId].includes(s.id) ||
          state.sketchDimensions.some((d) => d.segmentId === s.id)
        );
        // Get unique point IDs from rectangle
        const rectPointIds = new Set<string>();
        for (const seg of rectSegs) {
          for (const pid of seg.points) rectPointIds.add(pid);
        }

        if (rectPointIds.size === 4) {
          const rPts = Array.from(rectPointIds).map((id) =>
            state.sketchPoints.find((p) => p.id === id)!
          ).filter(Boolean);

          if (rPts.length === 4) {
            // Find bounding box origin (min x, min y corner)
            const minX = Math.min(...rPts.map((p) => p.x));
            const minY = Math.min(...rPts.map((p) => p.y));
            const w = widthDim.value;
            const h = heightDim.value;

            // Reposition corners: TL, TR, BR, BL
            const corners = [
              { x: minX, y: minY + h },      // TL
              { x: minX + w, y: minY + h },   // TR
              { x: minX + w, y: minY },        // BR
              { x: minX, y: minY },            // BL
            ];

            // Sort existing points by position (TL, TR, BR, BL)
            const midY = minY + (Math.max(...rPts.map((p) => p.y)) - minY) / 2;
            const sorted = [...rPts].sort((a, b) => {
              const ay = a.y > midY ? 0 : 1;
              const by = b.y > midY ? 0 : 1;
              if (ay !== by) return ay - by;
              return a.x - b.x;
            });

            // Map sorted points to new corners
            for (let i = 0; i < sorted.length && i < corners.length; i++) {
              newPoints = newPoints.map((p) =>
                p.id === sorted[i].id ? { ...p, x: corners[i].x, y: corners[i].y } : p
              );
            }
          }
        }
      }
    }

    set({
      sketchDimensions: newDimensions,
      sketchPoints: newPoints,
      editingDimensionId: null,
    });
  },

  // ── Kernel-backed sketch state ──

  kernelSketches: [],
  setKernelSketches: (kernelSketches) => set({ kernelSketches }),

  activeKernelSketchId: null,
  setActiveKernelSketchId: (activeKernelSketchId) => set({ activeKernelSketchId }),

  kernelSketchEntities: [],
  setKernelSketchEntities: (kernelSketchEntities) => set({ kernelSketchEntities }),

  kernelSketchConstraints: [],
  setKernelSketchConstraints: (kernelSketchConstraints) => set({ kernelSketchConstraints }),

  kernelSketchPaths: [],
  setKernelSketchPaths: (kernelSketchPaths) => set({ kernelSketchPaths }),

  snapResult: null,
  setSnapResult: (snapResult) => set({ snapResult }),

  snapEnabled: true,
  snapRadius: 15,
  snapToGrid: true,
  snapToEndpoints: true,
  snapToMidpoints: true,
  snapToCenters: true,
  toggleSnapEnabled: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setSnapRadius: (snapRadius) => set({ snapRadius }),
  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  toggleSnapToEndpoints: () => set((s) => ({ snapToEndpoints: !s.snapToEndpoints })),
  toggleSnapToMidpoints: () => set((s) => ({ snapToMidpoints: !s.snapToMidpoints })),
  toggleSnapToCenters: () => set((s) => ({ snapToCenters: !s.snapToCenters })),

  kernelToolStatus: null,
  setKernelToolStatus: (kernelToolStatus) => set({ kernelToolStatus }),

  sketchSnapshotDepth: 0,
  setSketchSnapshotDepth: (sketchSnapshotDepth) => set({ sketchSnapshotDepth }),
}));
