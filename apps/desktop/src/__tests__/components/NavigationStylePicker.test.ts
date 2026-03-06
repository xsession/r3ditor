import { describe, it, expect } from 'vitest';
import { NAVIGATION_STYLES } from '../../components/NavigationStylePicker';

/**
 * Tests for NavigationStylePicker data and logic.
 */

describe('NavigationStylePicker', () => {
  it('has 5 navigation styles', () => {
    expect(NAVIGATION_STYLES).toHaveLength(5);
  });

  it('contains Fusion 360 as default', () => {
    const fusion = NAVIGATION_STYLES.find((s) => s.id === 'fusion360');
    expect(fusion).toBeDefined();
    expect(fusion!.name).toBe('Fusion 360');
    expect(fusion!.orbit).toBe('Middle Drag');
    expect(fusion!.pan).toBe('Shift + Middle Drag');
  });

  it('contains Blender style', () => {
    const blender = NAVIGATION_STYLES.find((s) => s.id === 'blender');
    expect(blender).toBeDefined();
    expect(blender!.name).toBe('Blender');
  });

  it('contains FreeCAD style with Ctrl+Middle pan', () => {
    const freecad = NAVIGATION_STYLES.find((s) => s.id === 'freecad');
    expect(freecad).toBeDefined();
    expect(freecad!.pan).toBe('Ctrl + Middle Drag');
  });

  it('contains SolidWorks style', () => {
    const sw = NAVIGATION_STYLES.find((s) => s.id === 'solidworks');
    expect(sw).toBeDefined();
    expect(sw!.name).toBe('SolidWorks');
  });

  it('contains Inventor style with swapped orbit/pan', () => {
    const inventor = NAVIGATION_STYLES.find((s) => s.id === 'inventor');
    expect(inventor).toBeDefined();
    // Inventor: Shift+Middle = orbit, Middle = pan (swapped from Fusion 360)
    expect(inventor!.orbit).toBe('Shift + Middle Drag');
    expect(inventor!.pan).toBe('Middle Drag');
  });

  it('all styles have required fields', () => {
    for (const style of NAVIGATION_STYLES) {
      expect(style.id).toBeTruthy();
      expect(style.name).toBeTruthy();
      expect(style.orbit).toBeTruthy();
      expect(style.pan).toBeTruthy();
      expect(style.zoom).toBeTruthy();
      expect(style.select).toBeTruthy();
      expect(style.contextMenu).toBeTruthy();
    }
  });

  it('all styles have unique ids', () => {
    const ids = NAVIGATION_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
