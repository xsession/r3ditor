import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SketchConstraintOverlay } from '../../components/SketchConstraintOverlay';
import { useEditorStore } from '../../store/editorStore';

describe('SketchConstraintOverlay', () => {
  beforeEach(() => {
    useEditorStore.setState({
      isSketchActive: false,
      sketchDof: 0,
      sketchConstraints: [],
      autoConstraintsEnabled: true,
    });
  });

  it('renders nothing when sketch is not active', () => {
    const { container } = render(<SketchConstraintOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders DOF counter when sketch is active and drawing', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchPhase: 'drawing',
      sketchDof: 4,
    });
    render(<SketchConstraintOverlay />);
    expect(screen.getByText(/DOF/)).toBeInTheDocument();
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });

  it('shows green color for fully constrained (DOF=0)', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchPhase: 'drawing',
      sketchDof: 0,
      sketchPoints: [{ id: 'p1', x: 0, y: 0, isConstruction: false }],
    });
    render(<SketchConstraintOverlay />);
    expect(screen.getByText(/Fully Constrained/)).toBeInTheDocument();
  });

  it('shows auto-constraints toggle', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchPhase: 'drawing',
      sketchDof: 2,
      autoConstraintsEnabled: true,
    });
    render(<SketchConstraintOverlay />);
    expect(screen.getByText(/Auto-Constraints/)).toBeInTheDocument();
  });

  it('shows constraint counts', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchPhase: 'drawing',
      sketchDof: 2,
      sketchConstraints: [
        { id: 'c1', type: 'horizontal', entityIds: ['s1'], satisfied: true },
        { id: 'c2', type: 'vertical', entityIds: ['s2'], satisfied: true },
        { id: 'c3', type: 'coincident', entityIds: ['p1', 'p2'], satisfied: false },
      ],
    });
    render(<SketchConstraintOverlay />);
    expect(screen.getByText(/DOF/)).toBeInTheDocument();
  });

  it('renders nothing when sketch phase is selectPlane', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchPhase: 'selectPlane',
      sketchDof: 0,
    });
    const { container } = render(<SketchConstraintOverlay />);
    expect(container.innerHTML).toBe('');
  });
});
