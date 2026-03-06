import { useState, useRef, useEffect } from 'react';
import { Mouse, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

/**
 * NavigationStylePicker — FreeCAD-style navigation configuration.
 *
 * Allows users to switch between different 3D navigation paradigms:
 * - Fusion 360 (default): MMB orbit, Shift+MMB pan, Scroll zoom
 * - Blender: MMB orbit, Shift+MMB pan, Scroll zoom, RMB select
 * - FreeCAD: MMB orbit, Ctrl+MMB pan, Scroll zoom
 * - SolidWorks: MMB orbit, Ctrl+MMB pan, Scroll zoom
 * - Inventor: MMB orbit, MMB+Shift pan, Scroll zoom
 */

export interface NavigationStyle {
  id: string;
  name: string;
  orbit: string;
  pan: string;
  zoom: string;
  select: string;
  contextMenu: string;
}

export const NAVIGATION_STYLES: NavigationStyle[] = [
  {
    id: 'fusion360',
    name: 'Fusion 360',
    orbit: 'Middle Drag',
    pan: 'Shift + Middle Drag',
    zoom: 'Scroll',
    select: 'Left Click',
    contextMenu: 'Right Click',
  },
  {
    id: 'blender',
    name: 'Blender',
    orbit: 'Middle Drag',
    pan: 'Shift + Middle Drag',
    zoom: 'Scroll',
    select: 'Left Click',
    contextMenu: 'Right Click',
  },
  {
    id: 'freecad',
    name: 'FreeCAD',
    orbit: 'Middle Drag',
    pan: 'Ctrl + Middle Drag',
    zoom: 'Scroll',
    select: 'Left Click',
    contextMenu: 'Right Click',
  },
  {
    id: 'solidworks',
    name: 'SolidWorks',
    orbit: 'Middle Drag',
    pan: 'Ctrl + Middle Drag',
    zoom: 'Scroll',
    select: 'Left Click',
    contextMenu: 'Right Click',
  },
  {
    id: 'inventor',
    name: 'Inventor',
    orbit: 'Shift + Middle Drag',
    pan: 'Middle Drag',
    zoom: 'Scroll',
    select: 'Left Click',
    contextMenu: 'Right Click',
  },
];

export function NavigationStylePicker({
  value = 'fusion360',
  onChange,
}: {
  value?: string;
  onChange?: (styleId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = NAVIGATION_STYLES.find((s) => s.id === value) ?? NAVIGATION_STYLES[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        className={clsx(
          'flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors border',
          open
            ? 'bg-fusion-surface border-fusion-border-light text-fusion-text'
            : 'bg-transparent border-transparent text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-hover',
        )}
        onClick={() => setOpen(!open)}
        title="Navigation Style"
      >
        <Mouse size={11} />
        <span>{selected.name}</span>
        <ChevronDown size={9} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-72 bg-fusion-surface border border-fusion-border-light rounded shadow-2xl z-[200] py-1">
          <div className="px-3 py-1 text-[9px] text-fusion-text-disabled uppercase tracking-wider">
            Navigation Style
          </div>

          {NAVIGATION_STYLES.map((style) => (
            <button
              key={style.id}
              className={clsx(
                'w-full text-left px-3 py-2 text-xs transition-colors',
                value === style.id
                  ? 'text-fusion-blue bg-fusion-blue/10'
                  : 'text-fusion-text hover:bg-fusion-hover',
              )}
              onClick={() => {
                onChange?.(style.id);
                setOpen(false);
              }}
            >
              <div className="font-medium">{style.name}</div>
              <div className="flex gap-3 mt-0.5 text-[9px] text-fusion-text-disabled">
                <span>Orbit: {style.orbit}</span>
                <span>Pan: {style.pan}</span>
              </div>
            </button>
          ))}

          {/* Selected style details */}
          <div className="border-t border-fusion-border-light mt-1 pt-1 px-3 pb-2">
            <div className="text-[9px] text-fusion-text-disabled uppercase tracking-wider mb-1">
              Current: {selected.name}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
              <StyleRow label="Orbit" value={selected.orbit} />
              <StyleRow label="Pan" value={selected.pan} />
              <StyleRow label="Zoom" value={selected.zoom} />
              <StyleRow label="Select" value={selected.select} />
              <StyleRow label="Context Menu" value={selected.contextMenu} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StyleRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-fusion-text-disabled">{label}:</span>
      <span className="text-fusion-text">{value}</span>
    </>
  );
}
