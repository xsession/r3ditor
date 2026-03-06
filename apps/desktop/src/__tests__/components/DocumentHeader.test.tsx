import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentHeader } from '../../components/DocumentHeader';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    documentName: 'Untitled',
    canUndo: false,
    canRedo: false,
  });
});

describe('DocumentHeader', () => {
  it('renders the document name', () => {
    useEditorStore.setState({ documentName: 'My Part' });
    render(<DocumentHeader />);
    expect(screen.getByText('My Part')).toBeInTheDocument();
  });

  it('renders default document name', () => {
    render(<DocumentHeader />);
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('shows File menu button', () => {
    render(<DocumentHeader />);
    expect(screen.getByText('File')).toBeInTheDocument();
  });

  it('opens file menu on click', () => {
    render(<DocumentHeader />);
    fireEvent.click(screen.getByText('File'));
    expect(screen.getByText('New Design')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Export STL...')).toBeInTheDocument();
  });

  it('shows all file menu items', () => {
    render(<DocumentHeader />);
    fireEvent.click(screen.getByText('File'));
    expect(screen.getByText('New Design')).toBeInTheDocument();
    expect(screen.getByText('Open...')).toBeInTheDocument();
    expect(screen.getByText('Save As...')).toBeInTheDocument();
    expect(screen.getByText('Export STL...')).toBeInTheDocument();
    expect(screen.getByText('3D Print...')).toBeInTheDocument();
    expect(screen.getByText('Preferences...')).toBeInTheDocument();
  });

  it('closes file menu on second click', () => {
    render(<DocumentHeader />);
    const fileBtn = screen.getByText('File');
    fireEvent.click(fileBtn);
    expect(screen.getByText('New Design')).toBeInTheDocument();
    fireEvent.click(fileBtn);
    expect(screen.queryByText('New Design')).not.toBeInTheDocument();
  });

  it('shows keyboard shortcuts in file menu', () => {
    render(<DocumentHeader />);
    fireEvent.click(screen.getByText('File'));
    expect(screen.getByText('Ctrl+N')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+O')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+S')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+E')).toBeInTheDocument();
  });

  it('disables undo button when canUndo is false', () => {
    useEditorStore.setState({ canUndo: false });
    render(<DocumentHeader />);
    const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoBtn).toBeDisabled();
  });

  it('enables undo button when canUndo is true', () => {
    useEditorStore.setState({ canUndo: true });
    render(<DocumentHeader />);
    const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoBtn).not.toBeDisabled();
  });

  it('disables redo button when canRedo is false', () => {
    useEditorStore.setState({ canRedo: false });
    render(<DocumentHeader />);
    const redoBtn = screen.getByTitle('Redo (Ctrl+Y)');
    expect(redoBtn).toBeDisabled();
  });

  it('enables redo button when canRedo is true', () => {
    useEditorStore.setState({ canRedo: true });
    render(<DocumentHeader />);
    const redoBtn = screen.getByTitle('Redo (Ctrl+Y)');
    expect(redoBtn).not.toBeDisabled();
  });

  it('renders version indicator', () => {
    render(<DocumentHeader />);
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('shows online status indicator', () => {
    render(<DocumentHeader />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});
