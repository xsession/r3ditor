import { useEditorStore, type SketchPlaneInfo, type SketchDimension, type SketchPoint } from '../store/editorStore';
import { Line, Html } from '@react-three/drei';
import { useMemo } from 'react';

/**
 * SketchDimensionAnnotations — Renders dimension values with leader lines in the viewport.
 *
 * Fusion 360 / Onshape / FreeCAD all display dimension annotations:
 * - Distance: value between two points with extension lines
 * - Radius: value from center to edge with R prefix
 * - Diameter: value across circle with ⌀ prefix
 * - Angle: arc annotation with degree symbol
 *
 * Driving dimensions are shown in blue, reference (driven) in gray.
 */

/** Convert 2D sketch point to 3D world position */
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

/** Format dimension value with appropriate prefix */
function formatDimension(dim: SketchDimension): string {
  switch (dim.type) {
    case 'radius':
      return `R${dim.value.toFixed(2)}`;
    case 'diameter':
      return `⌀${dim.value.toFixed(2)}`;
    case 'angle':
      return `${dim.value.toFixed(1)}°`;
    case 'distance':
    default:
      return dim.value.toFixed(2);
  }
}

/** Compute label position and leader line endpoints for a dimension */
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
    // Mid-point offset perpendicular to the line
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular offset for the label (3 units away from the line)
    const offsetX = -dy / len * 3;
    const offsetY = dx / len * 3;
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
    // Place label offset from center
    const labelPos = { x: center.x + dim.value * 0.7, y: center.y + dim.value * 0.7 };
    return {
      label3D: sketchTo3D(labelPos, info),
      leaderPoints: [
        sketchTo3D(center, info),
        sketchTo3D(labelPos, info),
      ],
    };
  }

  // Fallback: place at centroid
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return {
    label3D: sketchTo3D({ x: cx, y: cy + 3 }, info),
    leaderPoints: [],
  };
}

export function SketchDimensionAnnotations() {
  const sketchPlaneInfo = useEditorStore((s) => s.sketchPlaneInfo);
  const sketchDimensions = useEditorStore((s) => s.sketchDimensions);
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const sketchPhase = useEditorStore((s) => s.sketchPhase);

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

            {/* Dimension label */}
            <Html position={layout.label3D} center>
              <div
                className="pointer-events-none select-none whitespace-nowrap"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  color: textColor,
                  backgroundColor: 'rgba(30,30,40,0.85)',
                  border: `1px solid ${lineColor}`,
                  borderRadius: 3,
                  padding: '1px 4px',
                }}
              >
                {formatDimension(dim)}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
