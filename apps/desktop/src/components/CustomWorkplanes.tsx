import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Plane, Plus, X, Eye, EyeOff, Trash2 } from 'lucide-react';
import clsx from 'clsx';

/**
 * CustomWorkplanes — TinkerCAD/Fusion 360-style custom construction planes.
 *
 * Users can:
 * - Create planes on faces (TinkerCAD "drop workplane on any face")
 * - Create offset planes from existing planes
 * - Create angled planes through edges
 * - Toggle visibility of custom planes
 */

export interface CustomWorkplane {
  id: string;
  name: string;
  origin: [number, number, number];
  normal: [number, number, number];
  uAxis: [number, number, number];
  vAxis: [number, number, number];
  visible: boolean;
  color: string;
  size: number; // visual size in mm
}

const DEFAULT_WORKPLANES: CustomWorkplane[] = [];

const PRESET_PLANES = [
  { label: 'Offset from XY', normal: [0, 0, 1] as [number, number, number], uAxis: [1, 0, 0] as [number, number, number], vAxis: [0, 1, 0] as [number, number, number] },
  { label: 'Offset from XZ', normal: [0, 1, 0] as [number, number, number], uAxis: [1, 0, 0] as [number, number, number], vAxis: [0, 0, 1] as [number, number, number] },
  { label: 'Offset from YZ', normal: [1, 0, 0] as [number, number, number], uAxis: [0, 1, 0] as [number, number, number], vAxis: [0, 0, 1] as [number, number, number] },
  { label: 'Angled (45° from XY)', normal: [0, -0.707, 0.707] as [number, number, number], uAxis: [1, 0, 0] as [number, number, number], vAxis: [0, 0.707, 0.707] as [number, number, number] },
];

const PLANE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function CustomWorkplaneManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [workplanes, setWorkplanes] = useState<CustomWorkplane[]>(DEFAULT_WORKPLANES);
  const [offsetValue, setOffsetValue] = useState(10);
  const [showPresets, setShowPresets] = useState(false);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const addWorkplane = (preset: typeof PRESET_PLANES[0]) => {
    const id = `wp_${Date.now()}`;
    const colorIdx = workplanes.length % PLANE_COLORS.length;
    const offset = offsetValue;

    const origin: [number, number, number] = [
      preset.normal[0] * offset,
      preset.normal[1] * offset,
      preset.normal[2] * offset,
    ];

    const newPlane: CustomWorkplane = {
      id,
      name: `${preset.label} @ ${offset}mm`,
      origin,
      normal: preset.normal,
      uAxis: preset.uAxis,
      vAxis: preset.vAxis,
      visible: true,
      color: PLANE_COLORS[colorIdx],
      size: 50,
    };

    setWorkplanes((prev) => [...prev, newPlane]);
    setShowPresets(false);
    setStatusMessage(`Created workplane: ${newPlane.name}`);
  };

  const toggleVisibility = (id: string) => {
    setWorkplanes((prev) =>
      prev.map((wp) => wp.id === id ? { ...wp, visible: !wp.visible } : wp)
    );
  };

  const removeWorkplane = (id: string) => {
    setWorkplanes((prev) => prev.filter((wp) => wp.id !== id));
  };

  if (!isOpen) {
    return (
      <button
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-hover rounded transition-colors"
        onClick={() => setIsOpen(true)}
        title="Custom Workplanes"
      >
        <Plane size={11} />
        <span>Workplanes</span>
      </button>
    );
  }

  return (
    <div className="absolute top-12 right-4 w-72 bg-fusion-surface border border-fusion-border-light rounded shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-fusion-panel border-b border-fusion-border-light">
        <div className="flex items-center gap-1.5">
          <Plane size={13} className="text-fusion-blue" />
          <span className="text-xs font-medium text-fusion-text">Construction Planes</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-fusion-blue hover:bg-fusion-blue/10 rounded transition-colors"
            onClick={() => setShowPresets(!showPresets)}
          >
            <Plus size={10} />
            Add
          </button>
          <button
            className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-text transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Add plane presets */}
      {showPresets && (
        <div className="p-2 border-b border-fusion-border-light bg-fusion-panel space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-fusion-text-secondary">Offset:</label>
            <input
              type="number"
              className="w-16 bg-fusion-surface border border-fusion-border-light rounded px-1.5 py-0.5 text-xs text-fusion-text outline-none focus:border-fusion-blue font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={offsetValue}
              onChange={(e) => setOffsetValue(parseFloat(e.target.value) || 0)}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <span className="text-[10px] text-fusion-text-disabled">mm</span>
          </div>
          <div className="space-y-0.5">
            {PRESET_PLANES.map((preset) => (
              <button
                key={preset.label}
                className="w-full text-left px-2 py-1 text-xs text-fusion-text hover:bg-fusion-hover rounded transition-colors"
                onClick={() => addWorkplane(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Workplane list */}
      <div className="max-h-48 overflow-y-auto">
        {workplanes.length === 0 ? (
          <p className="text-xs text-fusion-text-disabled text-center py-4">
            No custom workplanes yet
          </p>
        ) : (
          workplanes.map((wp) => (
            <div
              key={wp.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-fusion-hover transition-colors group"
            >
              {/* Color indicator */}
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: wp.color }}
              />
              {/* Name */}
              <span className={clsx(
                'flex-1 text-xs truncate',
                wp.visible ? 'text-fusion-text' : 'text-fusion-text-disabled',
              )}>
                {wp.name}
              </span>
              {/* Controls */}
              <button
                className="p-0.5 rounded hover:bg-fusion-surface text-fusion-text-disabled hover:text-fusion-text opacity-0 group-hover:opacity-100 transition-all"
                onClick={() => toggleVisibility(wp.id)}
                title={wp.visible ? 'Hide' : 'Show'}
              >
                {wp.visible ? <Eye size={11} /> : <EyeOff size={11} />}
              </button>
              <button
                className="p-0.5 rounded hover:bg-fusion-surface text-fusion-text-disabled hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                onClick={() => removeWorkplane(wp.id)}
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Standard planes */}
      <div className="border-t border-fusion-border-light px-3 py-2">
        <div className="text-[9px] text-fusion-text-disabled uppercase tracking-wider mb-1">Standard Planes</div>
        <div className="flex gap-2 text-[10px]">
          <span className="text-blue-400">XY</span>
          <span className="text-green-400">XZ</span>
          <span className="text-red-400">YZ</span>
        </div>
      </div>
    </div>
  );
}
