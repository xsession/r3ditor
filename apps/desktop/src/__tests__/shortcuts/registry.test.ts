import { describe, it, expect } from 'vitest';
import { normalizeKeyEvent, formatShortcut } from '../../shortcuts/registry';

describe('Shortcut Registry', () => {
  describe('normalizeKeyEvent', () => {
    const makeEvent = (overrides: Partial<KeyboardEvent> = {}): KeyboardEvent => ({
      key: 'a',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...overrides,
    } as KeyboardEvent);

    it('normalizes simple key', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'e' }))).toBe('e');
    });

    it('normalizes Ctrl+key', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'z', ctrlKey: true }))).toBe('ctrl+z');
    });

    it('normalizes Ctrl+Shift+key', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'S', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+s');
    });

    it('normalizes Alt+key', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'f', altKey: true }))).toBe('alt+f');
    });

    it('normalizes Escape', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'Escape' }))).toBe('escape');
    });

    it('normalizes number keys', () => {
      expect(normalizeKeyEvent(makeEvent({ key: '1' }))).toBe('1');
    });

    it('normalizes Delete', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'Delete' }))).toBe('delete');
    });

    it('ignores standalone modifier keys', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'Control', ctrlKey: true }))).toBe('ctrl');
      expect(normalizeKeyEvent(makeEvent({ key: 'Shift', shiftKey: true }))).toBe('shift');
    });

    it('treats Meta as Ctrl', () => {
      expect(normalizeKeyEvent(makeEvent({ key: 'c', metaKey: true }))).toBe('ctrl+c');
    });
  });

  describe('formatShortcut', () => {
    it('formats single key', () => {
      expect(formatShortcut('e')).toBe('E');
    });

    it('formats Ctrl+key', () => {
      expect(formatShortcut('ctrl+z')).toBe('Ctrl+Z');
    });

    it('formats complex combo', () => {
      expect(formatShortcut('ctrl+shift+s')).toBe('Ctrl+Shift+S');
    });

    it('formats Escape', () => {
      expect(formatShortcut('escape')).toBe('Escape');
    });

    it('formats number key', () => {
      expect(formatShortcut('1')).toBe('1');
    });
  });
});
