import { useEditorStore } from '../store/editorStore';
import {
  Orbit, Hand, ZoomIn, Maximize,
  Eye, Settings, Grid3x3, Magnet, ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { useState, useRef, useEffect } from 'react';

/**
 * Fusion 360-style Navigation Bar — positioned at the bottom center.
 * Contains: Orbit / Pan / Zoom / Fit / Look At + Display Settings + Grid/Snap
 */
export function StatusBar() {
  const {
    showGrid, showAxes, toggleGrid, toggleAxes,
    statusMessage, isSketchActive, sketchDof,
    viewStyle, setViewStyle,
  } = useEditorStore();

  return (
    <div className="flex items-center h-7 px-2 bg-fusion-panel border-t border-fusion-border text-[10px] text-fusion-text-disabled select-none">
      {/* Left: Status message */}
      <span className="text-fusion-text-disabled truncate max-w-[200px]">{statusMessage}</span>

      {/* Sketch DOF */}
      {isSketchActive && (
        <>
          <NavSep />
          <span className={clsx(
            'font-medium',
            sketchDof === 0 ? 'text-fusion-success' : 'text-fusion-warning',
          )}>
            DOF: {sketchDof}
          </span>
        </>
      )}

      <div className="flex-1" />

      {/* ── Center: Navigation tools ── */}
      <div className="flex items-center gap-0.5 bg-fusion-surface rounded-md px-1 py-0.5 border border-fusion-border-light">
        <NavButton icon={Orbit} label="Orbit" />
        <NavButton icon={Hand} label="Pan" />
        <NavButton icon={ZoomIn} label="Zoom" />
        <NavButton icon={Maximize} label="Fit All" />
        <NavButton icon={Eye} label="Look At" />
      </div>

      <NavSep />

      {/* Display Settings dropdown */}
      <DisplaySettingsDropdown
        viewStyle={viewStyle}
        setViewStyle={setViewStyle}
        showGrid={showGrid}
        showAxes={showAxes}
        toggleGrid={toggleGrid}
        toggleAxes={toggleAxes}
      />

      <NavSep />

      {/* Grid + Snap toggles */}
      <div className="flex items-center gap-1">
        <button
          className={clsx(
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors',
            showGrid ? 'text-fusion-blue bg-fusion-blue/10' : 'text-fusion-text-disabled hover:text-fusion-text-secondary',
          )}
          onClick={toggleGrid}
          title="Toggle Grid"
        >
          <Grid3x3 size={10} />
          <span>Grid</span>
        </button>
        <button
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] text-fusion-text-disabled hover:text-fusion-text-secondary transition-colors"
          title="Toggle Snap"
        >
          <Magnet size={10} />
          <span>Snap</span>
        </button>
      </div>

      <NavSep />

      {/* Units + Version */}
      <span className="text-fusion-text-disabled">Units: mm</span>
      <NavSep />
      <span className="text-fusion-text-disabled">r3ditor v0.3.0</span>
    </div>
  );
}

// ── Navigation button ──
function NavButton({ icon: Icon, label, active = false, onClick }: {
  icon: React.ElementType; label: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      className={clsx(
        'p-1 rounded transition-colors',
        active
          ? 'bg-fusion-blue/20 text-fusion-blue'
          : 'text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-hover',
      )}
      title={label}
      onClick={onClick}
    >
      <Icon size={13} />
    </button>
  );
}

// ── Display Settings dropdown ──
function DisplaySettingsDropdown({
  viewStyle, setViewStyle, showGrid, showAxes, toggleGrid, toggleAxes,
}: {
  viewStyle: string;
  setViewStyle: (s: 'shaded' | 'shadedEdges' | 'wireframe' | 'hidden') => void;
  showGrid: boolean;
  showAxes: boolean;
  toggleGrid: () => void;
  toggleAxes: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const viewStyles: { id: 'shaded' | 'shadedEdges' | 'wireframe' | 'hidden'; label: string }[] = [
    { id: 'shadedEdges', label: 'Shaded with Edges' },
    { id: 'shaded', label: 'Shaded' },
    { id: 'wireframe', label: 'Wireframe' },
    { id: 'hidden', label: 'Hidden Edges' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        className={clsx(
          'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] transition-colors',
          open ? 'text-fusion-text bg-fusion-surface-hover' : 'text-fusion-text-secondary hover:text-fusion-text',
        )}
        onClick={() => setOpen(!open)}
      >
        <Settings size={10} />
        <span>Display</span>
        <ChevronDown size={8} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 right-0 w-48 bg-fusion-surface border border-fusion-border-light rounded shadow-xl z-[200] py-1">
          <div className="px-3 py-1 text-[9px] text-fusion-text-disabled uppercase tracking-wider">Visual Style</div>
          {viewStyles.map((vs) => (
            <button
              key={vs.id}
              className={clsx(
                'w-full text-left px-3 py-1 text-xs transition-colors',
                viewStyle === vs.id
                  ? 'text-fusion-blue bg-fusion-blue/10'
                  : 'text-fusion-text hover:bg-fusion-hover',
              )}
              onClick={() => { setViewStyle(vs.id); setOpen(false); }}
            >
              {vs.label}
            </button>
          ))}
          <div className="h-px bg-fusion-border-light my-1" />
          <div className="px-3 py-1 text-[9px] text-fusion-text-disabled uppercase tracking-wider">Visibility</div>
          <ToggleItem label="Grid" checked={showGrid} onToggle={toggleGrid} />
          <ToggleItem label="Axes" checked={showAxes} onToggle={toggleAxes} />
        </div>
      )}
    </div>
  );
}

function ToggleItem({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1 text-xs text-fusion-text hover:bg-fusion-hover transition-colors"
      onClick={onToggle}
    >
      <div className={clsx(
        'w-3 h-3 rounded-sm border flex items-center justify-center',
        checked ? 'bg-fusion-blue border-fusion-blue' : 'border-fusion-border-light',
      )}>
        {checked && <span className="text-white text-[8px]">✓</span>}
      </div>
      <span>{label}</span>
    </button>
  );
}

function NavSep() {
  return <span className="w-px h-3 bg-fusion-border-light flex-shrink-0 mx-2" />;
}
