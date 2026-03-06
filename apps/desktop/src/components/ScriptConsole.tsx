import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Terminal, X, Play, Trash2, Copy } from 'lucide-react';
import clsx from 'clsx';

/**
 * ScriptConsole — FreeCAD/SALOME-style script console.
 *
 * Features:
 * - Logs all user actions as commands (FreeCAD "macro recording" pattern)
 * - Interactive REPL-style input for executing commands
 * - Syntax-highlighted output (info/warning/error)
 * - Copy-to-clipboard for generated scripts
 * - Collapsible panel at the bottom
 */

export interface ScriptEntry {
  id: string;
  timestamp: number;
  type: 'command' | 'output' | 'error' | 'info';
  text: string;
}

export function ScriptConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<ScriptEntry[]>([
    { id: 'init', timestamp: Date.now(), type: 'info', text: '# r3ditor Script Console — FreeCAD-style macro recording' },
    { id: 'init2', timestamp: Date.now(), type: 'info', text: '# Type commands or view recorded actions' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Watch store changes and log as script commands
  const timeline = useEditorStore((s) => s.timeline);
  const prevTimelineLen = useRef(timeline.length);

  useEffect(() => {
    if (timeline.length > prevTimelineLen.current) {
      const newEntries = timeline.slice(prevTimelineLen.current);
      const scriptEntries: ScriptEntry[] = newEntries.map((entry) => ({
        id: `action_${entry.id}`,
        timestamp: Date.now(),
        type: 'command' as const,
        text: generateCommand(entry.type, entry.name),
      }));
      setEntries((prev) => [...prev, ...scriptEntries]);
    }
    prevTimelineLen.current = timeline.length;
  }, [timeline]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const executeCommand = useCallback(() => {
    const cmd = inputValue.trim();
    if (!cmd) return;

    // Add to entries and history
    const cmdEntry: ScriptEntry = {
      id: `cmd_${Date.now()}`,
      timestamp: Date.now(),
      type: 'command',
      text: `>>> ${cmd}`,
    };
    setEntries((prev) => [...prev, cmdEntry]);
    setCommandHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setInputValue('');

    // Simple command interpreter
    try {
      const result = interpretCommand(cmd);
      if (result) {
        setEntries((prev) => [...prev, {
          id: `out_${Date.now()}`,
          timestamp: Date.now(),
          type: 'output',
          text: result,
        }]);
      }
    } catch (e) {
      setEntries((prev) => [...prev, {
        id: `err_${Date.now()}`,
        timestamp: Date.now(),
        type: 'error',
        text: `Error: ${(e as Error).message}`,
      }]);
    }
  }, [inputValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand();
    }
    if (e.key === 'ArrowUp' && commandHistory.length > 0) {
      e.preventDefault();
      const newIdx = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIdx);
      setInputValue(commandHistory[commandHistory.length - 1 - newIdx]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setInputValue(commandHistory[commandHistory.length - 1 - newIdx]);
      } else {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  }, [executeCommand, commandHistory, historyIndex]);

  const copyAllCommands = useCallback(() => {
    const commands = entries
      .filter((e) => e.type === 'command')
      .map((e) => e.text.replace(/^>>> /, ''))
      .join('\n');
    navigator.clipboard?.writeText(commands);
    setEntries((prev) => [...prev, {
      id: `info_${Date.now()}`,
      timestamp: Date.now(),
      type: 'info',
      text: '# Commands copied to clipboard',
    }]);
  }, [entries]);

  const clearConsole = useCallback(() => {
    setEntries([{
      id: 'cleared',
      timestamp: Date.now(),
      type: 'info',
      text: '# Console cleared',
    }]);
  }, []);

  if (!isOpen) {
    return (
      <button
        className="fixed bottom-16 right-4 z-50 flex items-center gap-1 px-2 py-1 bg-fusion-surface border border-fusion-border-light rounded shadow-lg text-[10px] text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-hover transition-colors"
        onClick={() => setIsOpen(true)}
        title="Open Script Console"
      >
        <Terminal size={12} />
        <span>Console</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-16 right-4 z-50 w-[480px] h-64 bg-fusion-surface border border-fusion-border-light rounded-t shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-fusion-panel border-b border-fusion-border-light flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Terminal size={12} className="text-fusion-text-secondary" />
          <span className="text-xs font-medium text-fusion-text">Script Console</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-text transition-colors"
            onClick={copyAllCommands}
            title="Copy all commands"
          >
            <Copy size={11} />
          </button>
          <button
            className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-text transition-colors"
            onClick={clearConsole}
            title="Clear console"
          >
            <Trash2 size={11} />
          </button>
          <button
            className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-text transition-colors"
            onClick={() => setIsOpen(false)}
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed space-y-0.5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={clsx(
              entry.type === 'command' && 'text-fusion-blue',
              entry.type === 'output' && 'text-fusion-text',
              entry.type === 'error' && 'text-red-400',
              entry.type === 'info' && 'text-fusion-text-disabled italic',
            )}
          >
            {entry.text}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-t border-fusion-border-light bg-fusion-panel flex-shrink-0">
        <span className="text-fusion-blue text-xs font-mono">{'>>>'}</span>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-xs text-fusion-text font-mono outline-none placeholder:text-fusion-text-disabled"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          spellCheck={false}
        />
        <button
          className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-secondary hover:text-fusion-text transition-colors"
          onClick={executeCommand}
          title="Execute"
        >
          <Play size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Command generation (action → script text) ──

function generateCommand(type: string, name: string): string {
  const cmds: Record<string, string> = {
    sketch: `app.createSketch("${name}")`,
    extrude: `app.extrude("${name}", distance=10)`,
    revolve: `app.revolve("${name}", angle=360)`,
    fillet: `app.fillet("${name}", radius=2)`,
    chamfer: `app.chamfer("${name}", distance=1)`,
    shell: `app.shell("${name}", thickness=1)`,
    hole: `app.hole("${name}", diameter=5, depth=10)`,
    boolean: `app.boolean("${name}", operation="combine")`,
    linearPattern: `app.linearPattern("${name}", count=3)`,
    circularPattern: `app.circularPattern("${name}", count=6)`,
    component: `app.addComponent("${name}")`,
    joint: `app.addJoint("${name}")`,
  };
  return cmds[type] || `app.create("${type}", name="${name}")`;
}

// ── Simple command interpreter ──

function interpretCommand(cmd: string): string | null {
  const store = useEditorStore.getState();

  // Help
  if (cmd === 'help' || cmd === '?') {
    return [
      'Available commands:',
      '  help             — Show this help',
      '  entities         — List all entities',
      '  timeline         — Show timeline entries',
      '  select <id>      — Select an entity',
      '  tool <name>      — Set active tool',
      '  clear            — Clear selection',
      '  status           — Show current status',
      '  dof              — Show sketch DOF',
      '  undo             — Undo last action',
      '  redo             — Redo last action',
    ].join('\n');
  }

  // Entities
  if (cmd === 'entities' || cmd === 'ls') {
    const { entities } = store;
    if (entities.length === 0) return '(no entities)';
    return entities.map((e) => `  ${e.id}: ${e.name} [${e.type}]${e.visible ? '' : ' (hidden)'}`).join('\n');
  }

  // Timeline
  if (cmd === 'timeline' || cmd === 'tl') {
    const { timeline } = store;
    if (timeline.length === 0) return '(empty timeline)';
    return timeline.map((e, i) => `  [${i}] ${e.name} (${e.type})${e.suppressed ? ' SUPPRESSED' : ''}`).join('\n');
  }

  // Select
  if (cmd.startsWith('select ')) {
    const id = cmd.substring(7).trim();
    store.select(id);
    return `Selected: ${id}`;
  }

  // Tool
  if (cmd.startsWith('tool ')) {
    const tool = cmd.substring(5).trim();
    store.setTool(tool as any);
    return `Tool set to: ${tool}`;
  }

  // Clear selection
  if (cmd === 'clear') {
    store.clearSelection();
    return 'Selection cleared';
  }

  // Status
  if (cmd === 'status') {
    return [
      `Tool: ${store.activeTool}`,
      `Selected: ${store.selectedIds.length} entities`,
      `Sketch active: ${store.isSketchActive}`,
      `View style: ${store.viewStyle}`,
      `Timeline: ${store.timeline.length} entries`,
    ].join('\n');
  }

  // DOF
  if (cmd === 'dof') {
    return `Sketch DOF: ${store.sketchDof}`;
  }

  return `Unknown command: '${cmd}'. Type 'help' for available commands.`;
}
