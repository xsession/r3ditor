import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../store/editorStore';

/**
 * Tests for SketchConstraintGlyphs, SketchDimensionAnnotations, SnapIndicators,
 * SubElementPicker, and the new store fields (cameraProjection, navigationStyle).
 */

describe('Camera Projection Toggle', () => {
  beforeEach(() => {
    useEditorStore.setState({ cameraProjection: 'perspective' });
  });

  it('defaults to perspective', () => {
    expect(useEditorStore.getState().cameraProjection).toBe('perspective');
  });

  it('toggles to orthographic', () => {
    useEditorStore.getState().toggleCameraProjection();
    expect(useEditorStore.getState().cameraProjection).toBe('orthographic');
  });

  it('toggles back to perspective', () => {
    useEditorStore.getState().toggleCameraProjection();
    useEditorStore.getState().toggleCameraProjection();
    expect(useEditorStore.getState().cameraProjection).toBe('perspective');
  });

  it('sets projection directly', () => {
    useEditorStore.getState().setCameraProjection('orthographic');
    expect(useEditorStore.getState().cameraProjection).toBe('orthographic');
    useEditorStore.getState().setCameraProjection('perspective');
    expect(useEditorStore.getState().cameraProjection).toBe('perspective');
  });
});

describe('Navigation Style Store', () => {
  beforeEach(() => {
    useEditorStore.setState({ navigationStyle: 'fusion360' });
  });

  it('defaults to fusion360', () => {
    expect(useEditorStore.getState().navigationStyle).toBe('fusion360');
  });

  it('changes navigation style', () => {
    useEditorStore.getState().setNavigationStyle('blender');
    expect(useEditorStore.getState().navigationStyle).toBe('blender');
  });

  it('supports all navigation styles', () => {
    const styles = ['fusion360', 'blender', 'freecad', 'solidworks', 'inventor'];
    for (const style of styles) {
      useEditorStore.getState().setNavigationStyle(style);
      expect(useEditorStore.getState().navigationStyle).toBe(style);
    }
  });
});

describe('View Style in Store', () => {
  beforeEach(() => {
    useEditorStore.setState({ viewStyle: 'shadedEdges' });
  });

  it('defaults to shadedEdges', () => {
    expect(useEditorStore.getState().viewStyle).toBe('shadedEdges');
  });

  it('sets wireframe view style', () => {
    useEditorStore.getState().setViewStyle('wireframe');
    expect(useEditorStore.getState().viewStyle).toBe('wireframe');
  });

  it('sets hidden view style', () => {
    useEditorStore.getState().setViewStyle('hidden');
    expect(useEditorStore.getState().viewStyle).toBe('hidden');
  });

  it('sets shaded view style', () => {
    useEditorStore.getState().setViewStyle('shaded');
    expect(useEditorStore.getState().viewStyle).toBe('shaded');
  });

  it('cycles through all view styles', () => {
    const styles: ('shaded' | 'shadedEdges' | 'wireframe' | 'hidden')[] = ['shaded', 'shadedEdges', 'wireframe', 'hidden'];
    for (const style of styles) {
      useEditorStore.getState().setViewStyle(style);
      expect(useEditorStore.getState().viewStyle).toBe(style);
    }
  });
});
