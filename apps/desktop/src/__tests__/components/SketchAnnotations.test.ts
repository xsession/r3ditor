import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../store/editorStore';

/**
 * Tests for sketch constraint glyphs and dimension annotations integration.
 * Verifies that constraint and dimension data flows correctly through the store.
 */

function resetStore() {
  const state = useEditorStore.getState();
  state.cancelSketch();
}

describe('Sketch Constraints for Glyph Rendering', () => {
  beforeEach(resetStore);

  it('starts with empty constraints', () => {
    expect(useEditorStore.getState().sketchConstraints).toEqual([]);
  });

  it('adds a horizontal constraint', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchConstraint({
      id: 'c1',
      type: 'horizontal',
      entityIds: ['pt1', 'pt2'],
      satisfied: true,
    });
    const constraints = useEditorStore.getState().sketchConstraints;
    expect(constraints).toHaveLength(1);
    expect(constraints[0].type).toBe('horizontal');
    expect(constraints[0].satisfied).toBe(true);
  });

  it('adds a vertical constraint', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchConstraint({
      id: 'c2',
      type: 'vertical',
      entityIds: ['pt3', 'pt4'],
      satisfied: true,
    });
    expect(useEditorStore.getState().sketchConstraints[0].type).toBe('vertical');
  });

  it('adds an unsatisfied constraint', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchConstraint({
      id: 'c3',
      type: 'equal',
      entityIds: ['seg1', 'seg2'],
      satisfied: false,
    });
    expect(useEditorStore.getState().sketchConstraints[0].satisfied).toBe(false);
  });

  it('reduces DOF when adding a constraint', () => {
    useEditorStore.getState().startSketch('XY');
    // Add 2 points = DOF + 4
    useEditorStore.getState().addSketchPoint({ id: 'pt1', x: 0, y: 0, isConstruction: false });
    useEditorStore.getState().addSketchPoint({ id: 'pt2', x: 10, y: 0, isConstruction: false });
    const dofBefore = useEditorStore.getState().sketchDof;
    useEditorStore.getState().addSketchConstraint({
      id: 'c1',
      type: 'horizontal',
      entityIds: ['pt1', 'pt2'],
      satisfied: true,
    });
    expect(useEditorStore.getState().sketchDof).toBe(dofBefore - 1);
  });

  it('supports all constraint types', () => {
    const types = [
      'coincident', 'concentric', 'parallel', 'perpendicular',
      'tangent', 'horizontal', 'vertical', 'equal',
      'midpoint', 'symmetric', 'fix', 'pierce',
    ];
    useEditorStore.getState().startSketch('XY');
    for (const type of types) {
      useEditorStore.getState().addSketchConstraint({
        id: `c_${type}`,
        type: type as any,
        entityIds: ['pt1'],
        satisfied: true,
      });
    }
    expect(useEditorStore.getState().sketchConstraints).toHaveLength(types.length);
  });
});

describe('Sketch Dimensions for Annotation Rendering', () => {
  beforeEach(resetStore);

  it('starts with empty dimensions', () => {
    expect(useEditorStore.getState().sketchDimensions).toEqual([]);
  });

  it('adds a distance dimension', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchDimension({
      id: 'd1',
      type: 'distance',
      entityIds: ['pt1', 'pt2'],
      value: 25.4,
      driving: true,
    });
    const dims = useEditorStore.getState().sketchDimensions;
    expect(dims).toHaveLength(1);
    expect(dims[0].type).toBe('distance');
    expect(dims[0].value).toBe(25.4);
    expect(dims[0].driving).toBe(true);
  });

  it('adds a radius dimension', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchDimension({
      id: 'd2',
      type: 'radius',
      entityIds: ['center1', 'edge1'],
      value: 12.5,
      driving: true,
    });
    expect(useEditorStore.getState().sketchDimensions[0].type).toBe('radius');
  });

  it('adds a driven (reference) dimension', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchDimension({
      id: 'd3',
      type: 'distance',
      entityIds: ['pt1', 'pt2'],
      value: 30,
      driving: false,
    });
    const dim = useEditorStore.getState().sketchDimensions[0];
    expect(dim.driving).toBe(false);
  });

  it('driving dimension reduces DOF', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchPoint({ id: 'pt1', x: 0, y: 0, isConstruction: false });
    const dofBefore = useEditorStore.getState().sketchDof;
    useEditorStore.getState().addSketchDimension({
      id: 'd1',
      type: 'distance',
      entityIds: ['pt1'],
      value: 10,
      driving: true,
    });
    expect(useEditorStore.getState().sketchDof).toBe(dofBefore - 1);
  });

  it('reference (non-driving) dimension does NOT reduce DOF', () => {
    useEditorStore.getState().startSketch('XY');
    useEditorStore.getState().addSketchPoint({ id: 'pt1', x: 0, y: 0, isConstruction: false });
    const dofBefore = useEditorStore.getState().sketchDof;
    useEditorStore.getState().addSketchDimension({
      id: 'd2',
      type: 'distance',
      entityIds: ['pt1'],
      value: 10,
      driving: false,
    });
    expect(useEditorStore.getState().sketchDof).toBe(dofBefore);
  });
});
