import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureTree } from '../../components/FeatureTree';
import { useEditorStore, type BrowserNode, type Entity } from '../../store/editorStore';

const makeNode = (overrides: Partial<BrowserNode> = {}): BrowserNode => ({
  id: 'node-1',
  name: 'Test Node',
  type: 'body',
  expanded: false,
  visible: true,
  status: 'valid',
  children: [],
  ...overrides,
});

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
    browserOpen: true,
    browserTree: [],
    entities: [],
    selectedIds: [],
  });
});

describe('FeatureTree', () => {
  it('renders nothing when browserOpen is false', () => {
    useEditorStore.setState({ browserOpen: false });
    const { container } = render(<FeatureTree />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Browser header', () => {
    render(<FeatureTree />);
    expect(screen.getByText('Browser')).toBeInTheDocument();
  });

  it('renders browser tree nodes', () => {
    useEditorStore.setState({
      browserTree: [
        makeNode({ id: 'n1', name: 'Component1', type: 'component' }),
        makeNode({ id: 'n2', name: 'Sketch1', type: 'sketch' }),
      ],
    });
    render(<FeatureTree />);
    expect(screen.getByText('Component1')).toBeInTheDocument();
    expect(screen.getByText('Sketch1')).toBeInTheDocument();
  });

  it('renders entities in Bodies section', () => {
    useEditorStore.setState({
      entities: [
        makeEntity({ id: 'e1', name: 'Box1' }),
        makeEntity({ id: 'e2', name: 'Cylinder1', type: 'cylinder' }),
      ],
    });
    render(<FeatureTree />);
    expect(screen.getByText('Bodies (2)')).toBeInTheDocument();
    expect(screen.getByText('Box1')).toBeInTheDocument();
    expect(screen.getByText('Cylinder1')).toBeInTheDocument();
  });

  it('selects entity on click', () => {
    useEditorStore.setState({
      entities: [makeEntity({ id: 'e1', name: 'Box1' })],
    });
    render(<FeatureTree />);
    fireEvent.click(screen.getByText('Box1'));
    expect(useEditorStore.getState().selectedIds).toContain('e1');
  });

  it('highlights selected entity', () => {
    useEditorStore.setState({
      entities: [makeEntity({ id: 'e1', name: 'Box1' })],
      selectedIds: ['e1'],
    });
    render(<FeatureTree />);
    const entityEl = screen.getByText('Box1').closest('div');
    expect(entityEl?.className).toContain('bg-fusion-blue');
  });

  it('shows suppressed entities with reduced opacity', () => {
    useEditorStore.setState({
      entities: [makeEntity({ id: 'e1', name: 'SuppressedBox', suppressed: true })],
    });
    render(<FeatureTree />);
    const entityEl = screen.getByText('SuppressedBox').closest('div');
    expect(entityEl?.className).toContain('opacity-40');
  });

  it('renders nested tree nodes when expanded', () => {
    useEditorStore.setState({
      browserTree: [
        makeNode({
          id: 'parent',
          name: 'Component1',
          type: 'component',
          expanded: true,
          children: [
            makeNode({ id: 'child1', name: 'Origin', type: 'origin' }),
            makeNode({ id: 'child2', name: 'Body1', type: 'body' }),
          ],
        }),
      ],
    });
    render(<FeatureTree />);
    expect(screen.getByText('Component1')).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByText('Body1')).toBeInTheDocument();
  });

  it('hides children when node is collapsed', () => {
    useEditorStore.setState({
      browserTree: [
        makeNode({
          id: 'parent',
          name: 'Component1',
          type: 'component',
          expanded: false,
          children: [
            makeNode({ id: 'child1', name: 'HiddenChild', type: 'body' }),
          ],
        }),
      ],
    });
    render(<FeatureTree />);
    expect(screen.getByText('Component1')).toBeInTheDocument();
    expect(screen.queryByText('HiddenChild')).not.toBeInTheDocument();
  });

  it('toggles node expansion on click', () => {
    useEditorStore.setState({
      browserTree: [
        makeNode({
          id: 'parent',
          name: 'Component1',
          type: 'component',
          expanded: false,
          children: [
            makeNode({ id: 'child1', name: 'Child1', type: 'body' }),
          ],
        }),
      ],
    });
    render(<FeatureTree />);
    fireEvent.click(screen.getByText('Component1'));
    // After click, toggleBrowserNode should have been called
    const state = useEditorStore.getState();
    const parent = state.browserTree.find((n) => n.id === 'parent');
    expect(parent?.expanded).toBe(true);
  });

  it('shows context menu on right-click', () => {
    useEditorStore.setState({
      entities: [makeEntity({ id: 'e1', name: 'Box1' })],
    });
    render(<FeatureTree />);
    const entityEl = screen.getByText('Box1');
    fireEvent.contextMenu(entityEl);
    expect(screen.getByText('Edit Feature')).toBeInTheDocument();
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Suppress')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows no bodies section when entities is empty', () => {
    useEditorStore.setState({ entities: [] });
    render(<FeatureTree />);
    expect(screen.queryByText(/Bodies/)).not.toBeInTheDocument();
  });

  it('selects browser tree node on click', () => {
    useEditorStore.setState({
      browserTree: [
        makeNode({ id: 'n1', name: 'Sketch1', type: 'sketch' }),
      ],
    });
    render(<FeatureTree />);
    fireEvent.click(screen.getByText('Sketch1'));
    expect(useEditorStore.getState().selectedIds).toContain('n1');
  });
});
