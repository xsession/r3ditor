import { create } from 'zustand';

export interface Entity {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
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

interface EditorState {
  // Entities
  entities: Entity[];
  setEntities: (entities: Entity[]) => void;
  addEntity: (entity: Entity) => void;
  removeEntity: (id: string) => void;

  // Selection
  selectedIds: string[];
  select: (id: string) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  // Tool
  activeTool: Tool;
  setTool: (tool: Tool) => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  setHistory: (canUndo: boolean, canRedo: boolean) => void;

  // View
  showGrid: boolean;
  showAxes: boolean;
  toggleGrid: () => void;
  toggleAxes: () => void;
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
  setTool: (tool) => set({ activeTool: tool }),

  // History
  canUndo: false,
  canRedo: false,
  setHistory: (canUndo, canRedo) => set({ canUndo, canRedo }),

  // View
  showGrid: true,
  showAxes: true,
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleAxes: () => set((state) => ({ showAxes: !state.showAxes })),
}));
