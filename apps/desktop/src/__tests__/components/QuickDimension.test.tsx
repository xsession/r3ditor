import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickDimension } from '../../components/QuickDimension';
import { useEditorStore } from '../../store/editorStore';

describe('QuickDimension', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  it('renders nothing when sketch is not active', () => {
    useEditorStore.setState({ isSketchActive: false });
    const { container } = render(<QuickDimension />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when sketch active but no segments', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchSegments: [],
      sketchPoints: [],
      sketchDimensions: [],
    });
    const { container } = render(<QuickDimension />);
    expect(container.innerHTML).toBe('');
  });

  it('shows dimension input when a new line segment is added', () => {
    // First render with no segments
    useEditorStore.setState({
      isSketchActive: true,
      sketchSegments: [],
      sketchPoints: [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 30, y: 40, isConstruction: false },
      ],
      sketchDimensions: [],
    });
    const { rerender } = render(<QuickDimension />);

    // Add a line segment
    useEditorStore.setState({
      sketchSegments: [
        { id: 'seg1', type: 'line', points: ['p1', 'p2'], isConstruction: false },
      ],
    });
    rerender(<QuickDimension />);

    // The "Dim:" label should appear
    expect(screen.getByText('Dim:')).toBeInTheDocument();
  });

  it('shows calculated length as default value', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchSegments: [],
      sketchPoints: [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 3, y: 4, isConstruction: false },
      ],
      sketchDimensions: [],
    });
    const { rerender } = render(<QuickDimension />);

    useEditorStore.setState({
      sketchSegments: [
        { id: 'seg1', type: 'line', points: ['p1', 'p2'], isConstruction: false },
      ],
    });
    rerender(<QuickDimension />);

    // Length of (0,0)→(3,4) = 5
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('5');
  });

  it('has a confirm button', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchSegments: [],
      sketchPoints: [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 10, y: 0, isConstruction: false },
      ],
      sketchDimensions: [],
    });
    const { rerender } = render(<QuickDimension />);

    useEditorStore.setState({
      sketchSegments: [
        { id: 'seg1', type: 'line', points: ['p1', 'p2'], isConstruction: false },
      ],
    });
    rerender(<QuickDimension />);

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('does not show for circle segments', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchSegments: [],
      sketchPoints: [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 5, y: 0, isConstruction: false },
      ],
      sketchDimensions: [],
    });
    const { rerender } = render(<QuickDimension />);

    useEditorStore.setState({
      sketchSegments: [
        { id: 'seg1', type: 'circle', points: ['p1', 'p2'], isConstruction: false },
      ],
    });
    rerender(<QuickDimension />);

    expect(screen.queryByText('Dim:')).not.toBeInTheDocument();
  });

  it('does not show for already-dimensioned segment', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchSegments: [],
      sketchPoints: [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 10, y: 0, isConstruction: false },
      ],
      sketchDimensions: [
        { id: 'dim1', type: 'distance', entityIds: ['seg1'], value: 10, driving: true },
      ],
    });
    const { rerender } = render(<QuickDimension />);

    useEditorStore.setState({
      sketchSegments: [
        { id: 'seg1', type: 'line', points: ['p1', 'p2'], isConstruction: false },
      ],
    });
    rerender(<QuickDimension />);

    expect(screen.queryByText('Dim:')).not.toBeInTheDocument();
  });

  it('has placeholder "mm" on input', () => {
    useEditorStore.setState({
      isSketchActive: true,
      sketchSegments: [],
      sketchPoints: [
        { id: 'p1', x: 0, y: 0, isConstruction: false },
        { id: 'p2', x: 5, y: 5, isConstruction: false },
      ],
      sketchDimensions: [],
    });
    const { rerender } = render(<QuickDimension />);

    useEditorStore.setState({
      sketchSegments: [
        { id: 'seg1', type: 'line', points: ['p1', 'p2'], isConstruction: false },
      ],
    });
    rerender(<QuickDimension />);

    expect(screen.getByPlaceholderText('mm')).toBeInTheDocument();
  });
});
