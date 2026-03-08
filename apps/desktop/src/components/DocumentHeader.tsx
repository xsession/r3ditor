import {
  Undo2, Redo2, ChevronDown, Search, Save,
  Bell, HelpCircle, User, Menu, FileText,
  FilePlus, FolderOpen, Download, Printer, Settings,
  Cat, PanelLeftOpen, PanelLeftClose, Cloud, Wifi,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import * as api from '../api/tauri';
import { buildCallicat } from '../utils/callicatBuilder';
import {
  serializeProject,
  projectToJSON,
  projectFromJSON,
  loadProjectIntoStore,
} from '../store/modelSerializer';
import { exportSceneToBinarySTL, downloadSTL } from '../utils/stlExporter';
import clsx from 'clsx';
import { useState, useRef, useEffect } from 'react';

/**
 * Fusion 360 Application Bar — exact clone.
 *
 * Layout (left → right):
 *   [☰ Data Panel] [File ▾] [Save] │ [Undo] [Redo] │ ── Document Name (v1) ── │ [Cloud] [Online] │ [🔍] [🔔] [❓] │ [👤]
 */
export function DocumentHeader() {
  const { documentName, canUndo, canRedo, browserOpen, toggleDataPanel } = useEditorStore();
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleSave = async () => {
    try {
      const s = useEditorStore.getState();
      const project = serializeProject();
      const json = projectToJSON(project);
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const filePath = await save({
        defaultPath: `${s.documentName || 'Untitled'}.r3d.json`,
        filters: [{ name: 'r3ditor Project', extensions: ['r3d.json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, json);
        useEditorStore.setState({ statusMessage: `Saved → ${filePath}` });
      }
    } catch {
      const project = serializeProject();
      const json = projectToJSON(project);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${useEditorStore.getState().documentName || 'project'}.r3d.json`;
      a.click();
      URL.revokeObjectURL(url);
      useEditorStore.setState({ statusMessage: 'Downloaded project file' });
    }
  };

  const handleOpen = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const filePath = await open({
        filters: [{ name: 'r3ditor Project', extensions: ['r3d.json', 'json'] }],
        multiple: false,
      });
      if (filePath) {
        const content = await readTextFile(filePath as string);
        const project = projectFromJSON(content);
        loadProjectIntoStore(project);
        useEditorStore.setState({ statusMessage: `Opened: ${project.document.name}` });
      }
    } catch {
      toggleDataPanel();
    }
  };

  const handleExportSTL = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({
        defaultPath: `${useEditorStore.getState().documentName || 'model'}.stl`,
        filters: [{ name: 'STL Mesh', extensions: ['stl'] }],
      });
      if (filePath) {
        try {
          const result = await api.exportAllStl(filePath);
          useEditorStore.setState({ statusMessage: `${result} → ${filePath}` });
        } catch {
          const scene = (window as any).__r3ditor_scene;
          if (scene) {
            const buffer = exportSceneToBinarySTL(scene);
            import('@tauri-apps/plugin-fs').then(async ({ writeFile }) => {
              await writeFile(filePath, new Uint8Array(buffer));
              useEditorStore.setState({ statusMessage: `Exported STL → ${filePath}` });
            }).catch(() => {
              downloadSTL(buffer, filePath.split(/[/\\]/).pop() || 'model.stl');
            });
          }
        }
      }
    } catch {
      const scene = (window as any).__r3ditor_scene;
      if (scene) {
        const buffer = exportSceneToBinarySTL(scene);
        downloadSTL(buffer, `${useEditorStore.getState().documentName || 'model'}.stl`);
        useEditorStore.setState({ statusMessage: 'Downloaded STL' });
      }
    }
  };

  const handleBuildCallicat = () => {
    try {
      useEditorStore.setState(useEditorStore.getInitialState());
      buildCallicat();
      setFileMenuOpen(false);
      useEditorStore.setState({
        statusMessage: `Callicat built! ${useEditorStore.getState().entities.length} entities`,
      });
    } catch (err) {
      useEditorStore.setState({ statusMessage: `Error: ${err}` });
    }
  };

  return (
    <header className="flex items-center h-[34px] bg-fusion-header border-b border-fusion-border select-none shrink-0" data-tauri-drag-region>
      {/* Data Panel toggle */}
      <button
        className={clsx(
          'flex items-center justify-center w-[38px] h-full transition-colors',
          browserOpen ? 'bg-fusion-surface-hover text-fusion-text-bright' : 'text-fusion-text-secondary hover:bg-fusion-header-hover hover:text-fusion-text',
        )}
        onClick={toggleDataPanel}
        title="Toggle Data Panel"
      >
        {browserOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </button>

      <HeaderSep />

      {/* File menu */}
      <div className="relative" ref={menuRef}>
        <button
          className={clsx(
            'flex items-center gap-1 px-2.5 h-[26px] rounded-fusion text-[11px] transition-colors',
            fileMenuOpen ? 'bg-fusion-surface-hover text-fusion-text-bright' : 'text-fusion-text-secondary hover:bg-fusion-header-hover hover:text-fusion-text',
          )}
          onClick={() => setFileMenuOpen(!fileMenuOpen)}
        >
          <Menu size={14} />
          <span className="font-medium">File</span>
          <ChevronDown size={9} className="text-fusion-text-disabled ml-0.5" />
        </button>

        {fileMenuOpen && (
          <div className="absolute top-full left-0 mt-1 w-60 bg-fusion-surface border border-fusion-border-light rounded-fusion-lg shadow-fusion-dropdown z-[200] py-1 animate-fusion-fade-in">
            <FileMenuItem icon={FilePlus} label="New Design" shortcut="Ctrl+N" onClick={() => { useEditorStore.setState(useEditorStore.getInitialState()); setFileMenuOpen(false); }} />
            <FileMenuItem icon={FolderOpen} label="Open…" shortcut="Ctrl+O" onClick={() => { handleOpen(); setFileMenuOpen(false); }} />
            <MenuDivider />
            <FileMenuItem icon={Save} label="Save" shortcut="Ctrl+S" onClick={() => { handleSave(); setFileMenuOpen(false); }} />
            <FileMenuItem icon={Save} label="Save As…" shortcut="Ctrl+Shift+S" onClick={() => { handleSave(); setFileMenuOpen(false); }} />
            <MenuDivider />
            <FileMenuItem icon={Download} label="Export STL…" shortcut="Ctrl+E" onClick={() => { handleExportSTL(); setFileMenuOpen(false); }} />
            <FileMenuItem icon={Printer} label="3D Print…" />
            <MenuDivider />
            <FileMenuItem icon={Cat} label="Build Callicat 🐱" onClick={handleBuildCallicat} />
            <MenuDivider />
            <FileMenuItem icon={Settings} label="Preferences…" shortcut="Ctrl+," />
          </div>
        )}
      </div>

      <HeaderIconBtn icon={Save} label="Save (Ctrl+S)" onClick={handleSave} />
      <HeaderSep />
      <HeaderIconBtn icon={Undo2} label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => api.undo()} />
      <HeaderIconBtn icon={Redo2} label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => api.redo()} />
      <HeaderSep />

      {/* Center: Document name */}
      <div className="flex-1 flex items-center justify-center min-w-0" data-tauri-drag-region>
        <button className="flex items-center gap-1.5 px-3 py-1 rounded-fusion hover:bg-fusion-header-hover transition-colors max-w-[360px]">
          <FileText size={12} className="text-fusion-text-secondary shrink-0" />
          <span className="text-[11px] font-medium text-fusion-text truncate">{documentName}</span>
          <span className="text-[9px] text-fusion-text-disabled shrink-0 ml-0.5">v1</span>
          <ChevronDown size={9} className="text-fusion-text-disabled shrink-0" />
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-fusion-text-secondary">
        <Cloud size={11} className="text-fusion-green" />
        <span>Saved</span>
      </div>
      <HeaderSep />
      <div className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-fusion-text-secondary">
        <Wifi size={10} className="text-fusion-green" />
        <span>Online</span>
      </div>
      <HeaderSep />
      <HeaderIconBtn icon={Search} label="Search (Ctrl+/)" onClick={() => {}} />
      <div className="relative">
        <HeaderIconBtn icon={Bell} label="Notifications" onClick={() => {}} />
        <div className="absolute top-0.5 right-0.5 w-[6px] h-[6px] rounded-full bg-fusion-orange" />
      </div>
      <HeaderIconBtn icon={HelpCircle} label="Help" onClick={() => {}} />
      <HeaderSep />

      {/* Account avatar */}
      <button
        className="flex items-center justify-center w-[26px] h-[26px] rounded-full bg-gradient-to-br from-fusion-orange to-fusion-orange-dim text-white text-[10px] font-bold hover:from-fusion-orange-hover hover:to-fusion-orange mx-1.5 transition-all shadow-sm"
        title="Account"
      >
        <User size={13} />
      </button>
    </header>
  );
}

// ── Sub-components ──

function HeaderIconBtn({ icon: Icon, label, disabled = false, onClick }: {
  icon: React.ElementType; label: string; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button
      className={clsx(
        'flex items-center justify-center w-[28px] h-[26px] rounded-fusion transition-colors',
        disabled ? 'text-fusion-text-disabled cursor-not-allowed' : 'text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-header-hover',
      )}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} />
    </button>
  );
}

function HeaderSep() {
  return <div className="w-px h-[18px] bg-fusion-border-light mx-0.5 shrink-0" />;
}

function MenuDivider() {
  return <div className="h-px bg-fusion-border-light my-1 mx-3" />;
}

function FileMenuItem({ icon: Icon, label, shortcut, onClick, danger = false }: {
  icon: React.ElementType; label: string; shortcut?: string; onClick?: () => void; danger?: boolean;
}) {
  return (
    <button
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-[6px] text-[11px] transition-colors',
        danger ? 'text-fusion-error hover:bg-fusion-error/10' : 'text-fusion-text hover:bg-fusion-hover-strong',
      )}
      onClick={onClick}
    >
      <Icon size={14} className="text-fusion-text-secondary shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-fusion-text-disabled ml-4">{shortcut}</span>}
    </button>
  );
}
