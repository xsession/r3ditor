import { useEditorStore, type SelectionFilter } from '../store/editorStore';
import {
  Box, Layers, Minus, Circle, Component,
} from 'lucide-react';
import clsx from 'clsx';

const filters: { id: SelectionFilter; icon: React.ElementType; label: string }[] = [
  { id: 'body', icon: Box, label: 'Body' },
  { id: 'face', icon: Layers, label: 'Face' },
  { id: 'edge', icon: Minus, label: 'Edge' },
  { id: 'vertex', icon: Circle, label: 'Vertex' },
  { id: 'component', icon: Component, label: 'Component' },
];

/**
 * Selection filter toolbar — toggle between Body / Face / Edge / Vertex / Component.
 * Appears below the main toolbar, Fusion 360 style.
 */
export function SelectionFilterBar() {
  const { selectionFilter, setSelectionFilter, isSketchActive } = useEditorStore();

  // Hide during sketch mode
  if (isSketchActive) return null;

  return (
    <div className="flex items-center gap-0.5 px-2 py-0.5 bg-fusion-panel border-b border-fusion-border select-none">
      <span className="text-[9px] text-fusion-text-disabled uppercase tracking-wider mr-2">Selection:</span>
      {filters.map((f) => (
        <button
          key={f.id}
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors',
            selectionFilter === f.id
              ? 'bg-fusion-blue/15 text-fusion-blue font-medium'
              : 'text-fusion-text-disabled hover:text-fusion-text-secondary hover:bg-fusion-hover',
          )}
          onClick={() => setSelectionFilter(f.id)}
          title={`Select ${f.label}s`}
        >
          <f.icon size={10} />
          <span>{f.label}</span>
        </button>
      ))}
    </div>
  );
}
