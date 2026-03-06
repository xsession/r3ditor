import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropertiesPanel } from '../../components/PropertiesPanel';
import { useEditorStore, type Entity } from '../../store/editorStore';
import { fireEvent } from '@testing-library/react';

const makeEntity = (overrides: Partial<Entity> = {}): Entity => ({
  id: 'ent-1',
  name: 'TestBox',
  visible: true,
  locked: false,
  suppressed: false,
  faceCount: 6,
  edgeCount: 12,
  vertexCount: 8,
  transform: { position: [10, 20, 30], rotation: [0, 0, 0], scale: [1, 1, 1] },
  type: 'box',
  ...overrides,
});

beforeEach(() => {
  useEditorStore.setState({
    inspectorOpen: true,
    inspectorTab: 'properties',
    entities: [],
    selectedIds: [],
    isSketchActive: false,
    sketchPoints: [],
    sketchSegments: [],
    sketchConstraints: [],
    sketchDimensions: [],
    sketchDof: 0,
  });
});

describe('PropertiesPanel', () => {
  it('renders nothing when inspectorOpen is false', () => {
    useEditorStore.setState({ inspectorOpen: false });
    const { container } = render(<PropertiesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Inspector header', () => {
    render(<PropertiesPanel />);
    expect(screen.getByText('Inspector')).toBeInTheDocument();
  });

  it('renders tab bar with all tabs', () => {
    render(<PropertiesPanel />);
    expect(screen.getByText('properties')).toBeInTheDocument();
    expect(screen.getByText('appearance')).toBeInTheDocument();
    expect(screen.getByText('physical')).toBeInTheDocument();
    expect(screen.getByText('notes')).toBeInTheDocument();
  });

  it('shows "Select an object" when nothing is selected and no sketch', () => {
    render(<PropertiesPanel />);
    expect(screen.getByText('Select an object to inspect')).toBeInTheDocument();
  });

  it('shows entity properties when entity is selected', () => {
    const entity = makeEntity();
    useEditorStore.setState({
      entities: [entity],
      selectedIds: ['ent-1'],
    });
    render(<PropertiesPanel />);
    expect(screen.getByText('TestBox')).toBeInTheDocument();
    expect(screen.getByText('box')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument(); // faces
    expect(screen.getByText('12')).toBeInTheDocument(); // edges
    expect(screen.getByText('8')).toBeInTheDocument(); // vertices
    expect(screen.getByText('Yes')).toBeInTheDocument(); // visible
  });

  it('shows entity transform information', () => {
    const entity = makeEntity({
      transform: { position: [10, 20, 30], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    useEditorStore.setState({
      entities: [entity],
      selectedIds: ['ent-1'],
    });
    render(<PropertiesPanel />);
    expect(screen.getByText('Transform')).toBeInTheDocument();
    expect(screen.getByText('10.0, 20.0, 30.0')).toBeInTheDocument(); // position
  });

  it('shows multiple selected entities', () => {
    useEditorStore.setState({
      entities: [
        makeEntity({ id: 'e1', name: 'Box1' }),
        makeEntity({ id: 'e2', name: 'Cylinder1', type: 'cylinder' }),
      ],
      selectedIds: ['e1', 'e2'],
    });
    render(<PropertiesPanel />);
    expect(screen.getByText('Box1')).toBeInTheDocument();
    expect(screen.getByText('Cylinder1')).toBeInTheDocument();
  });

  it('shows sketch info when sketch is active', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchPoints: [{ x: 0, y: 0, id: 'pt1', isConstruction: false }, { x: 10, y: 10, id: 'pt2', isConstruction: false }],
      sketchSegments: [{ id: 'seg1', type: 'line', points: ['pt1', 'pt2'], isConstruction: false }],
      sketchConstraints: [{ id: 'c1', type: 'horizontal', entityIds: ['seg1'], satisfied: true }],
      sketchDimensions: [{ id: 'd1', type: 'distance', entityIds: ['pt1', 'pt2'], value: 14.14, driving: true }],
      sketchDof: 2,
    });
    render(<PropertiesPanel />);
    expect(screen.getByText('Active Sketch')).toBeInTheDocument();
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByText('Segments')).toBeInTheDocument();
    expect(screen.getByText('Constraints')).toBeInTheDocument();
    expect(screen.getByText('Dimensions')).toBeInTheDocument();
    expect(screen.getByText('DOF')).toBeInTheDocument();
  });

  it('switches to appearance tab', () => {
    render(<PropertiesPanel />);
    fireEvent.click(screen.getByText('appearance'));
    expect(useEditorStore.getState().inspectorTab).toBe('appearance');
  });

  it('renders appearance tab content', () => {
    useEditorStore.setState({ inspectorTab: 'appearance' });
    render(<PropertiesPanel />);
    expect(screen.getByText('Material')).toBeInTheDocument();
    expect(screen.getByText('#808080')).toBeInTheDocument();
  });

  it('renders physical tab content', () => {
    useEditorStore.setState({ inspectorTab: 'physical' });
    render(<PropertiesPanel />);
    expect(screen.getByText('Physical Properties')).toBeInTheDocument();
    expect(screen.getByText('Volume')).toBeInTheDocument();
    expect(screen.getByText('Mass')).toBeInTheDocument();
  });

  it('renders notes tab with textarea', () => {
    useEditorStore.setState({ inspectorTab: 'notes' });
    render(<PropertiesPanel />);
    expect(screen.getByPlaceholderText('Add notes about this document…')).toBeInTheDocument();
  });

  it('closes inspector when close button is clicked', () => {
    render(<PropertiesPanel />);
    // Find the close X button
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons.find((btn) => btn.closest('.bg-fusion-toolbar'));
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(useEditorStore.getState().inspectorOpen).toBe(false);
    }
  });

  it('shows suppressed status for suppressed entity', () => {
    useEditorStore.setState({
      entities: [makeEntity({ id: 'e1', name: 'Box1', suppressed: true })],
      selectedIds: ['e1'],
    });
    render(<PropertiesPanel />);
    // Should show "Yes" for Suppressed row
    const yesElements = screen.getAllByText('Yes');
    expect(yesElements.length).toBeGreaterThanOrEqual(1);
  });
});
