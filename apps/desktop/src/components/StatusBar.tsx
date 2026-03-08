import { useEditorStore } from '../store/editorStore';
import clsx from 'clsx';

/**
 * Fusion 360 Status Bar — thin strip at the very bottom of the window.
 * Shows: [Status message] | [DOF] | ── spacer ── | [Units: mm] | [Version]
 *
 * The navigation tools (orbit/pan/zoom) have moved to the ViewportNavBar
 * floating overlay inside the viewport, matching Fusion 360's layout.
 */
export function StatusBar() {
  const {
    statusMessage, isSketchActive, sketchDof,
  } = useEditorStore();

  return (
    <div className="flex items-center h-[24px] px-3 bg-fusion-header border-t border-fusion-border text-[10px] text-fusion-text-disabled select-none shrink-0">
      {/* Left: Status message */}
      <span className="truncate max-w-[300px]">{statusMessage}</span>

      {/* Sketch DOF */}
      {isSketchActive && (
        <>
          <StatusSep />
          <span className={clsx(
            'font-medium',
            sketchDof === 0 ? 'text-fusion-success' : 'text-fusion-warning',
          )}>
            DOF: {sketchDof}
          </span>
        </>
      )}

      <div className="flex-1" />

      {/* Units */}
      <span>Units: mm</span>
      <StatusSep />
      <span>r3ditor v0.3.0</span>
    </div>
  );
}

function StatusSep() {
  return <span className="w-px h-3 bg-fusion-border-light mx-2 shrink-0" />;
}
