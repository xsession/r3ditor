import { useEditorStore } from '../store/editorStore';
import { LayoutGrid, Move3d } from 'lucide-react';
import clsx from 'clsx';

export function StatusBar() {
  const { entities, selectedIds, activeTool, showGrid, showAxes, toggleGrid, toggleAxes, statusMessage, sketchPoints } =
    useEditorStore();

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-editor-surface border-t border-editor-border text-xs text-editor-muted">
      <span>
        Tool: <strong className="text-editor-text">{activeTool}</strong>
      </span>
      <span className="w-px h-3 bg-editor-border" />
      <span>
        Objects: <strong className="text-editor-text">{entities.length}</strong>
      </span>
      <span className="w-px h-3 bg-editor-border" />
      <span>
        Selected:{' '}
        <strong className="text-editor-text">{selectedIds.length}</strong>
      </span>

      <div className="flex-1" />

      {/* View toggles */}
      <button
        className={clsx(
          'p-1 rounded',
          showGrid ? 'text-editor-accent' : 'text-editor-muted'
        )}
        title="Toggle Grid"
        onClick={toggleGrid}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        className={clsx(
          'p-1 rounded',
          showAxes ? 'text-editor-accent' : 'text-editor-muted'
        )}
        title="Toggle Axes"
        onClick={toggleAxes}
      >
        <Move3d size={14} />
      </button>

      <span className="w-px h-3 bg-editor-border" />
      {activeTool === 'sketch' && (
        <>
          <span className="w-px h-3 bg-editor-border" />
          <span>Sketch points: <strong className="text-editor-accent">{sketchPoints.length}</strong></span>
        </>
      )}
      <span className="w-px h-3 bg-editor-border" />
      <span className="text-editor-muted truncate max-w-[200px]">{statusMessage}</span>
      <span className="w-px h-3 bg-editor-border" />
      <span>Units: mm</span>
      <span className="w-px h-3 bg-editor-border" />
      <span>r3ditor v0.2.0</span>
    </div>
  );
}
