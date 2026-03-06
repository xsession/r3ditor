import { useEditorStore, type SketchPlaneInfo, type SketchConstraint, type SketchPoint } from '../store/editorStore';
import { Html } from '@react-three/drei';
import { useMemo } from 'react';

/**
 * SketchConstraintGlyphs — FreeCAD-style visual constraint markers in the 3D viewport.
 *
 * Renders small icons near constrained geometry:
 * - H (horizontal) — yellow
 * - V (vertical) — yellow
 * - = (equal) — green
 * - ⊥ (perpendicular) — blue
 * - ∥ (parallel) — blue
 * - T (tangent) — cyan
 * - ● (coincident) — orange
 * - ◎ (concentric) — orange
 * - ○ (midpoint) — purple
 * - ↔ (symmetric) — purple
 * - 🔒 (fix) — red
 *
 * Based on FreeCAD Sketcher constraint color system (Section 5.2.2 of research doc):
 * - Green: fully constrained
 * - Orange: under-constrained
 * - Red: over-constrained / conflicting
 */

/** Map constraint type to a display glyph + color */
const CONSTRAINT_GLYPHS: Record<string, { label: string; color: string }> = {
  horizontal:    { label: 'H',  color: '#facc15' }, // yellow
  vertical:      { label: 'V',  color: '#facc15' }, // yellow
  equal:         { label: '=',  color: '#4ade80' }, // green
  perpendicular: { label: '⊥',  color: '#60a5fa' }, // blue
  parallel:      { label: '∥',  color: '#60a5fa' }, // blue
  tangent:       { label: 'T',  color: '#22d3ee' }, // cyan
  coincident:    { label: '●',  color: '#fb923c' }, // orange
  concentric:    { label: '◎',  color: '#fb923c' }, // orange
  midpoint:      { label: '○',  color: '#c084fc' }, // purple
  symmetric:     { label: '↔',  color: '#c084fc' }, // purple
  fix:           { label: '🔒', color: '#f87171' }, // red
  pierce:        { label: '⨂',  color: '#f87171' }, // red
};

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

/** Find the centroid of the entities referenced by a constraint */
function constraintPosition(
  constraint: SketchConstraint,
  pointMap: Map<string, SketchPoint>,
): { x: number; y: number } | null {
  const points = constraint.entityIds
    .map((id) => pointMap.get(id))
    .filter(Boolean) as SketchPoint[];

  if (points.length === 0) return null;

  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

  // Offset slightly so glyphs don't overlap geometry
  return { x: cx + 1.5, y: cy + 1.5 };
}

export function SketchConstraintGlyphs() {
  const sketchPlaneInfo = useEditorStore((s) => s.sketchPlaneInfo);
  const sketchConstraints = useEditorStore((s) => s.sketchConstraints);
  const sketchPoints = useEditorStore((s) => s.sketchPoints);
  const sketchPhase = useEditorStore((s) => s.sketchPhase);

  const pointMap = useMemo(() => {
    const m = new Map<string, SketchPoint>();
    for (const p of sketchPoints) m.set(p.id, p);
    return m;
  }, [sketchPoints]);

  if (sketchPhase !== 'drawing' || !sketchPlaneInfo || sketchConstraints.length === 0) {
    return null;
  }

  return (
    <>
      {sketchConstraints.map((constraint, idx) => {
        const glyph = CONSTRAINT_GLYPHS[constraint.type];
        if (!glyph) return null;

        const pos2D = constraintPosition(constraint, pointMap);
        if (!pos2D) return null;

        // Stack multiple glyphs on same entity by offsetting based on index
        const offset = (idx % 3) * 2.5;
        const pos3D = sketchTo3D(
          { x: pos2D.x + offset, y: pos2D.y },
          sketchPlaneInfo,
        );

        const bgColor = constraint.satisfied ? 'rgba(0,0,0,0.7)' : 'rgba(127,0,0,0.8)';
        const borderColor = constraint.satisfied ? glyph.color : '#f87171';

        return (
          <Html key={constraint.id} position={pos3D} center>
            <div
              className="flex items-center justify-center pointer-events-none select-none"
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 700,
                color: glyph.color,
                backgroundColor: bgColor,
                border: `1px solid ${borderColor}`,
                lineHeight: 1,
              }}
              title={`${constraint.type}${constraint.satisfied ? '' : ' (unsatisfied)'}`}
            >
              {glyph.label}
            </div>
          </Html>
        );
      })}
    </>
  );
}
