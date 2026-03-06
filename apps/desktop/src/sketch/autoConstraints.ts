import type { SketchPoint, SketchSegment, SketchConstraint } from '../store/editorStore';

/**
 * Auto-constraint engine for the sketch system.
 *
 * Implements the FreeCAD/Fusion 360 pattern of automatically detecting and
 * applying geometric constraints during sketch drawing:
 *
 * - **Coincident**: When a new point is close to an existing point
 * - **Horizontal**: When a line segment is nearly horizontal
 * - **Vertical**: When a line segment is nearly vertical
 * - **Tangent**: When an arc endpoint is near a line endpoint
 * - **Midpoint**: When a point is near the midpoint of a segment
 * - **On-axis**: When a point snaps to X=0 or Y=0
 *
 * The snap tolerance is configurable (default 2.0 units in sketch space).
 */

export const SNAP_TOLERANCE = 2.0;
export const ANGLE_TOLERANCE = 3.0; // degrees

export interface SnapCandidate {
  type: 'coincident' | 'horizontal' | 'vertical' | 'midpoint' | 'onAxisX' | 'onAxisY';
  targetPoint: { x: number; y: number };
  sourceEntityId?: string;
  label: string;
}

/**
 * Find auto-constraint candidates for a point being drawn.
 */
export function findSnapCandidates(
  cursorX: number,
  cursorY: number,
  points: SketchPoint[],
  segments: SketchSegment[],
  tolerance = SNAP_TOLERANCE,
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  // 1. Coincident — snap to existing points
  for (const pt of points) {
    const dist = Math.sqrt((cursorX - pt.x) ** 2 + (cursorY - pt.y) ** 2);
    if (dist < tolerance && dist > 0.01) {
      candidates.push({
        type: 'coincident',
        targetPoint: { x: pt.x, y: pt.y },
        sourceEntityId: pt.id,
        label: 'Coincident',
      });
    }
  }

  // 2. On-axis — snap to origin axes
  if (Math.abs(cursorX) < tolerance) {
    candidates.push({
      type: 'onAxisY',
      targetPoint: { x: 0, y: cursorY },
      label: 'On Y-Axis',
    });
  }
  if (Math.abs(cursorY) < tolerance) {
    candidates.push({
      type: 'onAxisX',
      targetPoint: { x: cursorX, y: 0 },
      label: 'On X-Axis',
    });
  }

  // 3. Midpoint — snap to midpoints of line segments
  for (const seg of segments) {
    if (seg.type === 'line' && seg.points.length >= 2) {
      const p1 = points.find((p) => p.id === seg.points[0]);
      const p2 = points.find((p) => p.id === seg.points[1]);
      if (p1 && p2) {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dist = Math.sqrt((cursorX - mx) ** 2 + (cursorY - my) ** 2);
        if (dist < tolerance) {
          candidates.push({
            type: 'midpoint',
            targetPoint: { x: mx, y: my },
            sourceEntityId: seg.id,
            label: 'Midpoint',
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Detect line segment direction constraints.
 * Returns 'horizontal' or 'vertical' if the segment is within the angle tolerance.
 */
export function detectLineDirection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  angleTol = ANGLE_TOLERANCE,
): 'horizontal' | 'vertical' | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.1) return null;

  const angleDeg = Math.abs(Math.atan2(dy, dx)) * (180 / Math.PI);

  if (angleDeg < angleTol || angleDeg > 180 - angleTol) {
    return 'horizontal';
  }
  if (Math.abs(angleDeg - 90) < angleTol) {
    return 'vertical';
  }
  return null;
}

/**
 * Apply a snap to the cursor position. Returns the snapped position.
 */
export function applySnap(
  cursorX: number,
  cursorY: number,
  candidates: SnapCandidate[],
): { x: number; y: number; snapped: boolean; activeSnap: SnapCandidate | null } {
  if (candidates.length === 0) {
    return { x: cursorX, y: cursorY, snapped: false, activeSnap: null };
  }

  // Priority: coincident > midpoint > on-axis
  const priority: SnapCandidate['type'][] = ['coincident', 'midpoint', 'onAxisX', 'onAxisY'];

  for (const type of priority) {
    const match = candidates.find((c) => c.type === type);
    if (match) {
      return { x: match.targetPoint.x, y: match.targetPoint.y, snapped: true, activeSnap: match };
    }
  }

  return { x: cursorX, y: cursorY, snapped: false, activeSnap: null };
}

/**
 * Generate auto-constraints for a completed sketch segment.
 * Called after a segment is finished (line drawn, rectangle placed, etc.)
 */
export function generateAutoConstraints(
  segment: SketchSegment,
  points: SketchPoint[],
  existingConstraints: SketchConstraint[],
): SketchConstraint[] {
  const newConstraints: SketchConstraint[] = [];
  let constraintId = Date.now();

  if (segment.type === 'line' && segment.points.length >= 2) {
    const p1 = points.find((p) => p.id === segment.points[0]);
    const p2 = points.find((p) => p.id === segment.points[1]);

    if (p1 && p2) {
      // Check for horizontal/vertical
      const dir = detectLineDirection(p1.x, p1.y, p2.x, p2.y);
      if (dir === 'horizontal') {
        newConstraints.push({
          id: `ac_${constraintId++}`,
          type: 'horizontal',
          entityIds: [segment.id],
          satisfied: true,
        });
      } else if (dir === 'vertical') {
        newConstraints.push({
          id: `ac_${constraintId++}`,
          type: 'vertical',
          entityIds: [segment.id],
          satisfied: true,
        });
      }
    }
  }

  // Check for coincident constraints (point on existing point)
  for (const ptId of segment.points) {
    const pt = points.find((p) => p.id === ptId);
    if (!pt) continue;

    for (const otherPt of points) {
      if (otherPt.id === ptId) continue;
      // Skip if this pair already has a coincident constraint
      const alreadyConstrained = existingConstraints.some(
        (c) =>
          c.type === 'coincident' &&
          c.entityIds.includes(ptId) &&
          c.entityIds.includes(otherPt.id),
      );
      if (alreadyConstrained) continue;

      const dist = Math.sqrt((pt.x - otherPt.x) ** 2 + (pt.y - otherPt.y) ** 2);
      if (dist < 0.01) {
        newConstraints.push({
          id: `ac_${constraintId++}`,
          type: 'coincident',
          entityIds: [ptId, otherPt.id],
          satisfied: true,
        });
      }
    }
  }

  return newConstraints;
}

/**
 * Apply grid snap to a coordinate value.
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Color coding for sketch constraint status (FreeCAD pattern):
 * - White (#e5e5e5)  = unconstrained (DOF > 0)
 * - Green (#22c55e)  = fully constrained (DOF == 0)
 * - Red   (#ef4444)  = over-constrained (solver reports error)
 * - Blue  (#3b82f6)  = construction geometry
 */
export function getConstraintColor(
  dof: number,
  isConstruction: boolean,
  isOverConstrained: boolean,
): string {
  if (isConstruction) return '#3b82f6';
  if (isOverConstrained) return '#ef4444';
  if (dof === 0) return '#22c55e';
  return '#e5e5e5';
}
