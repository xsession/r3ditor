import {
  Orbit, Hand, ZoomIn, Maximize, Eye,
  Settings, Grid3x3, Magnet, ChevronDown, Box,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { NavigationStylePicker } from './NavigationStylePicker';
import clsx from 'clsx';
import { useState, useRef, useEffect } from 'react';

/**
 * Fusion 360 Navigation Bar — floating pill-shaped bar at the bottom-center of the viewport.
 *
 * In Fusion 360, this is a semi-transparent dark bar that floats above the canvas,
 * containing: [Orbit] [Pan] [Zoom] [Fit] | [Display Settings ▾] | [Grid] [Snap] | [Persp/Ortho]
 *
 * This is separate from the bottom status bar — it's part of the viewport overlay.
 */
export function ViewportNavBar() {
  const {
    showGrid, showAxes, toggleGrid, toggleAxes,
    viewStyle, setViewStyle,
    cameraProjection, toggleCameraProjection,
    navigationStyle, setNavigationStyle,
  } = useEditorStore();

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 select-none">
      <div className="flex items-center gap-1 bg-[#2d2d2d]/90 backdrop-blur-sm rounded-full px-2 py-1 border border-[#444]/50 shadow-lg">
        {/* Navigation tools */}
        <div className="flex items-center gap-0.5">
          <NavBtn icon={Orbit} label="Orbit (Middle Mouse)" />
          <NavBtn icon={Hand} label="Pan (Shift+Middle Mouse)" />
          <NavBtn icon={ZoomIn} label="Zoom (Scroll)" />
          <NavBtn icon={Maximize} label="Fit All (F)" />
          <NavBtn icon={Eye} label="Look At" />
        </div>

        <NavDivider />

        {/* Display settings */}
        <DisplayMenu
          viewStyle={viewStyle}
          setViewStyle={setViewStyle}
          showGrid={showGrid}
          showAxes={showAxes}
          toggleGrid={toggleGrid}
          toggleAxes={toggleAxes}
        />

        <NavDivider />

        {/* Nav style */}
        <NavigationStylePicker value={navigationStyle} onChange={setNavigationStyle} />

        <NavDivider />

        {/* Projection toggle */}
        <button
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] transition-colors',
            cameraProjection === 'orthographic'
              ? 'text-fusion-blue bg-fusion-blue/15'
              : 'text-fusion-text-disabled hover:text-fusion-text-secondary',
          )}
          onClick={toggleCameraProjection}
          title={`${cameraProjection} projection`}
        >
          <Box size={10} />
          <span>{cameraProjection === 'perspective' ? 'Persp' : 'Ortho'}</span>
        </button>

        <NavDivider />

        {/* Grid + Snap */}
        <button
          className={clsx(
            'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] transition-colors',
            showGrid ? 'text-fusion-blue' : 'text-fusion-text-disabled hover:text-fusion-text-secondary',
          )}
          onClick={toggleGrid}
          title="Toggle Grid"
        >
          <Grid3x3 size={10} />
        </button>
        <button
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] text-fusion-text-disabled hover:text-fusion-text-secondary transition-colors"
          title="Toggle Snap"
        >
          <Magnet size={10} />
        </button>
      </div>
    </div>
  );
}

function NavBtn({ icon: Icon, label, active = false, onClick }: {
  icon: React.ElementType; label: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      className={clsx(
        'flex items-center justify-center w-[26px] h-[26px] rounded-full transition-colors',
        active
          ? 'bg-fusion-blue/20 text-fusion-blue'
          : 'text-fusion-text-secondary hover:text-fusion-text hover:bg-[#ffffff]/10',
      )}
      title={label}
      onClick={onClick}
    >
      <Icon size={13} />
    </button>
  );
}

function NavDivider() {
  return <div className="w-px h-4 bg-[#555]/60 mx-0.5 shrink-0" />;
}

function DisplayMenu({
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
          'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] transition-colors',
          open ? 'text-fusion-text bg-[#ffffff]/10' : 'text-fusion-text-secondary hover:text-fusion-text',
        )}
        onClick={() => setOpen(!open)}
      >
        <Settings size={10} />
        <span>Display</span>
        <ChevronDown size={8} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-fusion-surface border border-fusion-border-light rounded-fusion-lg shadow-fusion-dropdown z-[200] py-1 animate-fusion-fade-in">
          <div className="px-3 py-1 text-[9px] text-fusion-text-disabled uppercase tracking-[0.06em]">Visual Style</div>
          {viewStyles.map((vs) => (
            <button
              key={vs.id}
              className={clsx(
                'w-full text-left px-3 py-1.5 text-[11px] transition-colors',
                viewStyle === vs.id ? 'text-fusion-blue bg-fusion-blue/10' : 'text-fusion-text hover:bg-fusion-hover',
              )}
              onClick={() => { setViewStyle(vs.id); setOpen(false); }}
            >
              {vs.label}
            </button>
          ))}
          <div className="h-px bg-fusion-border-light my-1" />
          <div className="px-3 py-1 text-[9px] text-fusion-text-disabled uppercase tracking-[0.06em]">Visibility</div>
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
      className="w-full flex items-center gap-2 px-3 py-1 text-[11px] text-fusion-text hover:bg-fusion-hover transition-colors"
      onClick={onToggle}
    >
      <div className={clsx(
        'w-3 h-3 rounded-sm border flex items-center justify-center transition-colors',
        checked ? 'bg-fusion-blue border-fusion-blue' : 'border-fusion-border-lighter bg-transparent',
      )}>
        {checked && <span className="text-white text-[7px] font-bold">✓</span>}
      </div>
      <span>{label}</span>
    </button>
  );
}
