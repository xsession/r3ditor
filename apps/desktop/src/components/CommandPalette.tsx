import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Clock, ChevronRight } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import {
  type ShortcutBinding,
  formatShortcut,
} from '../shortcuts/registry';
import { getRecentCommands } from '../shortcuts/useKeyboardShortcuts';
import clsx from 'clsx';

interface CommandPaletteProps {
  bindings: React.RefObject<ShortcutBinding[] | null>;
}

/**
 * Fusion 360-style S-key Command Palette.
 * Searchable floating command list with recent commands, grouped by category.
 */
export function CommandPalette({ bindings }: CommandPaletteProps) {
  const { commandPaletteOpen, setCommandPaletteOpen } = useEditorStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input on open
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commandPaletteOpen]);

  // Close on outside click
  useEffect(() => {
    if (!commandPaletteOpen) return;
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setCommandPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const allBindings = bindings.current ?? [];
  const recentIds = getRecentCommands();

  // Filter and sort bindings
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Show recent commands first, then all grouped
      const recent = recentIds
        .map((id) => allBindings.find((b) => b.id === id))
        .filter(Boolean) as ShortcutBinding[];
      const rest = allBindings.filter((b) => !recentIds.includes(b.id));
      return { recent, commands: rest };
    }
    const q = query.toLowerCase();
    const matches = allBindings.filter(
      (b) =>
        b.label.toLowerCase().includes(q) ||
        b.group.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q),
    );
    return { recent: [], commands: matches };
  }, [query, allBindings, recentIds]);

  const flatList = [...filtered.recent, ...filtered.commands];

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[selectedIndex]) {
        flatList[selectedIndex].action();
        setCommandPaletteOpen(false);
      }
    } else if (e.key === 'Escape') {
      setCommandPaletteOpen(false);
    }
  };

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={() => setCommandPaletteOpen(false)} />

      {/* Palette */}
      <div
        ref={listRef}
        className="relative w-[420px] bg-fusion-surface border border-fusion-border-light rounded-lg shadow-2xl overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-fusion-border-light">
          <Search size={14} className="text-fusion-text-secondary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-fusion-text outline-none placeholder:text-fusion-text-disabled"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <span className="text-[10px] text-fusion-text-disabled bg-fusion-panel px-1.5 py-0.5 rounded border border-fusion-border-light">
            S
          </span>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-1">
          {/* Recent section */}
          {filtered.recent.length > 0 && (
            <>
              <div className="px-3 py-1 text-[9px] text-fusion-text-disabled uppercase tracking-wider flex items-center gap-1">
                <Clock size={9} />
                <span>Recent</span>
              </div>
              {filtered.recent.map((b, idx) => (
                <CommandItem
                  key={b.id}
                  binding={b}
                  isSelected={idx === selectedIndex}
                  onClick={() => {
                    b.action();
                    setCommandPaletteOpen(false);
                  }}
                />
              ))}
              {filtered.commands.length > 0 && (
                <div className="h-px bg-fusion-border-light my-1 mx-2" />
              )}
            </>
          )}

          {/* All commands grouped */}
          {filtered.commands.length === 0 && filtered.recent.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-fusion-text-disabled">
              No matching commands
            </div>
          )}

          {(() => {
            let currentGroup = '';
            const offset = filtered.recent.length;
            return filtered.commands.map((b, idx) => {
              const showGroup = b.group !== currentGroup;
              currentGroup = b.group;
              return (
                <div key={b.id}>
                  {showGroup && (
                    <div className="px-3 py-1 text-[9px] text-fusion-text-disabled uppercase tracking-wider flex items-center gap-1 mt-1">
                      <ChevronRight size={9} />
                      <span>{b.group}</span>
                    </div>
                  )}
                  <CommandItem
                    binding={b}
                    isSelected={offset + idx === selectedIndex}
                    onClick={() => {
                      b.action();
                      setCommandPaletteOpen(false);
                    }}
                  />
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}

function CommandItem({
  binding,
  isSelected,
  onClick,
}: {
  binding: ShortcutBinding;
  isSelected: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSelected) {
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  return (
    <button
      ref={ref}
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
        isSelected
          ? 'bg-fusion-blue/15 text-fusion-blue'
          : 'text-fusion-text hover:bg-fusion-hover',
      )}
      onClick={onClick}
    >
      <span className="flex-1 text-left">{binding.label}</span>
      <span className="text-[10px] text-fusion-text-disabled bg-fusion-panel px-1.5 py-0.5 rounded border border-fusion-border-light">
        {formatShortcut(binding.keys)}
      </span>
    </button>
  );
}
