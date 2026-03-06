import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from '../../components/StatusBar';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    showGrid: true,
    showAxes: true,
    statusMessage: 'Ready',
    isSketchActive: false,
    sketchDof: 0,
    viewStyle: 'shadedEdges' as const,
  });
});

describe('StatusBar', () => {
  it('renders status message', () => {
    useEditorStore.setState({ statusMessage: 'Select an object' });
    render(<StatusBar />);
    expect(screen.getByText('Select an object')).toBeInTheDocument();
  });

  it('renders default version text', () => {
    render(<StatusBar />);
    expect(screen.getByText('r3ditor v0.3.0')).toBeInTheDocument();
  });

  it('renders units display', () => {
    render(<StatusBar />);
    expect(screen.getByText('Units: mm')).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    render(<StatusBar />);
    expect(screen.getByTitle('Orbit')).toBeInTheDocument();
    expect(screen.getByTitle('Pan')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom')).toBeInTheDocument();
    expect(screen.getByTitle('Fit All')).toBeInTheDocument();
    expect(screen.getByTitle('Look At')).toBeInTheDocument();
  });

  it('renders grid toggle button', () => {
    render(<StatusBar />);
    expect(screen.getByTitle('Toggle Grid')).toBeInTheDocument();
  });

  it('toggles grid on click', () => {
    useEditorStore.setState({ showGrid: true });
    render(<StatusBar />);
    const gridBtn = screen.getByTitle('Toggle Grid');
    fireEvent.click(gridBtn);
    expect(useEditorStore.getState().showGrid).toBe(false);
  });

  it('does not show DOF when sketch is inactive', () => {
    useEditorStore.setState({ isSketchActive: false });
    render(<StatusBar />);
    expect(screen.queryByText(/DOF:/)).not.toBeInTheDocument();
  });

  it('shows DOF when sketch is active', () => {
    useEditorStore.setState({ isSketchActive: true, sketchDof: 3 });
    render(<StatusBar />);
    expect(screen.getByText('DOF: 3')).toBeInTheDocument();
  });

  it('shows fully constrained DOF (0) with success styling', () => {
    useEditorStore.setState({ isSketchActive: true, sketchDof: 0 });
    render(<StatusBar />);
    const dofElement = screen.getByText('DOF: 0');
    expect(dofElement).toBeInTheDocument();
    expect(dofElement.className).toContain('fusion-success');
  });

  it('shows under-constrained DOF with warning styling', () => {
    useEditorStore.setState({ isSketchActive: true, sketchDof: 5 });
    render(<StatusBar />);
    const dofElement = screen.getByText('DOF: 5');
    expect(dofElement).toBeInTheDocument();
    expect(dofElement.className).toContain('fusion-warning');
  });

  it('shows display settings dropdown', () => {
    render(<StatusBar />);
    expect(screen.getByText('Display')).toBeInTheDocument();
  });

  it('opens display settings dropdown on click', () => {
    render(<StatusBar />);
    fireEvent.click(screen.getByText('Display'));
    expect(screen.getByText('Visual Style')).toBeInTheDocument();
    expect(screen.getByText('Shaded with Edges')).toBeInTheDocument();
    expect(screen.getByText('Shaded')).toBeInTheDocument();
    expect(screen.getByText('Wireframe')).toBeInTheDocument();
    expect(screen.getByText('Hidden Edges')).toBeInTheDocument();
  });

  it('changes view style via display dropdown', () => {
    render(<StatusBar />);
    fireEvent.click(screen.getByText('Display'));
    fireEvent.click(screen.getByText('Wireframe'));
    expect(useEditorStore.getState().viewStyle).toBe('wireframe');
  });

  it('shows visibility toggles in display dropdown', () => {
    render(<StatusBar />);
    fireEvent.click(screen.getByText('Display'));
    expect(screen.getByText('Visibility')).toBeInTheDocument();
  });

  it('renders snap toggle', () => {
    render(<StatusBar />);
    expect(screen.getByTitle('Toggle Snap')).toBeInTheDocument();
  });
});
