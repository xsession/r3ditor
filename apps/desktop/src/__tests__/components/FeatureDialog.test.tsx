import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureDialog } from '../../components/FeatureDialog';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    featureDialog: { open: false, featureType: null, params: {}, editing: false },
    timeline: [],
    statusMessage: 'Ready',
  });
});

describe('FeatureDialog', () => {
  it('renders nothing when dialog is closed', () => {
    const { container } = render(<FeatureDialog />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when featureType is null', () => {
    useEditorStore.setState({
      featureDialog: { open: true, featureType: null, params: {}, editing: false },
    });
    const { container } = render(<FeatureDialog />);
    expect(container.firstChild).toBeNull();
  });

  it('renders extrude dialog with correct params', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'extrude',
        params: { distance: 10, direction: 'one_side', operation: 'new_body', taper: 0 },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText(/extrude/i)).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();
    expect(screen.getByText('Operation')).toBeInTheDocument();
    expect(screen.getByText('Taper Angle')).toBeInTheDocument();
  });

  it('renders revolve dialog with correct params', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'revolve',
        params: { angle: 360, direction: 'full', operation: 'new_body' },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText(/revolve/i)).toBeInTheDocument();
    expect(screen.getByText('Angle')).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();
    expect(screen.getByText('Operation')).toBeInTheDocument();
  });

  it('renders fillet dialog with radius param', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'fillet',
        params: { radius: 2 },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText(/fillet/i)).toBeInTheDocument();
    expect(screen.getByText('Radius')).toBeInTheDocument();
  });

  it('renders chamfer dialog with correct params', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'chamfer',
        params: { chamferType: 'equal_distance', distance: 1, angle: 45 },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getAllByText(/chamfer/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Chamfer Type')).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Angle')).toBeInTheDocument();
  });

  it('renders shell dialog with thickness param', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'shell',
        params: { thickness: 1, direction: 'inside' },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText(/shell/i)).toBeInTheDocument();
    expect(screen.getByText('Thickness')).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();
  });

  it('renders hole dialog with correct params', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'hole',
        params: { holeType: 'simple', diameter: 5, depth: 10 },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getAllByText(/hole/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Hole Type')).toBeInTheDocument();
    expect(screen.getByText('Diameter')).toBeInTheDocument();
    expect(screen.getByText('Depth')).toBeInTheDocument();
  });

  it('renders boolean dialog with operation param', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'boolean',
        params: { operation: 'combine' },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText(/boolean/i)).toBeInTheDocument();
    expect(screen.getByText('Operation')).toBeInTheDocument();
  });

  it('renders linear pattern dialog with correct params', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'linearPattern',
        params: { count: 3, spacing: 10, direction: 'x' },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();
  });

  it('renders circular pattern dialog with correct params', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'circularPattern',
        params: { count: 6, angle: 360, axis: 'z' },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Total Angle')).toBeInTheDocument();
    expect(screen.getByText('Axis')).toBeInTheDocument();
  });

  it('renders thread dialog with correct params', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'thread',
        params: { threadType: 'ISO Metric', size: 'M6x1', fullLength: true },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getAllByText(/thread/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Thread Type')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Full Length')).toBeInTheDocument();
  });

  it('closes dialog on X button click', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'extrude',
        params: { distance: 10 },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    // Find the X button in the header (first button)
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find(btn => btn.closest('.bg-fusion-blue'));
    if (xButton) {
      fireEvent.click(xButton);
      expect(useEditorStore.getState().featureDialog.open).toBe(false);
    }
  });

  it('closes dialog on Cancel button click', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'extrude',
        params: { distance: 10 },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(useEditorStore.getState().featureDialog.open).toBe(false);
  });

  it('creates feature on OK click and adds to timeline', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'extrude',
        params: { distance: 10 },
        editing: false,
      },
      timeline: [],
    });
    render(<FeatureDialog />);
    fireEvent.click(screen.getByText('OK'));
    const state = useEditorStore.getState();
    expect(state.featureDialog.open).toBe(false);
    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].type).toBe('extrude');
    expect(state.timeline[0].name).toContain('extrude');
  });

  it('renders OK and Cancel buttons', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'fillet',
        params: { radius: 2 },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows unit labels (mm, degrees)', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'extrude',
        params: { distance: 10, taper: 0, direction: 'one_side', operation: 'new_body' },
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText('mm')).toBeInTheDocument();
    expect(screen.getByText('°')).toBeInTheDocument();
  });

  it('renders fallback for unknown feature types', () => {
    useEditorStore.setState({
      featureDialog: {
        open: true,
        featureType: 'sweep' as any,
        params: {},
        editing: false,
      },
    });
    render(<FeatureDialog />);
    expect(screen.getByText('No parameters for this feature.')).toBeInTheDocument();
  });
});
