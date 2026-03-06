import {
  MousePointer2, Pencil, ArrowUpFromLine, RotateCcw, Wind, Layers,
  CircleDot, Triangle, BoxSelect, Drill, PlusCircle,
  Copy, RotateCw, FlipHorizontal, SplitSquareHorizontal, Box, Cylinder,
  Ruler, Scissors, LayoutGrid,
  Square, Circle, Minus, Spline, Dot, RectangleHorizontal,
  Pen, MoveHorizontal, MoveVertical, Equal, Link, Anchor,
  ArrowRightLeft, GitMerge, Lock, Milestone,
  Download, ChevronDown, Wrench, Compass,
  Globe, Hexagon, Maximize2,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import type { FeatureTool, SketchTool, ConstraintType, FusionWorkspace } from '../store/editorStore';
import * as api from '../api/tauri';
import clsx from 'clsx';
import { useState, useRef, useEffect } from 'react';

// ── Fusion 360 workspace tabs ──
const workspaceTabs: FusionWorkspace[] = ['SOLID', 'SURFACE', 'SHEET METAL', 'MESH', 'PLASTIC'];

// ── SOLID workspace dropdown menus ──
interface ToolItem {
  id: FeatureTool;
  icon: React.ElementType;
  label: string;
  shortcut?: string;
}

const createTools: ToolItem[] = [
  { id: 'extrude', icon: ArrowUpFromLine, label: 'Extrude', shortcut: 'E' },
  { id: 'revolve', icon: RotateCcw, label: 'Revolve' },
  { id: 'sweep', icon: Wind, label: 'Sweep' },
  { id: 'loft', icon: Layers, label: 'Loft' },
  { id: 'rib', icon: Minus, label: 'Rib' },
  { id: 'hole', icon: Drill, label: 'Hole', shortcut: 'H' },
  { id: 'thread', icon: Wrench, label: 'Thread' },
  { id: 'box', icon: Box, label: 'Box' },
  { id: 'cylinder', icon: Cylinder, label: 'Cylinder' },
  { id: 'sphere', icon: Globe, label: 'Sphere' },
  { id: 'torus', icon: Circle, label: 'Torus' },
  { id: 'coil', icon: Hexagon, label: 'Coil' },
  { id: 'pipe', icon: Cylinder, label: 'Pipe' },
];

const modifyTools: ToolItem[] = [
  { id: 'fillet', icon: CircleDot, label: 'Fillet', shortcut: 'F' },
  { id: 'chamfer', icon: Triangle, label: 'Chamfer' },
  { id: 'shell', icon: BoxSelect, label: 'Shell' },
  { id: 'draft', icon: ArrowUpFromLine, label: 'Draft' },
  { id: 'split', icon: SplitSquareHorizontal, label: 'Split Body' },
  { id: 'boolean', icon: PlusCircle, label: 'Combine', shortcut: 'B' },
  { id: 'thicken', icon: Maximize2, label: 'Thicken' },
];

const assembleTools: ToolItem[] = [
  { id: 'boolean', icon: PlusCircle, label: 'New Component' },
];

const constructTools: ToolItem[] = [
  { id: 'mirrorFeature', icon: FlipHorizontal, label: 'Mirror' },
  { id: 'linearPattern', icon: Copy, label: 'Rectangular Pattern' },
  { id: 'circularPattern', icon: RotateCw, label: 'Circular Pattern' },
];

const inspectTools: ToolItem[] = [
  { id: 'select', icon: Ruler, label: 'Measure' },
];

// ── Sketch mode tools ──
const sketchDrawTools: { id: SketchTool; icon: React.ElementType; label: string; shortcut?: string }[] = [
  { id: 'line', icon: Minus, label: 'Line', shortcut: 'L' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: 'R' },
  { id: 'centerRectangle', icon: RectangleHorizontal, label: 'Center Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle', shortcut: 'C' },
  { id: 'arc3point', icon: Pen, label: '3-Point Arc', shortcut: 'A' },
  { id: 'spline', icon: Spline, label: 'Spline' },
  { id: 'point', icon: Dot, label: 'Point' },
  { id: 'slot', icon: RectangleHorizontal, label: 'Slot' },
  { id: 'polygon', icon: BoxSelect, label: 'Polygon' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
];

const sketchModifyTools: { id: SketchTool; icon: React.ElementType; label: string }[] = [
  { id: 'trim', icon: Scissors, label: 'Trim' },
  { id: 'offset', icon: Copy, label: 'Offset' },
  { id: 'mirror2d', icon: FlipHorizontal, label: 'Mirror' },
  { id: 'fillet2d', icon: CircleDot, label: 'Sketch Fillet' },
  { id: 'chamfer2d', icon: Triangle, label: 'Sketch Chamfer' },
  { id: 'constructionToggle', icon: LayoutGrid, label: 'Construction' },
];

const constraintTools: { id: ConstraintType; icon: React.ElementType; label: string }[] = [
  { id: 'coincident', icon: Dot, label: 'Coincident' },
  { id: 'concentric', icon: Circle, label: 'Concentric' },
  { id: 'parallel', icon: ArrowRightLeft, label: 'Parallel' },
  { id: 'perpendicular', icon: GitMerge, label: 'Perpendicular' },
  { id: 'tangent', icon: Pen, label: 'Tangent' },
  { id: 'horizontal', icon: MoveHorizontal, label: 'Horizontal' },
  { id: 'vertical', icon: MoveVertical, label: 'Vertical' },
  { id: 'equal', icon: Equal, label: 'Equal' },
  { id: 'midpoint', icon: Milestone, label: 'Midpoint' },
  { id: 'fix', icon: Lock, label: 'Fix' },
];

export function FeatureToolbar() {
  const {
    workspaceMode, fusionWorkspace, setFusionWorkspace,
    isSketchActive, activeTool, setTool,
    activeSketchTool, setSketchTool, finishSketch, cancelSketch,
    openFeatureDialog, beginPlaneSelection, sketchPhase,
  } = useEditorStore();

  // ── SKETCH MODE toolbar (Fusion 360 Sketch Palette style) ──
  if (isSketchActive) {
    // Phase 1: plane selection — show minimal bar with cancel only
    if (sketchPhase === 'selectPlane') {
      return (
        <div className="flex flex-col bg-fusion-toolbar border-b border-fusion-border select-none">
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-fusion-border">
            <span className="text-[10px] font-bold text-fusion-orange tracking-wider mr-3">SKETCH — SELECT PLANE</span>
            <div className="flex-1" />
            <span className="text-[10px] text-fusion-text-secondary mr-3">Click a reference plane or a face on an object</span>
            <button
              className="px-3 py-1 text-xs font-medium rounded bg-fusion-surface hover:bg-fusion-surface-hover text-fusion-text-secondary border border-fusion-border-light"
              onClick={cancelSketch}
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      );
    }

    // Phase 2: drawing — full sketch toolbar
    return (
      <div className="flex flex-col bg-fusion-toolbar border-b border-fusion-border select-none">
        {/* Sketch header bar */}
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-fusion-border">
          <span className="text-[10px] font-bold text-fusion-orange tracking-wider mr-3">SKETCH</span>

          {/* Create tools */}
          <DropdownMenu label="Create" tools={sketchDrawTools.map((t) => ({
            id: t.id as unknown as FeatureTool,
            icon: t.icon,
            label: t.label,
            shortcut: t.shortcut,
          }))} onSelect={(id) => setSketchTool(id as unknown as SketchTool)} />

          <DropdownMenu label="Modify" tools={sketchModifyTools.map((t) => ({
            id: t.id as unknown as FeatureTool,
            icon: t.icon,
            label: t.label,
          }))} onSelect={(id) => setSketchTool(id as unknown as SketchTool)} />

          <DropdownMenu label="Constraints" tools={constraintTools.map((t) => ({
            id: t.id as unknown as FeatureTool,
            icon: t.icon,
            label: t.label,
          }))} onSelect={() => {}} />

          <div className="flex-1" />

          {/* Finish / Cancel */}
          <button
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded bg-fusion-green hover:bg-fusion-green-hover text-white mr-1"
            onClick={finishSketch}
          >
            ✓ Finish Sketch
          </button>
          <button
            className="px-3 py-1 text-xs font-medium rounded bg-fusion-surface hover:bg-fusion-surface-hover text-fusion-text-secondary border border-fusion-border-light"
            onClick={cancelSketch}
          >
            ✕ Cancel
          </button>
        </div>

        {/* Sketch tool palette strip */}
        <div className="flex items-center gap-0.5 px-2 py-1">
          {sketchDrawTools.map((t) => (
            <ToolBtn
              key={t.id}
              icon={t.icon}
              label={t.shortcut ? `${t.label} (${t.shortcut})` : t.label}
              active={activeSketchTool === t.id}
              onClick={() => setSketchTool(t.id)}
            />
          ))}
          <ToolSep />
          {sketchModifyTools.map((t) => (
            <ToolBtn
              key={t.id}
              icon={t.icon}
              label={t.label}
              active={activeSketchTool === t.id}
              onClick={() => setSketchTool(t.id)}
            />
          ))}
          <ToolSep />
          <ToolBtn icon={Ruler} label="Dimension (D)" onClick={() => {}} accent />
        </div>
      </div>
    );
  }

  // ── DESIGN workspace toolbar (Fusion 360 style) ──
  if (workspaceMode === 'design') {
    return (
      <div className="flex flex-col bg-fusion-toolbar border-b border-fusion-border select-none">
        {/* Row 1: Workspace tabs (SOLID / SURFACE / SHEET METAL / MESH / PLASTIC) */}
        <div className="flex items-center border-b border-fusion-border">
          {workspaceTabs.map((ws) => (
            <button
              key={ws}
              className={clsx(
                'px-4 py-1.5 text-[11px] font-bold tracking-wider transition-colors relative',
                fusionWorkspace === ws
                  ? 'text-fusion-text-bright'
                  : 'text-fusion-text-secondary hover:text-fusion-text',
              )}
              onClick={() => setFusionWorkspace(ws)}
            >
              {ws}
              {fusionWorkspace === ws && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-fusion-orange" />
              )}
            </button>
          ))}
          <div className="flex-1" />
        </div>

        {/* Row 2: Tool menus + tool ribbon */}
        <div className="flex items-center gap-0.5 px-1 py-1">
          {/* Sketch button (always visible) */}
          <ToolBtn icon={Pencil} label="Create Sketch (S)" accent onClick={() => beginPlaneSelection()} />
          <ToolSep />

          {/* Dropdown menus */}
          <DropdownMenu label="Create" tools={createTools} onSelect={(id) => {
            if (id === 'box') { handleCreateBox(); return; }
            if (id === 'cylinder') { handleCreateCylinder(); return; }
            openFeatureDialog(id);
          }} />
          <DropdownMenu label="Modify" tools={modifyTools} onSelect={(id) => openFeatureDialog(id)} />
          <DropdownMenu label="Assemble" tools={assembleTools} onSelect={() => {}} />
          <DropdownMenu label="Construct" tools={constructTools} onSelect={(id) => openFeatureDialog(id)} />
          <DropdownMenu label="Inspect" tools={inspectTools} onSelect={() => setTool('measure')} />

          <ToolSep />

          {/* Quick-access icons for commonly used features */}
          <ToolBtn icon={ArrowUpFromLine} label="Extrude (E)" active={activeTool === 'extrude'} onClick={() => openFeatureDialog('extrude')} />
          <ToolBtn icon={CircleDot} label="Fillet (F)" active={activeTool === 'fillet'} onClick={() => openFeatureDialog('fillet')} />
          <ToolBtn icon={Drill} label="Hole (H)" active={activeTool === 'hole'} onClick={() => openFeatureDialog('hole')} />
          <ToolBtn icon={PlusCircle} label="Combine (B)" active={activeTool === 'boolean'} onClick={() => openFeatureDialog('boolean')} />

          <ToolSep />

          {/* Selection */}
          <ToolBtn icon={MousePointer2} label="Select (V)" active={activeTool === 'select'} onClick={() => setTool('select')} />

          <div className="flex-1" />

          {/* Measure */}
          <ToolBtn icon={Ruler} label="Measure (M)" active={activeTool === 'measure'} onClick={() => setTool('measure')} />
        </div>
      </div>
    );
  }

  // ── ASSEMBLY workspace toolbar ──
  if (workspaceMode === 'assembly') {
    return (
      <div className="flex flex-col bg-fusion-toolbar border-b border-fusion-border select-none">
        <div className="flex items-center border-b border-fusion-border">
          <span className="px-4 py-1.5 text-[11px] font-bold tracking-wider text-fusion-text-bright relative">
            ASSEMBLE
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-fusion-orange" />
          </span>
          <div className="flex-1" />
        </div>
        <div className="flex items-center gap-0.5 px-1 py-1">
          <ToolBtn icon={MousePointer2} label="Select" active={activeTool === 'select'} onClick={() => setTool('select')} />
          <ToolSep />
          <ToolBtn icon={Download} label="Insert" accent onClick={() => {}} />
          <ToolSep />
          <ToolBtn icon={Anchor} label="Ground" onClick={() => {}} />
          <ToolBtn icon={Link} label="Joint" onClick={() => {}} />
          <ToolBtn icon={RotateCcw} label="As-Built Joint" onClick={() => {}} />
          <ToolBtn icon={Lock} label="Rigid Group" onClick={() => {}} />
          <ToolSep />
          <ToolBtn icon={Compass} label="Motion Study" onClick={() => {}} />
          <div className="flex-1" />
        </div>
      </div>
    );
  }

  return null;
}

// ── Dropdown menu component ──

function DropdownMenu({
  label, tools, onSelect,
}: {
  label: string;
  tools: ToolItem[];
  onSelect: (id: FeatureTool) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className={clsx(
          'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
          open
            ? 'bg-fusion-toolbar-active text-fusion-text-bright'
            : 'text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-toolbar-hover',
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium">{label}</span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-0.5 w-52 bg-fusion-surface border border-fusion-border-light rounded shadow-xl z-[200] py-1 max-h-80 overflow-y-auto">
          {tools.map((t) => (
            <button
              key={t.id + t.label}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-fusion-text hover:bg-fusion-hover transition-colors"
              onClick={() => { onSelect(t.id); setOpen(false); }}
            >
              <t.icon size={13} className="text-fusion-text-secondary flex-shrink-0" />
              <span className="flex-1 text-left">{t.label}</span>
              {t.shortcut && <span className="text-[10px] text-fusion-text-disabled">{t.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

async function handleCreateBox() {
  try {
    await api.createBox('Box', 20, 20, 20);
    const entities = await api.getEntities();
    const existing = useEditorStore.getState().entities;
    useEditorStore.getState().setEntities(
      entities.map((e, idx) => {
        const prev = existing.find((ex) => ex.id === e.id);
        return {
          id: e.id, name: e.name, visible: e.visible, locked: e.locked,
          suppressed: false,
          faceCount: e.face_count, edgeCount: e.edge_count, vertexCount: e.vertex_count,
          type: 'box' as const,
          transform: prev?.transform ?? {
            position: [idx * 25, 10, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
          },
        };
      }),
    );
    const store = useEditorStore.getState();
    store.setTimeline([...store.timeline, {
      id: `box_${Date.now()}`, name: 'Box', type: 'box', suppressed: false, hasError: false,
    }]);
    store.setStatusMessage('Created Box');
  } catch (err) {
    useEditorStore.getState().setStatusMessage(`Error: ${err}`);
  }
}

async function handleCreateCylinder() {
  try {
    await api.createCylinder('Cylinder', 10, 30);
    const entities = await api.getEntities();
    const existing = useEditorStore.getState().entities;
    useEditorStore.getState().setEntities(
      entities.map((e, idx) => {
        const prev = existing.find((ex) => ex.id === e.id);
        return {
          id: e.id, name: e.name, visible: e.visible, locked: e.locked,
          suppressed: false,
          faceCount: e.face_count, edgeCount: e.edge_count, vertexCount: e.vertex_count,
          type: 'cylinder' as const,
          transform: prev?.transform ?? {
            position: [idx * 25, 10, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
          },
        };
      }),
    );
    const store = useEditorStore.getState();
    store.setTimeline([...store.timeline, {
      id: `cyl_${Date.now()}`, name: 'Cylinder', type: 'cylinder', suppressed: false, hasError: false,
    }]);
    store.setStatusMessage('Created Cylinder');
  } catch (err) {
    useEditorStore.getState().setStatusMessage(`Error: ${err}`);
  }
}

// ── Sub-components ──

function ToolSep() {
  return <div className="w-px h-6 bg-fusion-border-light mx-1 flex-shrink-0" />;
}

function ToolBtn({
  icon: Icon,
  label,
  active = false,
  accent = false,
  disabled = false,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        'p-1.5 rounded transition-colors flex-shrink-0',
        active
          ? 'bg-fusion-blue/20 text-fusion-blue'
          : accent
            ? 'text-fusion-orange hover:bg-fusion-orange/10'
            : 'text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-toolbar-hover',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={17} />
    </button>
  );
}
