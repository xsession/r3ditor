import {
  ArrowUpFromLine, RotateCcw, Wind, Layers,
  CircleDot, Triangle, BoxSelect, Pencil, Box, Cylinder,
  FlipHorizontal, Copy, Drill, PlusCircle,
  ChevronLeft, ChevronRight, GripVertical,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import clsx from 'clsx';
import { useRef, useState } from 'react';

// ── Feature type → icon mapping ──
const timelineIcons: Record<string, React.ElementType> = {
  sketch: Pencil,
  extrude: ArrowUpFromLine,
  revolve: RotateCcw,
  sweep: Wind,
  loft: Layers,
  fillet: CircleDot,
  chamfer: Triangle,
  shell: BoxSelect,
  boolean: PlusCircle,
  pattern: Copy,
  mirror: FlipHorizontal,
  hole: Drill,
  box: Box,
  cylinder: Cylinder,
  component: Box,
  joint: Layers,
};

/**
 * Fusion 360-style Timeline — horizontal parametric history bar at the bottom.
 * Shows feature icons left-to-right with a rollback marker.
 */
export function BottomTabBar() {
  const { timeline, rollbackIndex, select } = useEditorStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -120, behavior: 'smooth' });
  };
  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 120, behavior: 'smooth' });
  };

  return (
    <div className="flex items-center h-9 bg-fusion-timeline border-t border-fusion-border select-none">
      {/* Timeline label */}
      <div className="flex items-center gap-1 px-2 text-[10px] text-fusion-text-disabled font-medium flex-shrink-0">
        <GripVertical size={10} />
        <span>TIMELINE</span>
      </div>

      {/* Scroll left */}
      <button
        className="p-1 text-fusion-text-disabled hover:text-fusion-text flex-shrink-0"
        onClick={scrollLeft}
      >
        <ChevronLeft size={12} />
      </button>

      {/* Timeline entries */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center gap-0.5 overflow-x-auto px-1 scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {timeline.length === 0 ? (
          <span className="text-[10px] text-fusion-text-disabled italic px-2">
            No features yet — create a sketch or feature to begin
          </span>
        ) : (
          timeline.map((entry, idx) => {
            const Icon = timelineIcons[entry.type] ?? Box;
            const isRolledBack = rollbackIndex >= 0 && idx > rollbackIndex;
            const isAtRollback = rollbackIndex === idx;

            return (
              <div key={entry.id} className="flex items-center flex-shrink-0">
                {/* Feature icon tile */}
                <button
                  className={clsx(
                    'relative flex items-center justify-center w-7 h-7 rounded border transition-colors',
                    entry.hasError
                      ? 'border-fusion-error/50 bg-fusion-error/10 text-fusion-error'
                      : entry.suppressed
                        ? 'border-fusion-border-light bg-fusion-surface opacity-40 text-fusion-text-disabled'
                        : isRolledBack
                          ? 'border-fusion-border-light bg-fusion-surface opacity-30 text-fusion-text-disabled'
                          : 'border-fusion-border-light bg-fusion-surface text-fusion-text-secondary hover:bg-fusion-surface-hover hover:text-fusion-text',
                  )}
                  title={entry.name}
                  onClick={() => select(entry.id)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <Icon size={13} />

                  {/* Tooltip */}
                  {hoveredIdx === idx && (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-fusion-surface border border-fusion-border-light rounded px-2 py-0.5 text-[10px] text-fusion-text whitespace-nowrap z-50 shadow-lg">
                      {entry.name}
                    </div>
                  )}
                </button>

                {/* Rollback marker (orange vertical line) */}
                {isAtRollback && (
                  <div
                    className="w-0.5 h-7 bg-fusion-timeline-marker mx-0.5 cursor-ew-resize rounded-full flex-shrink-0"
                    title="Rollback marker — drag to roll back"
                  />
                )}

                {/* Connection line between features */}
                {idx < timeline.length - 1 && !isAtRollback && (
                  <div className="w-2 h-px bg-fusion-border-light flex-shrink-0" />
                )}
              </div>
            );
          })
        )}

        {/* End rollback marker (at end if no rollback) */}
        {timeline.length > 0 && rollbackIndex < 0 && (
          <div
            className="w-0.5 h-7 bg-fusion-timeline-marker ml-1 cursor-ew-resize rounded-full flex-shrink-0"
            title="End of timeline"
          />
        )}
      </div>

      {/* Scroll right */}
      <button
        className="p-1 text-fusion-text-disabled hover:text-fusion-text flex-shrink-0"
        onClick={scrollRight}
      >
        <ChevronRight size={12} />
      </button>

      {/* Feature count */}
      <div className="px-2 text-[10px] text-fusion-text-disabled flex-shrink-0">
        {timeline.length}
      </div>
    </div>
  );
}
