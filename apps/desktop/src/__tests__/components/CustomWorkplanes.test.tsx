import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomWorkplaneManager } from '../../components/CustomWorkplanes';
import { useEditorStore } from '../../store/editorStore';

describe('CustomWorkplaneManager', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  // ── Collapsed state ──

  it('renders toggle button when closed', () => {
    render(<CustomWorkplaneManager />);
    expect(screen.getByTitle('Custom Workplanes')).toBeInTheDocument();
    expect(screen.getByText('Workplanes')).toBeInTheDocument();
  });

  it('opens panel when clicked', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    expect(screen.getByText('Construction Planes')).toBeInTheDocument();
  });

  // ── Open panel contents ──

  it('shows Add button', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('shows "No custom workplanes yet" when empty', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    expect(screen.getByText('No custom workplanes yet')).toBeInTheDocument();
  });

  it('shows standard planes (XY, XZ, YZ)', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    expect(screen.getByText('Standard Planes')).toBeInTheDocument();
    expect(screen.getByText('XY')).toBeInTheDocument();
    expect(screen.getByText('XZ')).toBeInTheDocument();
    expect(screen.getByText('YZ')).toBeInTheDocument();
  });

  // ── Add workplane ──

  it('shows presets when Add clicked', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    await userEvent.click(screen.getByText('Add'));
    expect(screen.getByText('Offset from XY')).toBeInTheDocument();
    expect(screen.getByText('Offset from XZ')).toBeInTheDocument();
    expect(screen.getByText('Offset from YZ')).toBeInTheDocument();
    expect(screen.getByText(/Angled/)).toBeInTheDocument();
  });

  it('shows offset input field', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    await userEvent.click(screen.getByText('Add'));
    expect(screen.getByText('Offset:')).toBeInTheDocument();
    expect(screen.getByText('mm')).toBeInTheDocument();
  });

  it('adds a workplane when preset is clicked', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    await userEvent.click(screen.getByText('Add'));
    await userEvent.click(screen.getByText('Offset from XY'));
    // Workplane should now appear in list
    expect(screen.getByText(/Offset from XY @ 10mm/)).toBeInTheDocument();
    // "No custom workplanes" should be gone
    expect(screen.queryByText('No custom workplanes yet')).not.toBeInTheDocument();
  });

  it('adds multiple workplanes', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));

    await userEvent.click(screen.getByText('Add'));
    await userEvent.click(screen.getByText('Offset from XY'));

    await userEvent.click(screen.getByText('Add'));
    await userEvent.click(screen.getByText('Offset from XZ'));

    expect(screen.getByText(/Offset from XY/)).toBeInTheDocument();
    expect(screen.getByText(/Offset from XZ/)).toBeInTheDocument();
  });

  // ── Workplane actions ──

  it('shows visibility toggle on hover (initial visible)', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    await userEvent.click(screen.getByText('Add'));
    await userEvent.click(screen.getByText('Offset from XY'));
    // The Hide button should exist (opacity-0 in CSS but present in DOM)
    const hideBtn = screen.getByTitle('Hide');
    expect(hideBtn).toBeInTheDocument();
  });

  it('shows delete button', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    await userEvent.click(screen.getByText('Add'));
    await userEvent.click(screen.getByText('Offset from XY'));
    const deleteBtn = screen.getByTitle('Delete');
    expect(deleteBtn).toBeInTheDocument();
  });

  it('removes workplane when delete clicked', async () => {
    render(<CustomWorkplaneManager />);
    await userEvent.click(screen.getByTitle('Custom Workplanes'));
    await userEvent.click(screen.getByText('Add'));
    await userEvent.click(screen.getByText('Offset from XY'));
    expect(screen.getByText(/Offset from XY/)).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText('No custom workplanes yet')).toBeInTheDocument();
  });
});
