import {
  Undo2, Redo2, ChevronDown, Search, Save,
  Bell, HelpCircle, User, Menu, FileText,
  FilePlus, FolderOpen, Download, Printer, Settings,
  Cat,
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

  // ── File operations ──

  const handleSave = async () => {
    try {
      const s = useEditorStore.getState();
      const project = serializeProject();
      const json = projectToJSON(project);

      // In Tauri, use the dialog + fs plugins
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await save({
        defaultPath: `${s.documentName || 'Untitled'}.r3d.json`,
        filters: [{ name: 'r3ditor Project', extensions: ['r3d.json'] }],
      });

      if (filePath) {
        await writeTextFile(filePath, json);
        useEditorStore.setState({ statusMessage: `💾 Saved project → ${filePath}` });
      }
    } catch (err) {
      // Fallback: download via browser (for dev / non-Tauri)
      const project = serializeProject();
      const json = projectToJSON(project);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${useEditorStore.getState().documentName || 'project'}.r3d.json`;
      a.click();
      URL.revokeObjectURL(url);
      useEditorStore.setState({ statusMessage: '💾 Downloaded project file' });
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
        useEditorStore.setState({ statusMessage: `📂 Opened: ${project.document.name}` });
      }
    } catch (err) {
      // Fallback
      toggleDataPanel();
    }
  };

  const handleExportSTL = async () => {
    try {
      // Try backend export first (real mesh data)
      const { save } = await import('@tauri-apps/plugin-dialog');

      const filePath = await save({
        defaultPath: `${useEditorStore.getState().documentName || 'model'}.stl`,
        filters: [{ name: 'STL Mesh', extensions: ['stl'] }],
      });

      if (filePath) {
        try {
          const result = await api.exportAllStl(filePath);
          useEditorStore.setState({ statusMessage: `📤 ${result} → ${filePath}` });
        } catch {
          // Backend has no mesh → use Three.js scene export
          exportSceneFromViewport(filePath);
        }
      }
    } catch (err) {
      // Non-Tauri fallback: use Three.js scene exporter + download
      const scene = (window as any).__r3ditor_scene;
      if (scene) {
        const buffer = exportSceneToBinarySTL(scene);
        downloadSTL(buffer, `${useEditorStore.getState().documentName || 'model'}.stl`);
        useEditorStore.setState({ statusMessage: '📤 Downloaded STL (frontend geometry)' });
      } else {
        useEditorStore.setState({ statusMessage: '⚠️ No scene available for STL export' });
      }
    }
  };

  const exportSceneFromViewport = (filePath: string) => {
    const scene = (window as any).__r3ditor_scene;
    if (scene) {
      const buffer = exportSceneToBinarySTL(scene);
      // Write via Tauri fs
      import('@tauri-apps/plugin-fs').then(async ({ writeFile }) => {
        await writeFile(filePath, new Uint8Array(buffer));
        useEditorStore.setState({ statusMessage: `📤 Exported STL → ${filePath}` });
      }).catch(() => {
        downloadSTL(buffer, filePath.split(/[/\\]/).pop() || 'model.stl');
        useEditorStore.setState({ statusMessage: '📤 Downloaded STL' });
      });
    }
  };

  const handleBuildCallicat = () => {
    try {
      // Reset to clean state first
      useEditorStore.setState(useEditorStore.getInitialState());
      buildCallicat();
      setFileMenuOpen(false);
      useEditorStore.setState({
        statusMessage: `🐱 Callicat built! ${useEditorStore.getState().entities.length} entities, ${useEditorStore.getState().timeline.length} timeline entries`,
      });
    } catch (err) {
      useEditorStore.setState({ statusMessage: `❌ Callicat build error: ${err}` });
    }
  };

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
            <FileMenuItem icon={FilePlus} label="New Design" shortcut="Ctrl+N" onClick={() => { useEditorStore.setState(useEditorStore.getInitialState()); setFileMenuOpen(false); }} />
            <FileMenuItem icon={FolderOpen} label="Open..." shortcut="Ctrl+O" onClick={() => { handleOpen(); setFileMenuOpen(false); }} />
            <div className="h-px bg-fusion-border-light my-1 mx-2" />
            <FileMenuItem icon={Save} label="Save" shortcut="Ctrl+S" onClick={() => { handleSave(); setFileMenuOpen(false); }} />
            <FileMenuItem icon={Save} label="Save As..." shortcut="Ctrl+Shift+S" onClick={() => { handleSave(); setFileMenuOpen(false); }} />
            <div className="h-px bg-fusion-border-light my-1 mx-2" />
            <FileMenuItem icon={Download} label="Export STL..." shortcut="Ctrl+E" onClick={() => { handleExportSTL(); setFileMenuOpen(false); }} />
            <FileMenuItem icon={Printer} label="3D Print..." />
            <div className="h-px bg-fusion-border-light my-1 mx-2" />
            <FileMenuItem icon={Cat} label="Build Callicat 🐱" onClick={handleBuildCallicat} />
            <div className="h-px bg-fusion-border-light my-1 mx-2" />
            <FileMenuItem icon={Settings} label="Preferences..." />
          </div>
        )}
      </div>

      {/* ── Save button ── */}
      <AppBarButton icon={Save} label="Save (Ctrl+S)" onClick={handleSave} />

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
