import { create } from 'zustand';

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

export interface SketchPoint {
  x: number;
  y: number;
  id: string;
  isConstruction: boolean;
}

export interface SketchSegment {
  id: string;
  type: 'line' | 'arc' | 'circle' | 'spline' | 'rectangle';
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
  activeSketchTool: SketchTool | null;
  sketchPlane: 'XY' | 'XZ' | 'YZ' | 'face' | null;
  sketchPoints: SketchPoint[];
  sketchSegments: SketchSegment[];
  sketchConstraints: SketchConstraint[];
  sketchDimensions: SketchDimension[];
  startSketch: (plane: 'XY' | 'XZ' | 'YZ' | 'face') => void;
  finishSketch: () => void;
  cancelSketch: () => void;
  setSketchTool: (tool: SketchTool | null) => void;
  addSketchPoint: (pt: SketchPoint) => void;
  addSketchSegment: (seg: SketchSegment) => void;
  addSketchConstraint: (constraint: SketchConstraint) => void;
  addSketchDimension: (dim: SketchDimension) => void;
  clearSketch: () => void;
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
}

let pointIdCounter = 0;
const makePointId = () => `pt_${++pointIdCounter}`;

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
  activeSketchTool: null,
  sketchPlane: null,
  sketchPoints: [],
  sketchSegments: [],
  sketchConstraints: [],
  sketchDimensions: [],
  sketchDof: 0,
  startSketch: (plane) =>
    set({
      isSketchActive: true,
      sketchPlane: plane,
      activeSketchTool: 'line',
      activeTool: 'sketch',
      sketchPoints: [],
      sketchSegments: [],
      sketchConstraints: [],
      sketchDimensions: [],
      sketchDof: 0,
      statusMessage: `Sketching on ${plane} plane`,
    }),
  finishSketch: () => {
    const state = get();
    if (state.sketchPoints.length > 0 || state.sketchSegments.length > 0) {
      const sketchCount = state.timeline.filter((e) => e.type === 'sketch').length + 1;
      const sketchId = `sketch_${Date.now()}`;
      const newEntry: TimelineEntry = {
        id: sketchId,
        name: `Sketch ${sketchCount}`,
        type: 'sketch',
        suppressed: false,
        hasError: false,
      };
      const newNode: BrowserNode = {
        id: sketchId,
        name: `Sketch ${sketchCount}`,
        type: 'sketch',
        status: 'valid',
        expanded: false,
        visible: true,
        children: [],
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
          activeSketchTool: null,
          sketchPlane: null,
          activeTool: 'select',
          browserTree: tree,
          featureTree: tree,
          timeline: [...s.timeline, newEntry],
          statusMessage: 'Sketch completed',
        };
      });
    } else {
      set({
        isSketchActive: false,
        activeSketchTool: null,
        sketchPlane: null,
        activeTool: 'select',
        statusMessage: 'Sketch cancelled (empty)',
      });
    }
  },
  cancelSketch: () =>
    set({
      isSketchActive: false,
      activeSketchTool: null,
      sketchPlane: null,
      activeTool: 'select',
      sketchPoints: [],
      sketchSegments: [],
      sketchConstraints: [],
      sketchDimensions: [],
      sketchDof: 0,
      statusMessage: 'Sketch cancelled',
    }),
  setSketchTool: (tool) => set({ activeSketchTool: tool }),
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
}));
