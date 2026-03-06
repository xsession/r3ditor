/**
 * Keyboard shortcut registry and definitions.
 * Fusion 360-style: single-key in sketch mode, Ctrl+combos for global actions.
 */

export type ShortcutContext = 'global' | 'sketch' | 'feature' | 'assembly';

export interface ShortcutBinding {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Key combo string — lowercase, joined with '+'. e.g. 'ctrl+z', 'e', 'shift+d' */
  keys: string;
  /** Context(s) where this binding is active */
  contexts: ShortcutContext[];
  /** Action to execute */
  action: () => void;
  /** Group for display in the command palette */
  group: string;
}

/**
 * Normalize a KeyboardEvent into a canonical key string.
 * Output: e.g. "ctrl+shift+s", "escape", "f", "1"
 */
export function normalizeKeyEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  const key = e.key.toLowerCase();
  // Avoid adding 'control', 'shift', 'alt', 'meta' themselves
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
    parts.push(key);
  }
  return parts.join('+');
}

/**
 * Format a key string for display. e.g. "ctrl+z" → "Ctrl+Z"
 */
export function formatShortcut(keys: string): string {
  return keys
    .split('+')
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join('+');
}
