import { useEditorStore, type SketchPlaneInfo, type SketchDimension, type SketchPoint } from '../store/editorStore';
import { Line, Html } from '@react-three/drei';
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';

/**
 * EditableDimensionAnnotations — FreeCAD/Fusion 360-style editable dimension labels.
 *
 * Key behaviors:
 * - Dimension values are displayed as labels with leader lines
 * - Driving dimensions (blue) can be clicked to open an inline editor
 * - Typing a new value and pressing Enter re-drives the sketch geometry
 * - Reference (driven) dimensions (gray) are display-only
 * - Double-click on a dimension to edit it
 * - Press Escape to cancel editing
 */

function sketchTo3D(
  pt: { x: number; y: number },
  info: SketchPlaneInfo,
): [number, number, number] {
  const o = info.origin;
  const u = info.uAxis;
  const v = info.vAxis;
  return [
    o[0] + pt.x * u[0] + pt.y * v[0],
    o[1] + pt.x * u[1] + pt.y * v[1],
    o[2] + pt.x * u[2] + pt.y * v[2],
  ];
}

function formatDimension(dim: SketchDimension): string {
  switch (dim.type) {
    case 'radius':
      return `R${dim.value.toFixed(1)}`;
    case 'diameter':
      return `⌀${dim.value.toFixed(1)}`;
    case 'angle':
      return `${dim.value.toFixed(1)}°`;
    case 'distance':
    default:
      return dim.value.toFixed(1);
  }
}

function roleLabel(dim: SketchDimension): string {
  if (dim.role === 'width') return 'W';
  if (dim.role === 'height') return 'H';
  if (dim.role === 'radius') return 'R';
  return '';
}

function getDimensionLayout(
  dim: SketchDimension,
  pointMap: Map<string, SketchPoint>,
  info: SketchPlaneInfo,
): {
  label3D: [number, number, number];
  leaderPoints: [number, number, number][];
} | null {
  const pts = dim.entityIds
    .map((id) => pointMap.get(id))
    .filter(Boolean) as SketchPoint[];

  if (pts.length === 0) return null;

  if (dim.type === 'distance' && pts.length >= 2) {
    const p1 = pts[0];
    const p2 = pts[1];
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const offsetX = -dy / len * 4;
    const offsetY = dx / len * 4;
    const labelPos = { x: mx + offsetX, y: my + offsetY };

    return {
      label3D: sketchTo3D(labelPos, info),
      leaderPoints: [
        sketchTo3D(p1, info),
        sketchTo3D({ x: p1.x + offsetX, y: p1.y + offsetY }, info),
        sketchTo3D({ x: p2.x + offsetX, y: p2.y + offsetY }, info),
        sketchTo3D(p2, info),
      ],
    };
  }

  if ((dim.type === 'radius' || dim.type === 'diameter') && pts.length >= 1) {
    const center = pts[0];
    const labelPos = { x: center.x + dim.value * 0.7, y: center.y + dim.value * 0.7 };
    return {
      label3D: sketchTo3D(labelPos, info),
      leaderPoints: [
        sketchTo3D(center, info),
        sketchTo3D(labelPos, info),
      ],
    };
  }

  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return {
    label3D: sketchTo3D({ x: cx, y: cy + 3 }, info),
    leaderPoints: [],
  };
}

function InlineDimensionEditor({
  dim,
  position,
  onCommit,
  onCancel,
}: {
  dim: SketchDimension;
  position: [number, number, number];
  onCommit: (value: number) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(dim.value.toFixed(1));

  useEffect(() => {
    // Auto-focus and select all text
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 50);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 0) {
        onCommit(num);
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }, [value, onCommit, onCancel]);

  return (
    <Html position={position} center>
      <div
        className="flex items-center gap-1 bg-fusion-surface border-2 border-fusion-blue rounded shadow-xl p-0.5"
        style={{ zIndex: 1000 }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-[9px] text-fusion-text-secondary px-1 font-bold">
          {roleLabel(dim)}
        </span>
        <input
          ref={inputRef}
          type="number"
          step="0.1"
          min="0.1"
          className="w-16 bg-fusion-panel border border-fusion-border-light rounded px-1.5 py-0.5 text-xs text-fusion-blue font-mono outline-none focus:border-fusion-blue"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onCancel}
        />
        <span className="text-[9px] text-fusion-text-disabled pr-1">mm</span>
      </div>
    </Html>
  );
}

export function EditableDimensionAnnotations() {
  const sketchPlaneInfo = useEditorStore((s) => s.sketchPlaneInfo);
  const sketchDimensions = useEditorStore((s) => s.sketchDimensions);
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const sketchPhase = useEditorStore((s) => s.sketchPhase);
  const editingDimensionId = useEditorStore((s) => s.editingDimensionId);

  const pointMap = useMemo(() => {
    const m = new Map<string, SketchPoint>();
    for (const p of sketchPoints) m.set(p.id, p);
    return m;
  }, [sketchPoints]);

  if (sketchPhase !== 'drawing' || !sketchPlaneInfo || sketchDimensions.length === 0) {
    return null;
  }

  return (
    <>
      {sketchDimensions.map((dim) => {
        const layout = getDimensionLayout(dim, pointMap, sketchPlaneInfo);
        if (!layout) return null;

        const isDriving = dim.driving;
        const isEditing = editingDimensionId === dim.id;
        const lineColor = isDriving ? '#60a5fa' : '#808080';
        const textColor = isDriving ? '#93c5fd' : '#a0a0a0';

        return (
          <group key={dim.id}>
            {/* Leader lines */}
            {layout.leaderPoints.length >= 2 && (
              <Line
                points={layout.leaderPoints}
                color={lineColor}
                lineWidth={1}
                dashed
                dashSize={0.3}
                gapSize={0.2}
              />
            )}

            {/* Arrowheads at endpoints */}
            {layout.leaderPoints.length >= 4 && (
              <>
                <mesh position={layout.leaderPoints[1]}>
                  <sphereGeometry args={[0.15, 6, 6]} />
                  <meshBasicMaterial color={lineColor} />
                </mesh>
                <mesh position={layout.leaderPoints[2]}>
                  <sphereGeometry args={[0.15, 6, 6]} />
                  <meshBasicMaterial color={lineColor} />
                </mesh>
              </>
            )}

            {/* Dimension label (click to edit if driving) */}
            {isEditing ? (
              <InlineDimensionEditor
                dim={dim}
                position={layout.label3D}
                onCommit={(val) => useEditorStore.getState().updateDimensionValue(dim.id, val)}
                onCancel={() => useEditorStore.getState().setEditingDimensionId(null)}
              />
            ) : (
              <Html position={layout.label3D} center>
                <div
                  className={`whitespace-nowrap select-none ${isDriving ? 'cursor-pointer hover:scale-110 transition-transform' : 'pointer-events-none'}`}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: textColor,
                    backgroundColor: 'rgba(30,30,40,0.9)',
                    border: `1.5px solid ${lineColor}`,
                    borderRadius: 4,
                    padding: '2px 6px',
                  }}
                  onClick={(e) => {
                    if (isDriving) {
                      e.stopPropagation();
                      useEditorStore.getState().setEditingDimensionId(dim.id);
                    }
                  }}
                  title={isDriving ? 'Click to edit dimension value' : 'Reference dimension (driven)'}
                >
                  {roleLabel(dim) && (
                    <span style={{ color: '#fbbf24', marginRight: 3 }}>{roleLabel(dim)}</span>
                  )}
                  {formatDimension(dim)}
                  {isDriving && <span style={{ color: '#fbbf24', marginLeft: 2, fontSize: 8 }}>✎</span>}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}
