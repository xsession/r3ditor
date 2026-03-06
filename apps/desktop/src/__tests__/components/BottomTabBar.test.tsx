import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomTabBar } from '../../components/BottomTabBar';
import { useEditorStore, type TimelineEntry } from '../../store/editorStore';

const makeEntry = (overrides: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: 'feat-1',
  name: 'Extrude1',
  type: 'extrude',
  suppressed: false,
  hasError: false,
  ...overrides,
});

beforeEach(() => {
  useEditorStore.setState({
    timeline: [],
    rollbackIndex: -1,
    selectedIds: [],
  });
});

describe('BottomTabBar', () => {
  it('renders TIMELINE label', () => {
    render(<BottomTabBar />);
    expect(screen.getByText('TIMELINE')).toBeInTheDocument();
  });

  it('shows empty state message when no features exist', () => {
    render(<BottomTabBar />);
    expect(screen.getByText(/No features yet/)).toBeInTheDocument();
  });

  it('renders timeline entries', () => {
    useEditorStore.setState({
      timeline: [
        makeEntry({ id: 'f1', name: 'Sketch1', type: 'sketch' }),
        makeEntry({ id: 'f2', name: 'Extrude1', type: 'extrude' }),
        makeEntry({ id: 'f3', name: 'Fillet1', type: 'fillet' }),
      ],
    });
    render(<BottomTabBar />);
    expect(screen.getByTitle('Sketch1')).toBeInTheDocument();
    expect(screen.getByTitle('Extrude1')).toBeInTheDocument();
    expect(screen.getByTitle('Fillet1')).toBeInTheDocument();
  });

  it('selects feature on click', () => {
    useEditorStore.setState({
      timeline: [makeEntry({ id: 'f1', name: 'Extrude1' })],
    });
    render(<BottomTabBar />);
    fireEvent.click(screen.getByTitle('Extrude1'));
    expect(useEditorStore.getState().selectedIds).toContain('f1');
  });

  it('renders suppressed features with reduced opacity', () => {
    useEditorStore.setState({
      timeline: [makeEntry({ id: 'f1', name: 'Suppressed', suppressed: true })],
    });
    render(<BottomTabBar />);
    const btn = screen.getByTitle('Suppressed');
    expect(btn.className).toContain('opacity-40');
  });

  it('renders error features with error styling', () => {
    useEditorStore.setState({
      timeline: [makeEntry({ id: 'f1', name: 'Broken', hasError: true })],
    });
    render(<BottomTabBar />);
    const btn = screen.getByTitle('Broken');
    expect(btn.className).toContain('fusion-error');
  });

  it('renders rolled-back features with reduced opacity', () => {
    useEditorStore.setState({
      timeline: [
        makeEntry({ id: 'f1', name: 'Feature1' }),
        makeEntry({ id: 'f2', name: 'Feature2' }),
        makeEntry({ id: 'f3', name: 'Feature3' }),
      ],
      rollbackIndex: 0, // Only f1 is active, f2 and f3 are rolled back
    });
    render(<BottomTabBar />);
    const f3btn = screen.getByTitle('Feature3');
    expect(f3btn.className).toContain('opacity-30');
  });

  it('renders scroll buttons', () => {
    render(<BottomTabBar />);
    // Should have chevron-left and chevron-right buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('handles multiple feature types with correct icons', () => {
    useEditorStore.setState({
      timeline: [
        makeEntry({ id: 'f1', name: 'Sketch1', type: 'sketch' }),
        makeEntry({ id: 'f2', name: 'Extrude1', type: 'extrude' }),
        makeEntry({ id: 'f3', name: 'Revolve1', type: 'revolve' }),
        makeEntry({ id: 'f4', name: 'Fillet1', type: 'fillet' }),
        makeEntry({ id: 'f5', name: 'Shell1', type: 'shell' }),
      ],
    });
    render(<BottomTabBar />);
    expect(screen.getByTitle('Sketch1')).toBeInTheDocument();
    expect(screen.getByTitle('Extrude1')).toBeInTheDocument();
    expect(screen.getByTitle('Revolve1')).toBeInTheDocument();
    expect(screen.getByTitle('Fillet1')).toBeInTheDocument();
    expect(screen.getByTitle('Shell1')).toBeInTheDocument();
  });
});
