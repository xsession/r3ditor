import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '../../components/CommandPalette';
import { useEditorStore } from '../../store/editorStore';
import type { ShortcutBinding } from '../../shortcuts/registry';
import React from 'react';

// Mock lucide-react icons to avoid SVG rendering issues
vi.mock('lucide-react', () => ({
  Search: (props: any) => <span data-testid="search-icon" {...props} />,
  Clock: (props: any) => <span data-testid="clock-icon" {...props} />,
  ChevronRight: (props: any) => <span data-testid="chevron-icon" {...props} />,
}));

// Mock getRecentCommands
vi.mock('../../shortcuts/useKeyboardShortcuts', () => ({
  getRecentCommands: () => ['undo'],
}));

const sampleBindings: ShortcutBinding[] = [
  { id: 'undo', label: 'Undo', keys: 'ctrl+z', contexts: ['global'], group: 'Edit', action: vi.fn() },
  { id: 'redo', label: 'Redo', keys: 'ctrl+y', contexts: ['global'], group: 'Edit', action: vi.fn() },
  { id: 'extrude', label: 'Extrude', keys: 'e', contexts: ['global'], group: 'Features', action: vi.fn() },
  { id: 'fillet', label: 'Fillet', keys: 'f', contexts: ['global'], group: 'Features', action: vi.fn() },
  { id: 'select', label: 'Select', keys: 'v', contexts: ['global'], group: 'Tools', action: vi.fn() },
];

function makeBindingsRef(bindings: ShortcutBinding[]) {
  return { current: bindings } as React.RefObject<ShortcutBinding[]>;
}

beforeEach(() => {
  useEditorStore.setState({
    commandPaletteOpen: false,
  });
  // Reset action mocks
  sampleBindings.forEach((b) => (b.action as ReturnType<typeof vi.fn>).mockReset());
});

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders palette when open', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    expect(screen.getByPlaceholderText('Search commands…')).toBeTruthy();
  });

  it('shows recent commands section', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    expect(screen.getByText('Recent')).toBeTruthy();
  });

  it('displays all commands', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    // Undo appears once in recent, others appear in commands list
    expect(screen.getByText('Redo')).toBeTruthy();
    expect(screen.getByText('Extrude')).toBeTruthy();
    expect(screen.getByText('Fillet')).toBeTruthy();
  });

  it('filters commands by search query', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    const input = screen.getByPlaceholderText('Search commands…');
    fireEvent.change(input, { target: { value: 'extr' } });
    expect(screen.getByText('Extrude')).toBeTruthy();
    expect(screen.queryByText('Fillet')).toBeNull();
    expect(screen.queryByText('Redo')).toBeNull();
  });

  it('shows no matching commands when search has no results', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    const input = screen.getByPlaceholderText('Search commands…');
    fireEvent.change(input, { target: { value: 'zzzznothing' } });
    expect(screen.getByText('No matching commands')).toBeTruthy();
  });

  it('closes on Escape key', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    const input = screen.getByPlaceholderText('Search commands…');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useEditorStore.getState().commandPaletteOpen).toBe(false);
  });

  it('executes selected command on Enter', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    const input = screen.getByPlaceholderText('Search commands…');
    // First item is recent "Undo", press Enter to execute it
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sampleBindings[0].action).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().commandPaletteOpen).toBe(false);
  });

  it('navigates with arrow keys', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    const input = screen.getByPlaceholderText('Search commands…');
    // Move down, then Enter should select the second item
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Second item in the flat list: first non-recent command (redo, since undo is in recent)
    expect(sampleBindings[1].action).toHaveBeenCalledTimes(1);
  });

  it('shows shortcut key hints', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    // Should show formatted key bindings
    expect(screen.getByText('Ctrl+Z')).toBeTruthy();
    expect(screen.getByText('Ctrl+Y')).toBeTruthy();
    expect(screen.getByText('E')).toBeTruthy();
  });

  it('shows command groups', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Features')).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
  });

  it('closes when clicking backdrop', () => {
    useEditorStore.setState({ commandPaletteOpen: true });
    render(<CommandPalette bindings={makeBindingsRef(sampleBindings)} />);
    // The backdrop is the div with bg-black/30
    const backdrop = document.querySelector('.bg-black\\/30');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(useEditorStore.getState().commandPaletteOpen).toBe(false);
  });
});
