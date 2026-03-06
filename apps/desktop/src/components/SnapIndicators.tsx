import { useEditorStore, type SketchPlaneInfo } from '../store/editorStore';
import { Line, Html } from '@react-three/drei';
import { useMemo } from 'react';

/**
 * SnapIndicators — Visual feedback during sketch drawing.
 *
 * From the CAD-PLATFORM-UX-RESEARCH.md:
 * - Fusion 360: blue inference lines snap to endpoints, midpoints, center, perpendicular
 * - FreeCAD: point-on-point, point-on-edge, edge-on-axis snapping
 * - All platforms: show a snap dot/crosshair near the current point
 *
 * This component renders:
 * 1. Crosshair at current drawing point
 * 2. Snap dots on nearby existing points
 * 3. Inference lines (horizontal/vertical alignment with existing points)
 */

const SNAP_THRESHOLD = 3; // units — snap within this distance
const INFERENCE_COLOR = '#60a5fa'; // blue inference line (Fusion 360 style)
const SNAP_DOT_COLOR = '#facc15'; // yellow snap dot

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

export function SnapIndicators() {
  const sketchPlaneInfo = useEditorStore((s) => s.sketchPlaneInfo);
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const drawState = useEditorStore((s) => s.drawState);
  const sketchPhase = useEditorStore((s) => s.sketchPhase);
  const gridSnapEnabled = useEditorStore((s) => s.gridSnapEnabled);

  const nearbySnaps = useMemo(() => {
    if (!drawState.currentPoint || !drawState.active) return { hLines: [], vLines: [], snapDots: [] };

    const cx = drawState.currentPoint.x;
    const cy = drawState.currentPoint.y;
    const hLines: { fromY: number; toX: number }[] = [];
    const vLines: { fromX: number; toY: number }[] = [];
    const snapDots: { x: number; y: number; label: string }[] = [];

    for (const pt of sketchPoints) {
      const dx = Math.abs(pt.x - cx);
      const dy = Math.abs(pt.y - cy);

      // Horizontal alignment inference
      if (dy < SNAP_THRESHOLD && dx > SNAP_THRESHOLD) {
        hLines.push({ fromY: pt.y, toX: pt.x });
      }
      // Vertical alignment inference
      if (dx < SNAP_THRESHOLD && dy > SNAP_THRESHOLD) {
        vLines.push({ fromX: pt.x, toY: pt.y });
      }
      // Near-point snap
      if (dx < SNAP_THRESHOLD && dy < SNAP_THRESHOLD) {
        snapDots.push({ x: pt.x, y: pt.y, label: 'endpoint' });
      }
    }

    // Origin snap
    const distOrigin = Math.sqrt(cx * cx + cy * cy);
    if (distOrigin < SNAP_THRESHOLD) {
      snapDots.push({ x: 0, y: 0, label: 'origin' });
    }

    return { hLines, vLines, snapDots };
  }, [drawState.currentPoint, drawState.active, sketchPoints]);

  if (sketchPhase !== 'drawing' || !sketchPlaneInfo || !drawState.active || !drawState.currentPoint) {
    return null;
  }

  const cp = drawState.currentPoint;
  const info = sketchPlaneInfo;

  // Crosshair at current drawing point
  const crossSize = 2;
  const crossH: [number, number, number][] = [
    sketchTo3D({ x: cp.x - crossSize, y: cp.y }, info),
    sketchTo3D({ x: cp.x + crossSize, y: cp.y }, info),
  ];
  const crossV: [number, number, number][] = [
    sketchTo3D({ x: cp.x, y: cp.y - crossSize }, info),
    sketchTo3D({ x: cp.x, y: cp.y + crossSize }, info),
  ];

  return (
    <>
      {/* Crosshair at current point */}
      <Line points={crossH} color={SNAP_DOT_COLOR} lineWidth={1} transparent opacity={0.8} />
      <Line points={crossV} color={SNAP_DOT_COLOR} lineWidth={1} transparent opacity={0.8} />

      {/* Grid snap indicator */}
      {gridSnapEnabled && (
        <mesh position={sketchTo3D(cp, info)}>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshBasicMaterial color={SNAP_DOT_COLOR} />
        </mesh>
      )}

      {/* Horizontal inference lines */}
      {nearbySnaps.hLines.map((h, i) => {
        const fromPt = sketchTo3D({ x: h.toX, y: h.fromY }, info);
        const toPt = sketchTo3D({ x: cp.x, y: h.fromY }, info);
        return (
          <Line key={`hinf-${i}`} points={[fromPt, toPt]} color={INFERENCE_COLOR} lineWidth={0.5} dashed dashSize={0.4} gapSize={0.3} />
        );
      })}

      {/* Vertical inference lines */}
      {nearbySnaps.vLines.map((v, i) => {
        const fromPt = sketchTo3D({ x: v.fromX, y: v.toY }, info);
        const toPt = sketchTo3D({ x: v.fromX, y: cp.y }, info);
        return (
          <Line key={`vinf-${i}`} points={[fromPt, toPt]} color={INFERENCE_COLOR} lineWidth={0.5} dashed dashSize={0.4} gapSize={0.3} />
        );
      })}

      {/* Snap dots on nearby existing points */}
      {nearbySnaps.snapDots.map((dot, i) => (
        <group key={`snap-${i}`}>
          <mesh position={sketchTo3D(dot, info)}>
            <ringGeometry args={[0.4, 0.6, 16]} />
            <meshBasicMaterial color={SNAP_DOT_COLOR} side={2} />
          </mesh>
          <Html position={sketchTo3D({ x: dot.x + 1.5, y: dot.y + 1 }, info)} center>
            <div className="text-yellow-400 text-[8px] font-bold pointer-events-none bg-black/50 px-0.5 rounded">
              {dot.label}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}
