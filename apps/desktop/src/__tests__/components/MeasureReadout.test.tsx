import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeasureReadout } from '../../components/MeasureReadout';
import { useEditorStore } from '../../store/editorStore';

describe('MeasureReadout', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'select',
      measureResult: { pointA: null, pointB: null, distance: null, angle: null },
    });
  });

  it('renders nothing when tool is not measure', () => {
    const { container } = render(<MeasureReadout />);
    expect(container.innerHTML).toBe('');
  });

  it('shows instructions when measure tool active but no points', () => {
    useEditorStore.setState({ activeTool: 'measure' });
    render(<MeasureReadout />);
    expect(screen.getByText(/Click first point/i)).toBeInTheDocument();
  });

  it('shows first point when pointA is set', () => {
    useEditorStore.setState({
      activeTool: 'measure',
      measureResult: { pointA: [1, 2, 3], pointB: null, distance: null, angle: null },
    });
    render(<MeasureReadout />);
    expect(screen.getByText('Measure')).toBeInTheDocument();
    expect(screen.getByText(/Point A/)).toBeInTheDocument();
  });

  it('shows distance when both points are set', () => {
    useEditorStore.setState({
      activeTool: 'measure',
      measureResult: {
        pointA: [0, 0, 0],
        pointB: [3, 4, 0],
        distance: 5,
        angle: null,
      },
    });
    render(<MeasureReadout />);
    expect(screen.getByText('Measure')).toBeInTheDocument();
    expect(screen.getByText(/5\.000/)).toBeInTheDocument();
  });

  it('shows dx/dy/dz breakdown', () => {
    useEditorStore.setState({
      activeTool: 'measure',
      measureResult: {
        pointA: [1, 2, 3],
        pointB: [4, 6, 3],
        distance: 5,
        angle: null,
      },
    });
    render(<MeasureReadout />);
    expect(screen.getByText(/ΔX/)).toBeInTheDocument();
    expect(screen.getByText(/ΔY/)).toBeInTheDocument();
    expect(screen.getByText(/ΔZ/)).toBeInTheDocument();
  });

  it('has a clear button', () => {
    useEditorStore.setState({
      activeTool: 'measure',
      measureResult: {
        pointA: [0, 0, 0],
        pointB: [1, 0, 0],
        distance: 1,
        angle: null,
      },
    });
    render(<MeasureReadout />);
    const clearBtn = screen.getByText('Clear Measurement');
    expect(clearBtn).toBeInTheDocument();
  });
});
