import { useEditorStore } from '../store/editorStore';
import { Ruler, X } from 'lucide-react';

/**
 * Measure Tool Readout — floating panel showing measurement results.
 *
 * Visible when the measure tool is active. Shows:
 * - Point A & B coordinates
 * - Distance between points
 * - Delta X/Y/Z components
 *
 * All platforms implement click-2-entities → instant distance readout.
 */
export function MeasureReadout() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const measureResult = useEditorStore((s) => s.measureResult);
  const clearMeasure = useEditorStore((s) => s.clearMeasure);
  const setTool = useEditorStore((s) => s.setTool);

  if (activeTool !== 'measure') return null;

  const { pointA, pointB, distance } = measureResult;

  return (
    <div className="absolute top-2 right-2 z-40 w-56 bg-fusion-surface/95 border border-fusion-border-light rounded-lg shadow-xl backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-fusion-blue/10 border-b border-fusion-border-light">
        <Ruler size={12} className="text-fusion-blue" />
        <span className="text-[11px] font-medium text-fusion-blue flex-1">Measure</span>
        <button
          className="text-fusion-text-disabled hover:text-fusion-text transition-colors"
          onClick={() => { clearMeasure(); setTool('select'); }}
          title="Close measure tool"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {/* Instructions */}
        {!pointA && (
          <p className="text-[10px] text-fusion-text-disabled italic">
            Click first point on geometry…
          </p>
        )}
        {pointA && !pointB && (
          <p className="text-[10px] text-fusion-text-disabled italic">
            Click second point…
          </p>
        )}

        {/* Point A */}
        {pointA && (
          <div className="space-y-0.5">
            <div className="text-[9px] text-fusion-text-disabled uppercase tracking-wider">Point A</div>
            <div className="flex gap-2 text-[10px] text-fusion-text font-mono">
              <span className="text-red-400">X: {pointA[0].toFixed(2)}</span>
              <span className="text-green-400">Y: {pointA[1].toFixed(2)}</span>
              <span className="text-blue-400">Z: {pointA[2].toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Point B */}
        {pointB && (
          <div className="space-y-0.5">
            <div className="text-[9px] text-fusion-text-disabled uppercase tracking-wider">Point B</div>
            <div className="flex gap-2 text-[10px] text-fusion-text font-mono">
              <span className="text-red-400">X: {pointB[0].toFixed(2)}</span>
              <span className="text-green-400">Y: {pointB[1].toFixed(2)}</span>
              <span className="text-blue-400">Z: {pointB[2].toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Distance result */}
        {distance !== null && pointA && pointB && (
          <>
            <div className="h-px bg-fusion-border-light" />
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-fusion-text-disabled uppercase tracking-wider">Distance</span>
                <span className="text-sm font-medium text-fusion-orange font-mono">
                  {distance.toFixed(3)} mm
                </span>
              </div>
              {/* Delta components */}
              <div className="flex gap-2 text-[9px] text-fusion-text-secondary font-mono">
                <span>ΔX: {Math.abs(pointB[0] - pointA[0]).toFixed(2)}</span>
                <span>ΔY: {Math.abs(pointB[1] - pointA[1]).toFixed(2)}</span>
                <span>ΔZ: {Math.abs(pointB[2] - pointA[2]).toFixed(2)}</span>
              </div>
            </div>
          </>
        )}

        {/* Clear button */}
        {pointA && (
          <button
            className="w-full mt-1 px-2 py-1 text-[10px] text-fusion-text-secondary bg-fusion-hover rounded border border-fusion-border-light hover:bg-fusion-surface-hover transition-colors"
            onClick={clearMeasure}
          >
            Clear Measurement
          </button>
        )}
      </div>
    </div>
  );
}
