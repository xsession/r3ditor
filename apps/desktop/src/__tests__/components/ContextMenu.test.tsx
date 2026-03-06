import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from '../../components/ContextMenu';
import { useEditorStore, type Entity } from '../../store/editorStore';

const makeEntity = (overrides: Partial<Entity> = {}): Entity => ({
  id: 'ent-1',
  name: 'Box1',
  visible: true,
  locked: false,
  suppressed: false,
  faceCount: 6,
  edgeCount: 12,
  vertexCount: 8,
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  type: 'box',
  ...overrides,
});

beforeEach(() => {
  useEditorStore.setState({
    markingMenu: { open: false, x: 0, y: 0 },
    entities: [],
    selectedIds: [],
    clipboard: [],
    inspectorOpen: false,
  });
});

describe('ContextMenu', () => {
  it('renders nothing when marking menu is closed', () => {
    const { container } = render(<ContextMenu />);
    // Should only have the empty container div
    expect(container.querySelector('.fixed')).toBeNull();
  });

  it('renders menu items when open with selection', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
      entities: [makeEntity()],
      selectedIds: ['ent-1'],
    });
    render(<ContextMenu />);
    expect(screen.getByText('Edit Feature')).toBeInTheDocument();
    expect(screen.getByText('Hide')).toBeInTheDocument();
    expect(screen.getByText('Suppress')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('shows Paste when open without selection', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
    });
    render(<ContextMenu />);
    expect(screen.getByText('Paste')).toBeInTheDocument();
  });

  it('closes menu on cancel click', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
    });
    render(<ContextMenu />);
    // Click the backdrop
    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(useEditorStore.getState().markingMenu.open).toBe(false);
    }
  });

  it('copies entities to clipboard', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
      entities: [makeEntity({ id: 'e1', name: 'Box1' })],
      selectedIds: ['e1'],
    });
    render(<ContextMenu />);
    fireEvent.click(screen.getByText('Copy'));
    expect((useEditorStore.getState() as any).clipboard).toEqual(['e1']);
  });

  it('shows "Show" when entity is hidden', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
      entities: [makeEntity({ id: 'e1', visible: false })],
      selectedIds: ['e1'],
    });
    render(<ContextMenu />);
    expect(screen.getByText('Show')).toBeInTheDocument();
  });

  it('shows shortcut hints', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
      entities: [makeEntity()],
      selectedIds: ['ent-1'],
    });
    render(<ContextMenu />);
    expect(screen.getByText('Ctrl+C')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+V')).toBeInTheDocument();
    expect(screen.getByText('Del')).toBeInTheDocument();
  });

  it('deletes entity on Delete click', async () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
      entities: [makeEntity({ id: 'e1' })],
      selectedIds: ['e1'],
    });
    render(<ContextMenu />);
    fireEvent.click(screen.getByText('Delete'));
    // Wait for async delete
    await new Promise((r) => setTimeout(r, 10));
    expect(useEditorStore.getState().entities).toHaveLength(0);
  });

  it('toggles suppress on click', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 100, y: 200 },
      entities: [makeEntity({ id: 'e1', suppressed: false })],
      selectedIds: ['e1'],
    });
    render(<ContextMenu />);
    fireEvent.click(screen.getByText('Suppress'));
    expect(useEditorStore.getState().entities[0].suppressed).toBe(true);
  });
});
