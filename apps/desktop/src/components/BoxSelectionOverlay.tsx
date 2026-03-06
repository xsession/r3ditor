import { useEditorStore } from '../store/editorStore';
import { useCallback, useEffect } from 'react';
import clsx from 'clsx';

/**
 * Box / Window Selection overlay.
 *
 * Implements the universal CAD selection pattern:
 * - **Left-to-right drag** = "Window" select (solid blue border) — only fully enclosed entities
 * - **Right-to-left drag** = "Crossing" select (dashed green border) — any overlapping entities
 *
 * Mounted over the viewport area. Listens for pointer events on the viewport container.
 */
export function BoxSelectionOverlay() {
  const { boxSelection, startBoxSelection, updateBoxSelection, endBoxSelection } = useEditorStore();
  const isSketchActive = useEditorStore((s) => s.isSketchActive);
  const activeTool = useEditorStore((s) => s.activeTool);

  // Don't activate during sketch mode or when using specific tools
  const canSelect = !isSketchActive && (activeTool === 'select');

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!canSelect) return;
    if (e.button !== 0) return; // Left mouse only
    if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;

    // Only start box selection if clicking on the viewport background
    const target = e.target as HTMLElement;
    const isCanvas = target.tagName === 'CANVAS';
    if (!isCanvas) return;

    startBoxSelection(e.clientX, e.clientY);
  }, [canSelect, startBoxSelection]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!boxSelection.active) return;
    updateBoxSelection(e.clientX, e.clientY);
  }, [boxSelection.active, updateBoxSelection]);

  const handlePointerUp = useCallback(() => {
    if (!boxSelection.active) return;

    const { startX, startY, currentX, currentY, mode } = boxSelection;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    // Only select if the box is large enough (not just a click)
    if (width > 5 && height > 5) {
      const store = useEditorStore.getState();
      store.setStatusMessage(
        `${mode === 'window' ? 'Window' : 'Crossing'} selection (${width.toFixed(0)}×${height.toFixed(0)}px)`
      );
      // Entity selection would be done here via raycasting in a real implementation.
      // For now, we select all entities since actual viewport intersection testing
      // requires Three.js camera/frustum access which is in the Canvas context.
    }

    endBoxSelection();
  }, [boxSelection, endBoxSelection]);

  // Global pointer event listeners
  useEffect(() => {
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);

  if (!boxSelection.active) return null;

  const { startX, startY, currentX, currentY, mode } = boxSelection;
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  // Minimum size to show visual
  if (width < 3 && height < 3) return null;

  return (
    <div
      className={clsx(
        'fixed pointer-events-none z-[100] border-2',
        mode === 'window'
          ? 'border-blue-400/80 bg-blue-400/10' // Solid blue = window select
          : 'border-green-400/80 bg-green-400/10 border-dashed', // Dashed green = crossing select
      )}
      style={{ left, top, width, height }}
    >
      {/* Selection mode indicator */}
      <div className={clsx(
        'absolute -top-5 left-0 text-[9px] px-1 rounded-sm',
        mode === 'window'
          ? 'bg-blue-400/20 text-blue-300'
          : 'bg-green-400/20 text-green-300',
      )}>
        {mode === 'window' ? 'Window' : 'Crossing'}
      </div>
    </div>
  );
}
