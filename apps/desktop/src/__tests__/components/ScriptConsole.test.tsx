import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScriptConsole } from '../../components/ScriptConsole';
import { useEditorStore } from '../../store/editorStore';

// clipboard mock
Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });

describe('ScriptConsole', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  // ── Collapsed state ──

  it('renders toggle button when closed', () => {
    render(<ScriptConsole />);
    expect(screen.getByTitle('Open Script Console')).toBeInTheDocument();
    expect(screen.getByText('Console')).toBeInTheDocument();
  });

  it('opens panel when toggle is clicked', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    expect(screen.getByText('Script Console')).toBeInTheDocument();
  });

  // ── Open state ──

  it('shows initial info entries', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    expect(screen.getByText(/r3ditor Script Console/)).toBeInTheDocument();
    expect(screen.getByText(/Type commands/)).toBeInTheDocument();
  });

  it('has an input field with placeholder', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
  });

  it('has execute, copy, clear, and close buttons', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    expect(screen.getByTitle('Execute')).toBeInTheDocument();
    expect(screen.getByTitle('Copy all commands')).toBeInTheDocument();
    expect(screen.getByTitle('Clear console')).toBeInTheDocument();
    expect(screen.getByTitle('Close')).toBeInTheDocument();
  });

  // ── Command execution ──

  it('executes "help" command', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    const input = screen.getByPlaceholderText('Type a command...');
    await userEvent.type(input, 'help');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/Available commands/)).toBeInTheDocument();
  });

  it('executes "status" command', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    const input = screen.getByPlaceholderText('Type a command...');
    await userEvent.type(input, 'status');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/Tool:/)).toBeInTheDocument();
  });

  it('executes "dof" command', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    const input = screen.getByPlaceholderText('Type a command...');
    await userEvent.type(input, 'dof');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/Sketch DOF/)).toBeInTheDocument();
  });

  it('handles unknown command gracefully', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    const input = screen.getByPlaceholderText('Type a command...');
    await userEvent.type(input, 'foo');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/Unknown command.*foo/)).toBeInTheDocument();
  });

  it('shows error output for "entities" when none exist', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    const input = screen.getByPlaceholderText('Type a command...');
    await userEvent.type(input, 'entities');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText(/no entities/)).toBeInTheDocument();
  });

  it('clears input after executing command', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    const input = screen.getByPlaceholderText('Type a command...') as HTMLInputElement;
    await userEvent.type(input, 'help');
    await userEvent.keyboard('{Enter}');
    expect(input.value).toBe('');
  });

  // ── Clear console ──

  it('clears console entries', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    await userEvent.click(screen.getByTitle('Clear console'));
    expect(screen.getByText(/Console cleared/)).toBeInTheDocument();
  });

  // ── Close ──

  it('closes when close button clicked', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    expect(screen.getByText('Script Console')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Close'));
    // Should show the toggle button again
    expect(screen.getByTitle('Open Script Console')).toBeInTheDocument();
  });

  // ── Prompt indicator ──

  it('shows >>> prompt indicator', async () => {
    render(<ScriptConsole />);
    await userEvent.click(screen.getByTitle('Open Script Console'));
    expect(screen.getByText('>>>')).toBeInTheDocument();
  });
});
