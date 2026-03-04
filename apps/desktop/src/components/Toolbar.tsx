import {
  Box,
  Cylinder,
  MousePointer2,
  Move,
  RotateCw,
  Scaling,
  Pencil,
  ArrowUpFromLine,
  RotateCcw,
  CircleDot,
  Triangle,
  PlusCircle,
  Undo2,
  Redo2,
  FolderOpen,
  Save,
  Download,
  Ruler,
} from 'lucide-react';
import { useEditorStore, Tool } from '../store/editorStore';
import * as api from '../api/tauri';
import clsx from 'clsx';

const tools: { id: Tool; icon: React.ElementType; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
  { id: 'move', icon: Move, label: 'Move (G)' },
  { id: 'rotate', icon: RotateCw, label: 'Rotate (R)' },
  { id: 'scale', icon: Scaling, label: 'Scale (S)' },
  { id: 'sketch', icon: Pencil, label: 'Sketch (K)' },
  { id: 'extrude', icon: ArrowUpFromLine, label: 'Extrude (E)' },
  { id: 'revolve', icon: RotateCcw, label: 'Revolve' },
  { id: 'fillet', icon: CircleDot, label: 'Fillet (F)' },
  { id: 'chamfer', icon: Triangle, label: 'Chamfer' },
  { id: 'boolean', icon: PlusCircle, label: 'Boolean (B)' },
  { id: 'measure', icon: Ruler, label: 'Measure (M)' },
];

export function Toolbar() {
  const { activeTool, setTool, canUndo, canRedo } = useEditorStore();

  const handleCreateBox = async () => {
    await api.createBox('Box', 20, 20, 20);
    const entities = await api.getEntities();
    useEditorStore.getState().setEntities(
      entities.map((e) => ({
        id: e.id,
        name: e.name,
        visible: e.visible,
        locked: e.locked,
        faceCount: e.face_count,
        edgeCount: e.edge_count,
        vertexCount: e.vertex_count,
      }))
    );
  };

  const handleCreateCylinder = async () => {
    await api.createCylinder('Cylinder', 10, 30);
    const entities = await api.getEntities();
    useEditorStore.getState().setEntities(
      entities.map((e) => ({
        id: e.id,
        name: e.name,
        visible: e.visible,
        locked: e.locked,
        faceCount: e.face_count,
        edgeCount: e.edge_count,
        vertexCount: e.vertex_count,
      }))
    );
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-editor-surface border-b border-editor-border">
      {/* Logo */}
      <span className="text-editor-accent font-bold text-lg mr-3">r3ditor</span>

      {/* File operations */}
      <ToolbarButton icon={FolderOpen} label="Open" onClick={() => {}} />
      <ToolbarButton icon={Save} label="Save" onClick={() => {}} />
      <ToolbarButton icon={Download} label="Export" onClick={() => {}} />

      <div className="w-px h-6 bg-editor-border mx-1" />

      {/* Undo / Redo */}
      <ToolbarButton
        icon={Undo2}
        label="Undo"
        onClick={() => api.undo()}
        disabled={!canUndo}
      />
      <ToolbarButton
        icon={Redo2}
        label="Redo"
        onClick={() => api.redo()}
        disabled={!canRedo}
      />

      <div className="w-px h-6 bg-editor-border mx-1" />

      {/* Tools */}
      {tools.map((tool) => (
        <ToolbarButton
          key={tool.id}
          icon={tool.icon}
          label={tool.label}
          active={activeTool === tool.id}
          onClick={() => setTool(tool.id)}
        />
      ))}

      <div className="w-px h-6 bg-editor-border mx-1" />

      {/* Create primitives */}
      <ToolbarButton icon={Box} label="Create Box" onClick={handleCreateBox} />
      <ToolbarButton icon={Cylinder} label="Create Cylinder" onClick={handleCreateCylinder} />
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        'p-1.5 rounded transition-colors',
        active
          ? 'bg-editor-accent/20 text-editor-accent'
          : 'text-editor-muted hover:text-editor-text hover:bg-editor-border/50',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={18} />
    </button>
  );
}
