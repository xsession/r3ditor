import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MassProperties } from '../../components/MassProperties';
import { useEditorStore } from '../../store/editorStore';

describe('MassProperties', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  // ── Collapsed state ──

  it('renders a toggle button when closed', () => {
    render(<MassProperties />);
    expect(screen.getByTitle('Mass Properties')).toBeInTheDocument();
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('opens panel when clicked', async () => {
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText('Mass Properties')).toBeInTheDocument();
  });

  // ── No selection ──

  it('shows placeholder when no entities selected', async () => {
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText(/Select one or more entities/)).toBeInTheDocument();
  });

  // ── With a box entity selected ──

  it('shows geometry section for selected box', async () => {
    useEditorStore.setState({
      entities: [{
        id: 'box1', name: 'Box', type: 'box', visible: true, locked: false, suppressed: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 20, 30] },
        faceCount: 6, edgeCount: 12, vertexCount: 8,
      }],
      selectedIds: ['box1'],
    });
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText('Geometry')).toBeInTheDocument();
    expect(screen.getByText('Volume')).toBeInTheDocument();
    expect(screen.getByText('Surface Area')).toBeInTheDocument();
  });

  it('computes box volume correctly (10×20×30=6000)', async () => {
    useEditorStore.setState({
      entities: [{
        id: 'box1', name: 'Box', type: 'box', visible: true, locked: false, suppressed: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 20, 30] },
        faceCount: 6, edgeCount: 12, vertexCount: 8,
      }],
      selectedIds: ['box1'],
    });
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    // 6000 mm³ = 6.000 cm³
    expect(screen.getByText('6.000 cm³')).toBeInTheDocument();
  });

  it('shows physical section with density and mass', async () => {
    useEditorStore.setState({
      entities: [{
        id: 'box1', name: 'Box', type: 'box', visible: true, locked: false, suppressed: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 20, 30] },
        faceCount: 6, edgeCount: 12, vertexCount: 8,
      }],
      selectedIds: ['box1'],
    });
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText('Physical')).toBeInTheDocument();
    expect(screen.getByText('Density')).toBeInTheDocument();
    expect(screen.getByText('7.85 g/cm³')).toBeInTheDocument();
    expect(screen.getByText('Mass')).toBeInTheDocument();
  });

  it('shows center of mass', async () => {
    useEditorStore.setState({
      entities: [{
        id: 'box1', name: 'Box', type: 'box', visible: true, locked: false, suppressed: false,
        transform: { position: [5, 10, 15], rotation: [0, 0, 0], scale: [10, 20, 30] },
        faceCount: 6, edgeCount: 12, vertexCount: 8,
      }],
      selectedIds: ['box1'],
    });
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText('Center of Mass')).toBeInTheDocument();
  });

  it('shows bounding box', async () => {
    useEditorStore.setState({
      entities: [{
        id: 'box1', name: 'Box', type: 'box', visible: true, locked: false, suppressed: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 20, 30] },
        faceCount: 6, edgeCount: 12, vertexCount: 8,
      }],
      selectedIds: ['box1'],
    });
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText('Bounding Box')).toBeInTheDocument();
  });

  // ── Close ──

  it('closes when X is clicked', async () => {
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText('Mass Properties')).toBeInTheDocument();
    // The panel header contains Volume, Surface Area etc. — verify it's open
    expect(screen.getByText(/Select one or more entities/)).toBeInTheDocument();
  });

  // ── Face/edge/vertex counts ──

  it('shows topology counts from entity', async () => {
    useEditorStore.setState({
      entities: [{
        id: 'box1', name: 'Box', type: 'box', visible: true, locked: false, suppressed: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 10, 10] },
        faceCount: 6, edgeCount: 12, vertexCount: 8,
      }],
      selectedIds: ['box1'],
    });
    render(<MassProperties />);
    await userEvent.click(screen.getByTitle('Mass Properties'));
    expect(screen.getByText('Faces')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Edges')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Vertices')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });
});
