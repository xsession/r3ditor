import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoxSelectionOverlay } from '../../components/BoxSelectionOverlay';
import { useEditorStore } from '../../store/editorStore';

describe('BoxSelectionOverlay', () => {
  beforeEach(() => {
    useEditorStore.setState({
      boxSelection: { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, mode: 'window' },
      isSketchActive: false,
      activeTool: 'select',
    });
  });

  it('renders nothing when selection is not active', () => {
    const { container } = render(<BoxSelectionOverlay />);
    // Component returns null when not active
    expect(container.innerHTML).toBe('');
  });

  it('renders selection rectangle when active with sufficient size', () => {
    useEditorStore.setState({
      boxSelection: {
        active: true,
        startX: 100,
        startY: 100,
        currentX: 300,
        currentY: 250,
        mode: 'window',
      },
    });
    const { container } = render(<BoxSelectionOverlay />);
    // Should render with position style
    const selRect = container.querySelector('.fixed');
    expect(selRect).toBeTruthy();
  });

  it('shows Window label for window mode (left-to-right)', () => {
    useEditorStore.setState({
      boxSelection: {
        active: true,
        startX: 100,
        startY: 100,
        currentX: 300,
        currentY: 200,
        mode: 'window',
      },
    });
    render(<BoxSelectionOverlay />);
    expect(screen.getByText('Window')).toBeInTheDocument();
  });

  it('shows Crossing label for crossing mode (right-to-left)', () => {
    useEditorStore.setState({
      boxSelection: {
        active: true,
        startX: 300,
        startY: 100,
        currentX: 100,
        currentY: 200,
        mode: 'crossing',
      },
    });
    render(<BoxSelectionOverlay />);
    expect(screen.getByText('Crossing')).toBeInTheDocument();
  });

  it('computes correct box position and dimensions', () => {
    useEditorStore.setState({
      boxSelection: {
        active: true,
        startX: 100,
        startY: 50,
        currentX: 300,
        currentY: 200,
        mode: 'window',
      },
    });
    const { container } = render(<BoxSelectionOverlay />);
    const rect = container.querySelector('.fixed') as HTMLElement;
    expect(rect).toBeTruthy();
    if (rect) {
      expect(rect.style.left).toBe('100px');
      expect(rect.style.top).toBe('50px');
      expect(rect.style.width).toBe('200px');
      expect(rect.style.height).toBe('150px');
    }
  });

  it('does not render when box is too small', () => {
    useEditorStore.setState({
      boxSelection: {
        active: true,
        startX: 100,
        startY: 100,
        currentX: 101,
        currentY: 101,
        mode: 'window',
      },
    });
    const { container } = render(<BoxSelectionOverlay />);
    expect(container.innerHTML).toBe('');
  });
});
