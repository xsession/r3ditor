import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';

/**
 * QuickDimension — Auto-prompts for a dimension value immediately after drawing sketch geometry.
 *
 * FreeCAD/Fusion 360 pattern:
 * 1. User draws a line segment (click → drag → release)
 * 2. Small input field appears near the midpoint of the segment
 * 3. User types desired dimension, presses Enter
 * 4. Dimension constraint is created, sketch DOF decreases
 * 5. Input auto-focuses and disappears on Escape or confirm
 */
export function QuickDimension() {
  const {
    isSketchActive, sketchSegments, sketchPoints,
    addSketchDimension, sketchDimensions,
  } = useEditorStore();

  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [inputValue, setInputValue] = useState('');
  const [targetSegmentId, setTargetSegmentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSegCountRef = useRef(0);

  // Watch for new segments being added — trigger quick dimension
  useEffect(() => {
    if (!isSketchActive) {
      setActive(false);
      return;
    }

    const currentCount = sketchSegments.length;
    if (currentCount > lastSegCountRef.current && currentCount > 0) {
      const latestSeg = sketchSegments[currentCount - 1];

      // Only show quick dimension for line and rectangle segments
      if (latestSeg.type !== 'line' && latestSeg.type !== 'rectangle') {
        lastSegCountRef.current = currentCount;
        return;
      }

      // Check if this segment already has a dimension
      const alreadyDimensioned = sketchDimensions.some(
        (d) => d.entityIds.includes(latestSeg.id)
      );
      if (alreadyDimensioned) {
        lastSegCountRef.current = currentCount;
        return;
      }

      // Calculate midpoint position for the popup
      const pointIds = latestSeg.points;
      if (pointIds.length >= 2) {
        const p1 = sketchPoints.find((p) => p.id === pointIds[0]);
        const p2 = sketchPoints.find((p) => p.id === pointIds[1]);
        if (p1 && p2) {
          // Convert sketch coords to approximate screen position
          // This is a rough estimate — in production would use camera projection
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          setPosition({
            x: Math.min(Math.max(midX + 200, 100), window.innerWidth - 200), // rough viewport mapping
            y: Math.min(Math.max(-midY + 300, 100), window.innerHeight - 100),
          });
          setTargetSegmentId(latestSeg.id);

          // Calculate current length for placeholder
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          setInputValue(String(Math.round(length * 100) / 100));
          setActive(true);

          // Auto-focus
          setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          }, 50);
        }
      }
    }
    lastSegCountRef.current = currentCount;
  }, [isSketchActive, sketchSegments, sketchPoints, sketchDimensions]);

  const confirmDimension = useCallback(() => {
    if (!targetSegmentId || !inputValue.trim()) {
      setActive(false);
      return;
    }

    const val = parseFloat(inputValue);
    if (isNaN(val) || val <= 0) {
      setActive(false);
      return;
    }

    addSketchDimension({
      id: `dim_${Date.now()}`,
      type: 'distance',
      entityIds: [targetSegmentId],
      value: val,
      driving: true,
    });

    setActive(false);
    setTargetSegmentId(null);
    setInputValue('');
  }, [targetSegmentId, inputValue, addSketchDimension]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmDimension();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setActive(false);
    }
  }, [confirmDimension]);

  if (!active || !isSketchActive) return null;

  return (
    <div
      className="fixed z-[300] pointer-events-auto"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}
    >
      <div className="flex items-center gap-1 bg-fusion-surface border border-fusion-blue rounded shadow-2xl px-2 py-1">
        <span className="text-[10px] text-fusion-blue font-medium">Dim:</span>
        <input
          ref={inputRef}
          type="number"
          className="w-20 bg-fusion-panel border border-fusion-border-light rounded px-1.5 py-0.5 text-xs text-fusion-text outline-none focus:border-fusion-blue font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setActive(false)}
          placeholder="mm"
        />
        <button
          className="text-[10px] px-1.5 py-0.5 bg-fusion-blue text-white rounded hover:bg-fusion-blue-hover transition-colors"
          onMouseDown={(e) => { e.preventDefault(); confirmDimension(); }}
        >
          ✓
        </button>
      </div>
    </div>
  );
}
