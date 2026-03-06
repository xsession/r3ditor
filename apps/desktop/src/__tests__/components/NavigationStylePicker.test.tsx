import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationStylePicker, NAVIGATION_STYLES } from '../../components/NavigationStylePicker';

describe('NavigationStylePicker', () => {
  // ── Collapsed state ──

  it('renders trigger button with default style name', () => {
    render(<NavigationStylePicker />);
    expect(screen.getByText('Fusion 360')).toBeInTheDocument();
  });

  it('shows chosen style name on trigger', () => {
    render(<NavigationStylePicker value="blender" />);
    expect(screen.getByText('Blender')).toBeInTheDocument();
  });

  it('has a Navigation Style title', () => {
    render(<NavigationStylePicker />);
    expect(screen.getByTitle('Navigation Style')).toBeInTheDocument();
  });

  // ── Dropdown open ──

  it('opens dropdown on click', async () => {
    render(<NavigationStylePicker />);
    await userEvent.click(screen.getByTitle('Navigation Style'));
    // Should show all style names in the dropdown
    NAVIGATION_STYLES.forEach((style) => {
      expect(screen.getAllByText(style.name).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows orbit and pan hints in dropdown', async () => {
    render(<NavigationStylePicker />);
    await userEvent.click(screen.getByTitle('Navigation Style'));
    expect(screen.getAllByText(/Orbit:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pan:/).length).toBeGreaterThan(0);
  });

  it('shows current style details section', async () => {
    render(<NavigationStylePicker value="freecad" />);
    await userEvent.click(screen.getByTitle('Navigation Style'));
    expect(screen.getByText(/Current: FreeCAD/)).toBeInTheDocument();
  });

  // ── Selection ──

  it('calls onChange when a style is selected', async () => {
    const onChange = vi.fn();
    render(<NavigationStylePicker value="fusion360" onChange={onChange} />);
    await userEvent.click(screen.getByTitle('Navigation Style'));
    // Find and click Blender option
    const blenderButtons = screen.getAllByText('Blender');
    // Click the one that is a full button (inside the dropdown list)
    await userEvent.click(blenderButtons[0]);
    expect(onChange).toHaveBeenCalledWith('blender');
  });

  it('closes dropdown after selection', async () => {
    const onChange = vi.fn();
    render(<NavigationStylePicker value="fusion360" onChange={onChange} />);
    await userEvent.click(screen.getByTitle('Navigation Style'));
    const blenderButtons = screen.getAllByText('Blender');
    await userEvent.click(blenderButtons[0]);
    // Dropdown should be closed — no "Navigation Style" heading in dropdown
    expect(screen.queryByText(/Current:/)).not.toBeInTheDocument();
  });

  // ── NAVIGATION_STYLES export ──

  it('exports 5 navigation styles', () => {
    expect(NAVIGATION_STYLES).toHaveLength(5);
  });

  it('each style has required fields', () => {
    NAVIGATION_STYLES.forEach((style) => {
      expect(style.id).toBeTruthy();
      expect(style.name).toBeTruthy();
      expect(style.orbit).toBeTruthy();
      expect(style.pan).toBeTruthy();
      expect(style.zoom).toBeTruthy();
      expect(style.select).toBeTruthy();
      expect(style.contextMenu).toBeTruthy();
    });
  });

  it('defaults to fusion360 if value not found', () => {
    render(<NavigationStylePicker value="nonexistent" />);
    // Falls back to first style (Fusion 360)
    expect(screen.getByText('Fusion 360')).toBeInTheDocument();
  });
});
