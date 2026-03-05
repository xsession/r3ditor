import {
  ChevronRight, ChevronDown,
  Pencil, Trash2, Box, Cylinder, Circle,
  Crosshair, ArrowUpFromLine, RotateCcw, Wind, Layers,
  CircleDot, Triangle, BoxSelect, FlipHorizontal, Copy,
  AlertCircle, CheckCircle2, MinusCircle, XCircle,
  Eye, EyeOff, Settings, Compass, Axis3d, Dot, Folder,
} from 'lucide-react';
import { useEditorStore, type BrowserNode } from '../store/editorStore';
import * as api from '../api/tauri';
import clsx from 'clsx';
import { useState } from 'react';

// ── Node type → icon mapping ──
const nodeIcons: Record<string, React.ElementType> = {
  documentSettings: Settings,
  namedViews: Eye,
  analysis: Compass,
  component: Box,
  origin: Crosshair,
  plane: Layers,
  axis: Axis3d,
  point: Dot,
  body: Box,
  sketch: Pencil,
  extrude: ArrowUpFromLine,
  revolve: RotateCcw,
  sweep: Wind,
  loft: Layers,
  fillet: CircleDot,
  chamfer: Triangle,
  shell: BoxSelect,
  boolean: Box,
  pattern: Copy,
  mirror: FlipHorizontal,
  hole: Circle,
  import: Box,
  joint: Cylinder,
  group: Folder,
  construction: Folder,
};

// ── Status indicators ──
const statusIcons: Record<string, { icon: React.ElementType; color: string }> = {
  valid: { icon: CheckCircle2, color: 'text-fusion-success' },
  error: { icon: XCircle, color: 'text-fusion-error' },
  stale: { icon: AlertCircle, color: 'text-fusion-warning' },
  suppressed: { icon: MinusCircle, color: 'text-fusion-text-disabled' },
};

/**
 * Fusion 360-style "Browser" panel — left sidebar showing component hierarchy.
 * Shows: Document Settings > Component > Origin/Bodies/Sketches/Construction
 */
export function FeatureTree() {
  const {
    browserTree, toggleBrowserNode, toggleBrowserNodeVisibility,
    entities, selectedIds, select, removeEntity, browserOpen,
  } = useEditorStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  if (!browserOpen) return null;

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEntity(id);
      removeEntity(id);
    } catch { /* entity may not exist in kernel */ }
    const store = useEditorStore.getState();
    store.setBrowserTree(store.browserTree.filter((n) => n.id !== id));
  };

  const handleContextMenu = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  };

  return (
    <div className="w-56 bg-fusion-panel border-r border-fusion-border flex flex-col relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-fusion-panel-header border-b border-fusion-border">
        <h2 className="text-[11px] font-semibold text-fusion-text uppercase tracking-wider">
          Browser
        </h2>
        <button className="p-0.5 text-fusion-text-secondary hover:text-fusion-text rounded hover:bg-fusion-hover">
          <Settings size={11} />
        </button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto py-1" onClick={() => setContextMenu(null)}>
        {browserTree.map((node) => (
          <BrowserTreeNode
            key={node.id}
            node={node}
            depth={0}
            onToggle={toggleBrowserNode}
            onToggleVisibility={toggleBrowserNodeVisibility}
            onSelect={select}
            selectedIds={selectedIds}
            onContextMenu={handleContextMenu}
          />
        ))}

        {/* Entity list (physical objects from kernel) */}
        {entities.length > 0 && (
          <div className="mt-1 border-t border-fusion-border pt-1">
            <div className="px-3 py-1 text-[10px] text-fusion-text-disabled uppercase tracking-wider">
              Bodies ({entities.length})
            </div>
            {entities.map((entity) => {
              const isSelected = selectedIds.includes(entity.id);
              return (
                <div
                  key={entity.id}
                  className={clsx(
                    'group flex items-center gap-1.5 px-3 py-1 cursor-pointer text-xs',
                    isSelected
                      ? 'bg-fusion-blue/15 text-fusion-blue'
                      : 'text-fusion-text-secondary hover:bg-fusion-hover',
                    entity.suppressed && 'opacity-40 line-through',
                  )}
                  onClick={() => select(entity.id)}
                  onContextMenu={(e) => handleContextMenu(e, entity.id)}
                >
                  {entity.type === 'cylinder' ? <Cylinder size={12} /> : <Box size={12} />}
                  <span className="flex-1 truncate">{entity.name}</span>
                  <button
                    className="p-0.5 opacity-0 group-hover:opacity-100 text-fusion-text-disabled hover:text-fusion-error transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleDelete(entity.id); }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={() => { handleDelete(contextMenu.nodeId); setContextMenu(null); }}
        />
      )}
    </div>
  );
}

// ── Recursive tree node (Fusion 360 style) ──
function BrowserTreeNode({
  node, depth, onToggle, onToggleVisibility, onSelect, selectedIds, onContextMenu,
}: {
  node: BrowserNode;
  depth: number;
  onToggle: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onSelect: (id: string) => void;
  selectedIds: string[];
  onContextMenu: (e: React.MouseEvent, id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isSelected = selectedIds.includes(node.id);
  const Icon = nodeIcons[node.type] ?? Box;
  const isComponent = node.type === 'component';
  const isOrigin = node.type === 'origin';
  const isFolder = node.type === 'group' || node.type === 'construction';

  return (
    <>
      <div
        className={clsx(
          'group flex items-center gap-1 pr-1 py-[3px] cursor-pointer text-xs transition-colors',
          isSelected
            ? 'bg-fusion-blue/15 text-fusion-blue'
            : isComponent
              ? 'text-fusion-text hover:bg-fusion-hover'
              : 'text-fusion-text-secondary hover:bg-fusion-hover',
          node.status === 'suppressed' && 'line-through opacity-50',
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onSelect(node.id);
        }}
        onContextMenu={(e) => onContextMenu(e, node.id)}
      >
        {/* Expand/collapse chevron */}
        <span className="w-3 flex-shrink-0 text-fusion-text-disabled">
          {hasChildren ? (
            node.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />
          ) : <span className="w-3" />}
        </span>

        {/* Node icon */}
        <Icon size={12} className={clsx(
          isSelected ? 'text-fusion-blue'
            : isComponent ? 'text-fusion-orange'
            : isOrigin ? 'text-fusion-text-secondary'
            : isFolder ? 'text-fusion-text-disabled'
            : 'text-fusion-text-disabled',
        )} />

        {/* Name */}
        <span className={clsx('flex-1 truncate', isComponent && 'font-medium')}>{node.name}</span>

        {/* Visibility eye (on hover) */}
        <button
          className={clsx(
            'p-0.5 rounded transition-opacity flex-shrink-0',
            node.visible
              ? 'opacity-0 group-hover:opacity-60 text-fusion-text-disabled hover:text-fusion-text'
              : 'opacity-100 text-fusion-text-disabled',
          )}
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.id); }}
          title={node.visible ? 'Hide' : 'Show'}
        >
          {node.visible ? <Eye size={10} /> : <EyeOff size={10} />}
        </button>

        {/* Status icon for features */}
        {!isOrigin && !isFolder && node.type !== 'documentSettings' && node.type !== 'namedViews' && node.type !== 'analysis' && node.type !== 'plane' && node.type !== 'axis' && node.type !== 'point' && node.type !== 'component' && (
          (() => {
            const status = statusIcons[node.status] ?? statusIcons.valid;
            const StatusIcon = status.icon;
            return <StatusIcon size={10} className={status.color} />;
          })()
        )}
      </div>

      {/* Children */}
      {hasChildren && node.expanded && (
        node.children.map((child) => (
          <BrowserTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            onToggle={onToggle}
            onToggleVisibility={onToggleVisibility}
            onSelect={onSelect}
            selectedIds={selectedIds}
            onContextMenu={onContextMenu}
          />
        ))
      )}
    </>
  );
}

// ── Context menu ──
function ContextMenu({
  x, y, onClose, onDelete,
}: {
  x: number; y: number; onClose: () => void; onDelete: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div
        className="fixed z-[101] bg-fusion-surface border border-fusion-border-light rounded shadow-lg py-1 min-w-[160px]"
        style={{ left: x, top: y }}
      >
        <CtxItem label="Edit Feature" onClick={onClose} />
        <CtxItem label="Rename" onClick={onClose} />
        <CtxItem label="Suppress" onClick={onClose} />
        <CtxItem label="Move to Component" onClick={onClose} />
        <div className="h-px bg-fusion-border-light my-1" />
        <CtxItem label="Delete" onClick={onDelete} danger />
      </div>
    </>
  );
}

function CtxItem({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={clsx(
        'w-full text-left px-3 py-1.5 text-xs transition-colors',
        danger
          ? 'text-fusion-error hover:bg-fusion-error/10'
          : 'text-fusion-text hover:bg-fusion-hover',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
