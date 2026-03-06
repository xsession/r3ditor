import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkingMenu } from '../../components/MarkingMenu';
import { useEditorStore } from '../../store/editorStore';

describe('MarkingMenu', () => {
  beforeEach(() => {
    useEditorStore.setState({
      markingMenu: { open: false, x: 0, y: 0 },
    });
  });

  it('renders nothing when closed', () => {
    const { container } = render(<MarkingMenu />);
    expect(container.innerHTML).toBe('');
  });

  it('renders radial menu when open', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 400, y: 300 },
    });
    render(<MarkingMenu />);
    // MarkingMenu uses title attributes on buttons, not visible text
    expect(screen.getByTitle(/Redo/)).toBeInTheDocument();
    expect(screen.getByTitle(/Undo/)).toBeInTheDocument();
  });

  it('shows 8 sector buttons', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 400, y: 300 },
    });
    render(<MarkingMenu />);
    // Each sector is a button with a title
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(8);
  });

  it('renders a center dot', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 400, y: 300 },
    });
    const { container } = render(<MarkingMenu />);
    const centerDot = container.querySelector('.rounded-full.bg-fusion-blue\\/60');
    expect(centerDot).toBeTruthy();
  });

  it('positions menu at specified coordinates', () => {
    useEditorStore.setState({
      markingMenu: { open: true, x: 200, y: 150 },
    });
    const { container } = render(<MarkingMenu />);
    const positioned = container.querySelector('[style*="left: 200px"]');
    expect(positioned).toBeTruthy();
  });
});
