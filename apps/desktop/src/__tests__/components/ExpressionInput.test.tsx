import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpressionInput } from '../../components/ExpressionInput';

describe('ExpressionInput', () => {
  // ── Basic rendering ──

  it('renders with numeric value', () => {
    render(<ExpressionInput value={42} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('42');
  });

  it('renders with label when provided', () => {
    render(<ExpressionInput value={10} onChange={vi.fn()} label="Width" />);
    expect(screen.getByText('Width')).toBeInTheDocument();
  });

  it('renders with unit suffix when provided', () => {
    render(<ExpressionInput value={10} onChange={vi.fn()} unit="mm" />);
    expect(screen.getByText('mm')).toBeInTheDocument();
  });

  // ── Editing plain numbers ──

  it('calls onChange with number on Enter', async () => {
    const onChange = vi.fn();
    render(<ExpressionInput value={10} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '25');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it('reverts display on Escape', async () => {
    const onChange = vi.fn();
    render(<ExpressionInput value={10} onChange={onChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, '999');
    await userEvent.keyboard('{Escape}');
    // After Escape, the displayed value should revert to original
    expect(input.value).toBe('10');
  });

  // ── Expression evaluation ──

  it('evaluates simple math expression', async () => {
    const onChange = vi.fn();
    render(<ExpressionInput value={0} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '2+3');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('evaluates expression with variables', async () => {
    const onChange = vi.fn();
    render(<ExpressionInput value={0} onChange={onChange} variables={{ width: 10 }} />);
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'width*2');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('shows formula indicator for expressions', async () => {
    render(<ExpressionInput value={0} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, '2+3');
    // Should show the ƒ indicator
    expect(screen.getByText('ƒ')).toBeInTheDocument();
  });

  // ── Error handling ──

  it('shows nothing special for plain numbers', () => {
    render(<ExpressionInput value={42} onChange={vi.fn()} />);
    expect(screen.queryByText('ƒ')).not.toBeInTheDocument();
  });

  // ── spellCheck disabled ──

  it('has spellCheck disabled', () => {
    render(<ExpressionInput value={10} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });

  // ── Value sync ──

  it('updates display when value prop changes', () => {
    const { rerender } = render(<ExpressionInput value={10} onChange={vi.fn()} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('10');
    rerender(<ExpressionInput value={20} onChange={vi.fn()} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('20');
  });
});
