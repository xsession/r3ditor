import { useEditorStore } from '../store/editorStore';
import { useRef, useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import {
  Pencil, Trash2, Eye, EyeOff, Copy, ClipboardPaste,
  Info, Undo2, Redo2,
} from 'lucide-react';

/**
 * Fusion 360-style Marking Menu — 8-sector radial right-click menu.
 *
 * Layout (clock positions):
 *     12:00 = Edit Feature
 *  10:30 = Copy         1:30 = Paste
 *   9:00 = Undo         3:00 = Redo
 *   7:30 = Hide/Show    4:30 = Properties
 *     6:00 = Delete
 *
 * Usage: Right-click opens at cursor position. Flick gesture = quick select.
 * If released on center or backdrop → close without action.
 */

interface RadialItem {
  id: string;
  label: string;
  icon: React.ElementType;
  angle: number; // degrees from 12 o'clock (clockwise)
  action: () => void;
  disabled?: boolean;
  shortcut?: string;
}

const RADIUS = 72;
const ITEM_SIZE = 36;

export function MarkingMenu() {
  const { markingMenu, closeMarkingMenu, selectedIds, entities, clipboard } = useEditorStore();
  const { open, x, y } = markingMenu;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flickMode, setFlickMode] = useState(false);

  const hasSelection = selectedIds.length > 0;
  const selectedEntity = hasSelection ? entities.find((e) => e.id === selectedIds[0]) : null;
  const isHidden = selectedEntity && !selectedEntity.visible;

  const store = useEditorStore.getState();

  const items: RadialItem[] = [
    {
      id: 'edit', label: 'Edit Feature', icon: Pencil, angle: 0,
      action: () => {
        if (selectedEntity && selectedEntity.type !== 'imported') {
          store.openFeatureDialog(selectedEntity.type as any);
        }
      },
      disabled: !hasSelection,
      shortcut: 'Dbl-Click',
    },
    {
      id: 'paste', label: 'Paste', icon: ClipboardPaste, angle: 45,
      action: () => {
        const s = useEditorStore.getState();
        const cb = s.clipboard;
        if (cb.length > 0) {
          const newEntities = cb
            .map((id: string) => s.entities.find((e) => e.id === id))
            .filter(Boolean)
            .map((e: any) => ({
              ...e,
              id: `${e.id}_paste_${Date.now()}`,
              name: `${e.name} (Paste)`,
              transform: { ...e.transform, position: [e.transform.position[0] + 15, e.transform.position[1], e.transform.position[2]] },
            }));
          for (const ne of newEntities) {
            s.addEntity(ne);
          }
          s.setStatusMessage(`Pasted ${newEntities.length} item(s)`);
        }
      },
      disabled: !clipboard || clipboard.length === 0,
      shortcut: 'Ctrl+V',
    },
    {
      id: 'redo', label: 'Redo', icon: Redo2, angle: 90,
      action: () => { import('../api/tauri').then((api) => api.redo()); },
      shortcut: 'Ctrl+Y',
    },
    {
      id: 'properties', label: 'Properties', icon: Info, angle: 135,
      action: () => { store.toggleInspector(); },
      shortcut: 'I',
    },
    {
      id: 'delete', label: 'Delete', icon: Trash2, angle: 180,
      action: () => {
        const s = useEditorStore.getState();
        for (const id of s.selectedIds) { s.removeEntity(id); }
        s.clearSelection();
        s.setStatusMessage('Deleted selection');
      },
      disabled: !hasSelection,
      shortcut: 'Del',
    },
    {
      id: 'visibility', label: isHidden ? 'Show' : 'Hide', icon: isHidden ? Eye : EyeOff, angle: 225,
      action: () => {
        const s = useEditorStore.getState();
        for (const id of s.selectedIds) { s.toggleEntityVisibility(id); }
      },
      disabled: !hasSelection,
      shortcut: 'Space',
    },
    {
      id: 'undo', label: 'Undo', icon: Undo2, angle: 270,
      action: () => { import('../api/tauri').then((api) => api.undo()); },
      shortcut: 'Ctrl+Z',
    },
    {
      id: 'copy', label: 'Copy', icon: Copy, angle: 315,
      action: () => {
        const s = useEditorStore.getState();
        if (s.selectedIds.length > 0) {
          useEditorStore.setState({ clipboard: s.selectedIds.slice() });
          s.setStatusMessage(`Copied ${s.selectedIds.length} item(s)`);
        }
      },
      disabled: !hasSelection,
      shortcut: 'Ctrl+C',
    },
  ];

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMarkingMenu();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeMarkingMenu]);

  // Flick gesture: track pointer movement from center
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!open) return;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 30) {
      setFlickMode(true);
      // Calculate angle from center (0 = up, clockwise)
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      // Find closest item
      let closest: RadialItem | null = null;
      let closestDist = 60; // max angular distance
      for (const item of items) {
        let diff = Math.abs(item.angle - angle);
        if (diff > 180) diff = 360 - diff;
        if (diff < closestDist) {
          closestDist = diff;
          closest = item;
        }
      }
      setHoveredId(closest?.id ?? null);
    } else {
      setFlickMode(false);
      setHoveredId(null);
    }
  }, [open, x, y, items]);

  const handlePointerUp = useCallback(() => {
    if (flickMode && hoveredId) {
      const item = items.find((i) => i.id === hoveredId);
      if (item && !item.disabled) {
        item.action();
      }
    }
    closeMarkingMenu();
    setHoveredId(null);
    setFlickMode(false);
  }, [flickMode, hoveredId, items, closeMarkingMenu]);

  if (!open) return null;

  // Clamp position so menu doesn't overflow viewport
  const menuX = Math.max(RADIUS + 20, Math.min(x, window.innerWidth - RADIUS - 20));
  const menuY = Math.max(RADIUS + 20, Math.min(y, window.innerHeight - RADIUS - 20));

  return (
    <div
      className="fixed inset-0 z-[250]"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => { closeMarkingMenu(); setHoveredId(null); setFlickMode(false); }}
    >
      {/* Radial container */}
      <div
        ref={containerRef}
        className="absolute"
        style={{ left: menuX, top: menuY, width: 0, height: 0 }}
      >
        {/* Center dot */}
        <div className="absolute w-3 h-3 rounded-full bg-fusion-blue/60 border border-fusion-blue -translate-x-1.5 -translate-y-1.5" />

        {/* Radial items */}
        {items.map((item) => {
          const rad = (item.angle - 90) * (Math.PI / 180);
          const ix = Math.cos(rad) * RADIUS;
          const iy = Math.sin(rad) * RADIUS;
          const Icon = item.icon;
          const isHovered = hoveredId === item.id;

          return (
            <div
              key={item.id}
              className="absolute"
              style={{
                left: ix - ITEM_SIZE / 2,
                top: iy - ITEM_SIZE / 2,
                width: ITEM_SIZE,
                height: ITEM_SIZE,
              }}
            >
              <button
                className={clsx(
                  'w-full h-full flex items-center justify-center rounded-full border transition-all duration-100',
                  item.disabled
                    ? 'bg-fusion-surface/60 border-fusion-border-light text-fusion-text-disabled cursor-default'
                    : isHovered
                      ? 'bg-fusion-blue/20 border-fusion-blue text-fusion-blue scale-110 shadow-lg'
                      : 'bg-fusion-surface/90 border-fusion-border-light text-fusion-text-secondary hover:bg-fusion-hover hover:text-fusion-text',
                )}
                title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!item.disabled) {
                    item.action();
                    closeMarkingMenu();
                  }
                }}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => !flickMode && setHoveredId(null)}
              >
                <Icon size={15} />
              </button>

              {/* Label tooltip */}
              {isHovered && (
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 text-[9px] text-fusion-text-secondary bg-fusion-surface/95 border border-fusion-border-light rounded px-1.5 py-0.5 whitespace-nowrap shadow-sm pointer-events-none">
                  {item.label}
                  {item.shortcut && (
                    <span className="ml-1 text-fusion-text-disabled">{item.shortcut}</span>
                  )}
                </div>
              )}

              {/* Connecting line from center to item */}
              <svg
                className="absolute pointer-events-none"
                style={{
                  left: ITEM_SIZE / 2,
                  top: ITEM_SIZE / 2,
                  width: 1,
                  height: 1,
                  overflow: 'visible',
                }}
              >
                <line
                  x1={0}
                  y1={0}
                  x2={-ix}
                  y2={-iy}
                  stroke={isHovered ? '#0696d7' : '#555'}
                  strokeWidth={isHovered ? 1.5 : 0.5}
                  opacity={isHovered ? 0.6 : 0.15}
                />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
