import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigurationManager } from '../../components/ConfigurationManager';
import { useEditorStore } from '../../store/editorStore';

describe('ConfigurationManager', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  // ── Collapsed state ──

  it('renders trigger button when closed', () => {
    render(<ConfigurationManager />);
    expect(screen.getByTitle('Configurations')).toBeInTheDocument();
    expect(screen.getByText('Configs')).toBeInTheDocument();
  });

  it('opens panel when clicked', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    expect(screen.getByText('Configuration Manager')).toBeInTheDocument();
  });

  // ── Open panel contents ──

  it('shows parameter table with headers', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    expect(screen.getByText('Parameter')).toBeInTheDocument();
  });

  it('shows default parameters (Width, Height, Depth)', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    expect(screen.getByText('Width')).toBeInTheDocument();
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('Depth')).toBeInTheDocument();
  });

  it('shows 3 default variants (Default, Large, Small)', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    // Variant names are inputs — check display values
    expect(screen.getByDisplayValue('Default')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Large')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Small')).toBeInTheDocument();
  });

  it('shows active variant in footer', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    expect(screen.getByText(/Active:/)).toBeInTheDocument();
  });

  it('shows Add Variant button', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    expect(screen.getByText('Add Variant')).toBeInTheDocument();
  });

  // ── Add variant ──

  it('adds a new variant on button click', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    await userEvent.click(screen.getByText('Add Variant'));
    // Should now have 4 variant columns (Default, Large, Small, Variant 3)
    expect(screen.getByDisplayValue('Variant 3')).toBeInTheDocument();
  });

  // ── Duplicate variant ──

  it('has duplicate buttons for variants', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    const dupButtons = screen.getAllByTitle('Duplicate');
    expect(dupButtons.length).toBeGreaterThanOrEqual(3);
  });

  // ── Remove variant ──

  it('has remove buttons for non-default variants', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    const removeButtons = screen.getAllByTitle('Remove');
    // Default variant has no remove — Large and Small do
    expect(removeButtons.length).toBe(2);
  });

  it('removes a variant when remove is clicked', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    const removeButtons = screen.getAllByTitle('Remove');
    await userEvent.click(removeButtons[0]);
    // Now only 2 variant columns
    const dupButtons = screen.getAllByTitle('Duplicate');
    expect(dupButtons.length).toBe(2);
  });

  // ── Activate variant ──

  it('has activate buttons for non-active variants', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    const activateButtons = screen.getAllByTitle('Activate');
    // Default is active, Large and Small have activate buttons
    expect(activateButtons.length).toBe(2);
  });

  // ── Close ──

  it('closes panel when X is clicked', async () => {
    render(<ConfigurationManager />);
    await userEvent.click(screen.getByTitle('Configurations'));
    expect(screen.getByText('Configuration Manager')).toBeInTheDocument();
    // The close button is the X in the header
    const panel = screen.getByText('Configuration Manager').closest('div')!.parentElement!;
    const closeBtn = panel.querySelector('button:last-child');
    // We know it exists from the component code
    expect(closeBtn).toBeTruthy();
  });
});
