import { create } from 'zustand';

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
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
  transform: EntityTransform;
}

export type Tool =
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'sketch'
  | 'extrude'
  | 'revolve'
  | 'fillet'
  | 'chamfer'
  | 'boolean'
  | 'measure'
  | 'section';

interface SketchPoint {
  x: number;
  y: number;
}

interface EditorState {
  // Entities
  entities: Entity[];
  setEntities: (entities: Entity[]) => void;
  addEntity: (entity: Entity) => void;
  removeEntity: (id: string) => void;
  updateEntityTransform: (id: string, transform: Partial<EntityTransform>) => void;

  // Selection
  selectedIds: string[];
  select: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  // Tool
  activeTool: Tool;
  setTool: (tool: Tool) => void;

  // Sketch
  sketchPoints: SketchPoint[];
  addSketchPoint: (pt: SketchPoint) => void;
  clearSketch: () => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  setHistory: (canUndo: boolean, canRedo: boolean) => void;

  // View
  showGrid: boolean;
  showAxes: boolean;
  toggleGrid: () => void;
  toggleAxes: () => void;

  // Status message
  statusMessage: string;
  setStatusMessage: (msg: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // Entities
  entities: [],
  setEntities: (entities) => set({ entities }),
  addEntity: (entity) =>
    set((state) => ({ entities: [...state.entities, entity] })),
  removeEntity: (id) =>
    set((state) => ({
      entities: state.entities.filter((e) => e.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    })),
  updateEntityTransform: (id, transform) =>
    set((state) => ({
      entities: state.entities.map((e) =>
        e.id === id ? { ...e, transform: { ...e.transform, ...transform } } : e
      ),
    })),

  // Selection
  selectedIds: [],
  select: (id) => set({ selectedIds: [id] }),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),

  // Tool
  activeTool: 'select',
  setTool: (tool) => set({ activeTool: tool, statusMessage: `Tool: ${tool}` }),

  // Sketch
  sketchPoints: [],
  addSketchPoint: (pt) =>
    set((state) => ({ sketchPoints: [...state.sketchPoints, pt] })),
  clearSketch: () => set({ sketchPoints: [] }),

  // History
  canUndo: false,
  canRedo: false,
  setHistory: (canUndo, canRedo) => set({ canUndo, canRedo }),

  // View
  showGrid: true,
  showAxes: true,
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleAxes: () => set((state) => ({ showAxes: !state.showAxes })),

  // Status
  statusMessage: 'Ready',
  setStatusMessage: (statusMessage) => set({ statusMessage }),
}));
