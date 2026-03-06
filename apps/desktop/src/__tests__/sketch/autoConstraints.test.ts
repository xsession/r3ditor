import { describe, it, expect } from 'vitest';
import {
  findSnapCandidates,
  detectLineDirection,
  applySnap,
  generateAutoConstraints,
  snapToGrid,
  getConstraintColor,
} from '../../sketch/autoConstraints';
import type { SketchPoint, SketchSegment } from '../../store/editorStore';

describe('Auto Constraints Engine', () => {
  describe('findSnapCandidates', () => {
    it('detects coincident snap when cursor is near existing point', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 10, y: 20, isConstruction: false },
      ];
      const candidates = findSnapCandidates(10.5, 20.5, points, [], 2.0);
      expect(candidates).toContainEqual(
        expect.objectContaining({ type: 'coincident', sourceEntityId: 'p1' })
      );
    });

    it('does not detect coincident for far-away points', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 100, y: 200, isConstruction: false },
      ];
      const candidates = findSnapCandidates(10, 20, points, [], 2.0);
      const coincident = candidates.filter((c) => c.type === 'coincident');
      expect(coincident).toHaveLength(0);
    });

    it('detects on-axis X snap when cursor Y is near zero', () => {
      const candidates = findSnapCandidates(50, 0.5, [], [], 2.0);
      expect(candidates).toContainEqual(
        expect.objectContaining({ type: 'onAxisX' })
      );
    });

    it('detects on-axis Y snap when cursor X is near zero', () => {
      const candidates = findSnapCandidates(0.5, 50, [], [], 2.0);
      expect(candidates).toContainEqual(
        expect.objectContaining({ type: 'onAxisY' })
      );
    });

    it('detects midpoint snap', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 20, y: 0, isConstruction: false },
      ];
      const segments: SketchSegment[] = [
        { id: 's1', type: 'line', points: ['p1', 'p2'], isConstruction: false },
      ];
      const candidates = findSnapCandidates(10.5, 0.3, points, segments, 2.0);
      expect(candidates).toContainEqual(
        expect.objectContaining({ type: 'midpoint', sourceEntityId: 's1' })
      );
    });

    it('returns empty array when no snaps detected', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 100, y: 200, isConstruction: false },
      ];
      const candidates = findSnapCandidates(10, 20, points, [], 2.0);
      expect(candidates).toHaveLength(0);
    });
  });

  describe('detectLineDirection', () => {
    it('detects horizontal line', () => {
      expect(detectLineDirection(0, 0, 10, 0)).toBe('horizontal');
    });

    it('detects nearly horizontal line', () => {
      expect(detectLineDirection(0, 0, 100, 1)).toBe('horizontal');
    });

    it('detects vertical line', () => {
      expect(detectLineDirection(0, 0, 0, 10)).toBe('vertical');
    });

    it('detects nearly vertical line', () => {
      expect(detectLineDirection(0, 0, 1, 100)).toBe('vertical');
    });

    it('returns null for diagonal line', () => {
      expect(detectLineDirection(0, 0, 10, 10)).toBeNull();
    });

    it('returns null for very short line', () => {
      expect(detectLineDirection(0, 0, 0.01, 0.01)).toBeNull();
    });
  });

  describe('applySnap', () => {
    it('returns snapped position for coincident', () => {
      const candidates = [
        { type: 'coincident' as const, targetPoint: { x: 10, y: 20 }, sourceEntityId: 'p1', label: 'Coincident' },
      ];
      const result = applySnap(10.5, 20.3, candidates);
      expect(result.snapped).toBe(true);
      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
      expect(result.activeSnap?.type).toBe('coincident');
    });

    it('returns original position when no candidates', () => {
      const result = applySnap(15, 25, []);
      expect(result.snapped).toBe(false);
      expect(result.x).toBe(15);
      expect(result.y).toBe(25);
      expect(result.activeSnap).toBeNull();
    });

    it('prioritizes coincident over midpoint', () => {
      const candidates = [
        { type: 'midpoint' as const, targetPoint: { x: 5, y: 5 }, sourceEntityId: 's1', label: 'Midpoint' },
        { type: 'coincident' as const, targetPoint: { x: 10, y: 20 }, sourceEntityId: 'p1', label: 'Coincident' },
      ];
      const result = applySnap(10.5, 20.3, candidates);
      expect(result.activeSnap?.type).toBe('coincident');
    });
  });

  describe('generateAutoConstraints', () => {
    it('generates horizontal constraint for horizontal line', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 0, y: 5, isConstruction: false },
        { id: 'p2', x: 20, y: 5, isConstruction: false },
      ];
      const segment: SketchSegment = {
        id: 's1', type: 'line', points: ['p1', 'p2'], isConstruction: false,
      };
      const constraints = generateAutoConstraints(segment, points, []);
      expect(constraints).toContainEqual(
        expect.objectContaining({ type: 'horizontal' })
      );
    });

    it('generates vertical constraint for vertical line', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 5, y: 0, isConstruction: false },
        { id: 'p2', x: 5, y: 20, isConstruction: false },
      ];
      const segment: SketchSegment = {
        id: 's1', type: 'line', points: ['p1', 'p2'], isConstruction: false,
      };
      const constraints = generateAutoConstraints(segment, points, []);
      expect(constraints).toContainEqual(
        expect.objectContaining({ type: 'vertical' })
      );
    });

    it('generates coincident for overlapping points', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 10, y: 20, isConstruction: false },
        { id: 'p2', x: 30, y: 20, isConstruction: false },
        { id: 'p3', x: 10, y: 20, isConstruction: false },
      ];
      const segment: SketchSegment = {
        id: 's1', type: 'line', points: ['p3', 'p2'], isConstruction: false,
      };
      const constraints = generateAutoConstraints(segment, points, []);
      const coincident = constraints.filter((c) => c.type === 'coincident');
      expect(coincident.length).toBeGreaterThan(0);
    });

    it('returns empty for diagonal line with no overlapping points', () => {
      const points: SketchPoint[] = [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 20, y: 20, isConstruction: false },
      ];
      const segment: SketchSegment = {
        id: 's1', type: 'line', points: ['p1', 'p2'], isConstruction: false,
      };
      const constraints = generateAutoConstraints(segment, points, []);
      expect(constraints).toHaveLength(0);
    });
  });

  describe('snapToGrid', () => {
    it('snaps to nearest grid point', () => {
      expect(snapToGrid(3.7, 1)).toBe(4);
      expect(snapToGrid(3.2, 1)).toBe(3);
    });

    it('snaps to grid size 5', () => {
      expect(snapToGrid(12, 5)).toBe(10);
      expect(snapToGrid(13, 5)).toBe(15);
    });

    it('snaps to grid size 0.5', () => {
      expect(snapToGrid(2.3, 0.5)).toBe(2.5);
      expect(snapToGrid(2.1, 0.5)).toBe(2);
    });

    it('handles zero', () => {
      expect(snapToGrid(0, 1)).toBe(0);
    });

    it('handles negative values', () => {
      expect(snapToGrid(-3.7, 1)).toBe(-4);
    });
  });

  describe('getConstraintColor', () => {
    it('returns green for fully constrained (DOF=0)', () => {
      expect(getConstraintColor(0, false, false)).toBe('#22c55e');
    });

    it('returns grey for unconstrained (DOF > 0)', () => {
      expect(getConstraintColor(4, false, false)).toBe('#e5e5e5');
    });

    it('returns red for over-constrained', () => {
      expect(getConstraintColor(0, false, true)).toBe('#ef4444');
    });

    it('returns blue for construction geometry', () => {
      expect(getConstraintColor(0, true, false)).toBe('#3b82f6');
    });

    it('prioritizes construction over other states', () => {
      expect(getConstraintColor(5, true, true)).toBe('#3b82f6');
    });
  });
});
