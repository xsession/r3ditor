import {
  Undo2, Redo2, ChevronDown, Search, Save,
  Bell, HelpCircle, User, Menu, FileText,
  FilePlus, FolderOpen, Download, Printer, Settings,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import * as api from '../api/tauri';
import clsx from 'clsx';
import { useState, useRef, useEffect } from 'react';

/**
 * Fusion 360-style Application Bar.
 * Layout: [File ≡] [Save] [Undo/Redo] ── Document Name ── [Notifications] [Help] [Account]
 */
export function DocumentHeader() {
  const { documentName, canUndo, canRedo, toggleDataPanel } = useEditorStore();
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!fileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fileMenuOpen]);

  return (
    <div className="flex items-center h-10 px-1 bg-fusion-header border-b border-fusion-border select-none" data-tauri-drag-region>
      {/* ── File menu (hamburger) ── */}
      <div className="relative" ref={menuRef}>
        <button
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm transition-colors',
            fileMenuOpen
              ? 'bg-fusion-surface-hover text-fusion-text-bright'
              : 'text-fusion-text hover:bg-fusion-header-hover',
          )}
          onClick={() => setFileMenuOpen(!fileMenuOpen)}
        >
          <Menu size={16} />
          <span className="text-xs font-medium">File</span>
          <ChevronDown size={10} className="text-fusion-text-secondary" />
        </button>

        {/* File dropdown */}
        {fileMenuOpen && (
          <div className="absolute top-full left-0 mt-0.5 w-56 bg-fusion-surface border border-fusion-border-light rounded shadow-xl z-[200] py-1">
            <FileMenuItem icon={FilePlus} label="New Design" shortcut="Ctrl+N" />
            <FileMenuItem icon={FolderOpen} label="Open..." shortcut="Ctrl+O" onClick={() => { toggleDataPanel(); setFileMenuOpen(false); }} />
            <div className="h-px bg-fusion-border-light my-1 mx-2" />
            <FileMenuItem icon={Save} label="Save" shortcut="Ctrl+S" />
            <FileMenuItem icon={Save} label="Save As..." shortcut="Ctrl+Shift+S" />
            <div className="h-px bg-fusion-border-light my-1 mx-2" />
            <FileMenuItem icon={Download} label="Export..." shortcut="Ctrl+E" />
            <FileMenuItem icon={Printer} label="3D Print..." />
            <div className="h-px bg-fusion-border-light my-1 mx-2" />
            <FileMenuItem icon={Settings} label="Preferences..." />
          </div>
        )}
      </div>

      {/* ── Save button ── */}
      <AppBarButton icon={Save} label="Save (Ctrl+S)" onClick={() => {}} />

      {/* ── Separator ── */}
      <AppBarSep />

      {/* ── Undo / Redo ── */}
      <AppBarButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => api.undo()} />
      <AppBarButton icon={Redo2} label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => api.redo()} />

      <AppBarSep />

      {/* ── Document name (center) ── */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded hover:bg-fusion-header-hover cursor-pointer">
          <FileText size={13} className="text-fusion-text-secondary" />
          <span className="text-xs font-medium text-fusion-text truncate max-w-[280px]">{documentName}</span>
          <span className="text-[9px] text-fusion-text-disabled">v1</span>
        </div>
      </div>

      {/* ── Right side: extension, notifications, help, account ── */}

      {/* Job status / Extension indicator */}
      <div className="flex items-center gap-0.5 mr-1 px-2 py-0.5 rounded text-[10px] text-fusion-text-secondary">
        <div className="w-1.5 h-1.5 rounded-full bg-fusion-green" />
        <span>Online</span>
      </div>

      <AppBarSep />

      <AppBarButton icon={Search} label="Search Commands (S)" onClick={() => {}} />
      <AppBarButton icon={Bell} label="Notifications" onClick={() => {}} />
      <AppBarButton icon={HelpCircle} label="Help" onClick={() => {}} />

      <AppBarSep />

      {/* Account avatar */}
      <button className="flex items-center justify-center w-7 h-7 rounded-full bg-fusion-orange text-white text-xs font-bold hover:bg-fusion-orange-hover mx-1"
        title="Account"
      >
        <User size={14} />
      </button>
    </div>
  );
}

// ── Sub-components ──

function AppBarButton({
  icon: Icon, label, disabled = false, onClick,
}: {
  icon: React.ElementType; label: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        'p-1.5 rounded transition-colors',
        disabled
          ? 'text-fusion-text-disabled cursor-not-allowed'
          : 'text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-header-hover',
      )}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={15} />
    </button>
  );
}

function AppBarSep() {
  return <div className="w-px h-5 bg-fusion-border-light mx-1 flex-shrink-0" />;
}

function FileMenuItem({
  icon: Icon, label, shortcut, onClick, danger = false,
}: {
  icon: React.ElementType; label: string; shortcut?: string; onClick?: () => void; danger?: boolean;
}) {
  return (
    <button
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors',
        danger
          ? 'text-fusion-error hover:bg-fusion-error/10'
          : 'text-fusion-text hover:bg-fusion-hover',
      )}
      onClick={onClick}
    >
      <Icon size={13} className="text-fusion-text-secondary flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-fusion-text-disabled">{shortcut}</span>}
    </button>
  );
}
