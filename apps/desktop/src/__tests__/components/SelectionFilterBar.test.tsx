import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionFilterBar } from '../../components/SelectionFilterBar';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    selectionFilter: 'body',
    isSketchActive: false,
  });
});

describe('SelectionFilterBar', () => {
  it('renders filter buttons', () => {
    render(<SelectionFilterBar />);
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Face')).toBeInTheDocument();
    expect(screen.getByText('Edge')).toBeInTheDocument();
    expect(screen.getByText('Vertex')).toBeInTheDocument();
    expect(screen.getByText('Component')).toBeInTheDocument();
  });

  it('shows Selection label', () => {
    render(<SelectionFilterBar />);
    expect(screen.getByText('Selection:')).toBeInTheDocument();
  });

  it('highlights active filter', () => {
    useEditorStore.setState({ selectionFilter: 'face' });
    render(<SelectionFilterBar />);
    const faceBtn = screen.getByText('Face').closest('button');
    expect(faceBtn?.className).toContain('fusion-blue');
  });

  it('changes filter on click', () => {
    render(<SelectionFilterBar />);
    fireEvent.click(screen.getByText('Edge'));
    expect(useEditorStore.getState().selectionFilter).toBe('edge');
  });

  it('cycles through all filters', () => {
    render(<SelectionFilterBar />);

    fireEvent.click(screen.getByText('Face'));
    expect(useEditorStore.getState().selectionFilter).toBe('face');

    fireEvent.click(screen.getByText('Vertex'));
    expect(useEditorStore.getState().selectionFilter).toBe('vertex');

    fireEvent.click(screen.getByText('Component'));
    expect(useEditorStore.getState().selectionFilter).toBe('component');

    fireEvent.click(screen.getByText('Body'));
    expect(useEditorStore.getState().selectionFilter).toBe('body');
  });

  it('is hidden during sketch mode', () => {
    useEditorStore.setState({ isSketchActive: true });
    const { container } = render(<SelectionFilterBar />);
    expect(container.firstChild).toBeNull();
  });
});
