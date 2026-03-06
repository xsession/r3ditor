import { useEditorStore } from '../store/editorStore';
import clsx from 'clsx';
import { getConstraintColor } from '../sketch/autoConstraints';

/**
 * Sketch Status Overlay — shows constraint color coding and auto-constraint indicators.
 *
 * FreeCAD pattern:
 * - **White** = unconstrained (DOF > 0)
 * - **Green** = fully constrained (DOF == 0)
 * - **Red** = over-constrained
 * - **Blue** = construction geometry
 *
 * Positioned at the top of the viewport during sketch mode.
 */
export function SketchConstraintOverlay() {
  const isSketchActive = useEditorStore((s) => s.isSketchActive);
  const sketchPhase = useEditorStore((s) => s.sketchPhase);
  const sketchDof = useEditorStore((s) => s.sketchDof);
  const sketchConstraints = useEditorStore((s) => s.sketchConstraints);
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const sketchSegments = useEditorStore((s) => s.sketchSegments);
  const autoConstraintsEnabled = useEditorStore((s) => s.autoConstraintsEnabled);
  const toggleAutoConstraints = useEditorStore((s) => s.toggleAutoConstraints);

  if (!isSketchActive || sketchPhase !== 'drawing') return null;

  const isOverConstrained = sketchDof < 0;
  const isFullyConstrained = sketchDof === 0 && sketchPoints.length > 0;
  const constraintColor = getConstraintColor(sketchDof, false, isOverConstrained);

  const satisfied = sketchConstraints.filter((c) => c.satisfied).length;
  const total = sketchConstraints.length;

  return (
    <div className="absolute top-2 left-2 z-40 flex flex-col gap-1.5">
      {/* DOF indicator with FreeCAD-style color coding */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fusion-surface/90 border border-fusion-border-light shadow-lg backdrop-blur-sm"
      >
        {/* Color dot */}
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: constraintColor }}
        />

        {/* DOF text */}
        <span className={clsx(
          'text-[11px] font-medium',
          isOverConstrained ? 'text-red-400' : isFullyConstrained ? 'text-green-400' : 'text-fusion-text',
        )}>
          {isOverConstrained
            ? 'Over-constrained!'
            : isFullyConstrained
              ? 'Fully Constrained ✓'
              : `DOF: ${sketchDof}`}
        </span>

        {/* Separator */}
        <span className="w-px h-3 bg-fusion-border-light" />

        {/* Counts */}
        <span className="text-[9px] text-fusion-text-disabled">
          {sketchPoints.length} pts · {sketchSegments.length} segs · {satisfied}/{total} constraints
        </span>
      </div>

      {/* Auto-constraint toggle */}
      <button
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] border transition-colors',
          autoConstraintsEnabled
            ? 'bg-fusion-blue/10 border-fusion-blue/30 text-fusion-blue'
            : 'bg-fusion-surface/90 border-fusion-border-light text-fusion-text-disabled hover:text-fusion-text',
        )}
        onClick={toggleAutoConstraints}
        title="Toggle automatic constraint detection during drawing"
      >
        <div className={clsx(
          'w-2 h-2 rounded-sm',
          autoConstraintsEnabled ? 'bg-fusion-blue' : 'bg-fusion-text-disabled',
        )} />
        Auto-Constraints
      </button>
    </div>
  );
}
