import { Line } from '@react-three/drei';
import { useEditorStore, type FinishedSketch, type SketchPlaneInfo, type SketchPoint } from '../store/editorStore';
import { useMemo, useCallback } from 'react';

/**
 * FinishedSketchOverlay — Renders finished sketches as visible wireframes in 3D.
 *
 * FreeCAD / Fusion 360 behavior:
 * - After finishing a sketch, the profile outline remains visible in the 3D viewport
 * - Sketches that have been consumed by an extrusion are dimmed/hidden
 * - Clicking on a visible sketch selects it (for extrusion or re-editing)
 * - The sketch lines appear in a distinctive color (white/gray for unconsumed, dim for consumed)
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

function FinishedSketchWireframe({ sketch }: { sketch: FinishedSketch }) {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const isSelected = selectedIds.includes(sketch.id);
  const isConsumed = !!sketch.consumedByBodyId;

  const pointMap = useMemo(() => {
    const m = new Map<string, SketchPoint>();
    for (const p of sketch.points) m.set(p.id, p);
    return m;
  }, [sketch.points]);

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      useEditorStore.getState().select(sketch.id);
    },
    [sketch.id],
  );

  const handleDoubleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      useEditorStore.getState().editFinishedSketch(sketch.id);
    },
    [sketch.id],
  );

  if (!sketch.visible && !isSelected) return null;

  const info = sketch.planeInfo;
  const color = isSelected ? '#40b4ff' : isConsumed ? '#404055' : '#b0b0c0';
  const lineWidth = isSelected ? 2.5 : isConsumed ? 1 : 1.5;
  const opacity = isConsumed && !isSelected ? 0.3 : 1;

  // Build renderable lines
  const segmentLines: [number, number, number][][] = [];
  const circleData: { center2D: { x: number; y: number }; radius: number }[] = [];

  for (const seg of sketch.segments) {
    if (seg.type === 'line') {
      const pts = seg.points.map((pid) => pointMap.get(pid)).filter(Boolean) as SketchPoint[];
      if (pts.length >= 2) {
        segmentLines.push(pts.map((p) => sketchTo3D(p, info)));
      }
    } else if (seg.type === 'circle') {
      const cpt = pointMap.get(seg.points[0]);
      const ept = pointMap.get(seg.points[1]);
      if (cpt && ept) {
        const r = Math.sqrt((ept.x - cpt.x) ** 2 + (ept.y - cpt.y) ** 2);
        circleData.push({ center2D: cpt, radius: r });
      }
    } else if (seg.type === 'arc') {
      const pts = seg.points.map((pid) => pointMap.get(pid)).filter(Boolean) as SketchPoint[];
      if (pts.length >= 3) {
        const arcPts: [number, number, number][] = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const x = (1 - t) * (1 - t) * pts[0].x + 2 * (1 - t) * t * pts[1].x + t * t * pts[2].x;
          const y = (1 - t) * (1 - t) * pts[0].y + 2 * (1 - t) * t * pts[1].y + t * t * pts[2].y;
          arcPts.push(sketchTo3D({ x, y }, info));
        }
        segmentLines.push(arcPts);
      }
    }
  }

  return (
    <group onClick={handleClick} onDoubleClick={handleDoubleClick}>
      {/* Line segments */}
      {segmentLines.map((pts, i) => (
        <Line
          key={`fs-seg-${sketch.id}-${i}`}
          points={pts}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={opacity}
        />
      ))}

      {/* Circles */}
      {circleData.map((c, i) => {
        const circlePts: [number, number, number][] = [];
        for (let j = 0; j <= 64; j++) {
          const angle = (j / 64) * Math.PI * 2;
          circlePts.push(sketchTo3D({
            x: c.center2D.x + c.radius * Math.cos(angle),
            y: c.center2D.y + c.radius * Math.sin(angle),
          }, info));
        }
        return (
          <Line
            key={`fs-circ-${sketch.id}-${i}`}
            points={circlePts}
            color={color}
            lineWidth={lineWidth}
            transparent
            opacity={opacity}
          />
        );
      })}

      {/* Vertices (only when selected) */}
      {isSelected && sketch.points.map((pt) => {
        const pos = sketchTo3D(pt, info);
        return (
          <mesh key={`fs-pt-${pt.id}`} position={pos}>
            <sphereGeometry args={[0.25, 6, 6]} />
            <meshBasicMaterial color="#60c8ff" />
          </mesh>
        );
      })}
    </group>
  );
}

export function FinishedSketchOverlay() {
  const finishedSketches = useEditorStore((s) => s.finishedSketches);
  const isSketchActive = useEditorStore((s) => s.isSketchActive);

  // Don't show finished sketches while actively drawing (to avoid clutter)
  // unless the sketch is consumed (then it's part of the model)
  return (
    <>
      {finishedSketches.map((sketch) => {
        // While actively sketching, only show consumed (dimmed) sketches
        if (isSketchActive && !sketch.consumedByBodyId) return null;
        return <FinishedSketchWireframe key={sketch.id} sketch={sketch} />;
      })}
    </>
  );
}
