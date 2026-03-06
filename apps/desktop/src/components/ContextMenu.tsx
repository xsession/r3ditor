import { useEffect, useRef } from 'react';
import {
  Eye, EyeOff, Pencil, Trash2, Copy, MinusCircle,
  ClipboardPaste, Maximize2, Info,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import * as api from '../api/tauri';
import clsx from 'clsx';

/**
 * Fusion 360-style context menu (right-click).
 * Shows: Edit Feature / Delete / Suppress / Toggle Visibility / Properties / Copy / Paste.
 */
export function ContextMenu() {
  const { markingMenu, closeMarkingMenu, selectedIds, entities } = useEditorStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!markingMenu.open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeMarkingMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [markingMenu.open, closeMarkingMenu]);

  if (!markingMenu.open) return null;

  const hasSelection = selectedIds.length > 0;
  const selectedEntity = hasSelection ? entities.find((e) => e.id === selectedIds[0]) : null;
  const hasClipboard = ((useEditorStore.getState() as any).clipboard?.length ?? 0) > 0;

  const handleDelete = async () => {
    const store = useEditorStore.getState();
    for (const id of store.selectedIds) {
      try { await api.deleteEntity(id); } catch { /* ok */ }
      store.removeEntity(id);
    }
    store.clearSelection();
    store.setStatusMessage('Deleted selection');
    closeMarkingMenu();
  };

  const handleSuppress = () => {
    const store = useEditorStore.getState();
    for (const id of store.selectedIds) {
      store.toggleEntitySuppressed(id);
    }
    store.setStatusMessage('Toggled suppress');
    closeMarkingMenu();
  };

  const handleVisibility = () => {
    const store = useEditorStore.getState();
    for (const id of store.selectedIds) {
      store.toggleEntityVisibility(id);
    }
    store.setStatusMessage('Toggled visibility');
    closeMarkingMenu();
  };

  const handleCopy = () => {
    const store = useEditorStore.getState();
    useEditorStore.setState({ clipboard: store.selectedIds.slice() });
    store.setStatusMessage(`Copied ${store.selectedIds.length} item(s)`);
    closeMarkingMenu();
  };

  const handlePaste = () => {
    const store = useEditorStore.getState();
    const clipboard = (store as any).clipboard as string[] | undefined;
    if (clipboard && clipboard.length > 0) {
      const newEntities = clipboard
        .map((id: string) => store.entities.find((e) => e.id === id))
        .filter(Boolean)
        .map((e: any) => ({
          ...e,
          id: `${e.id}_copy_${Date.now()}`,
          name: `${e.name} (Copy)`,
          transform: {
            ...e.transform,
            position: [
              e.transform.position[0] + 15,
              e.transform.position[1],
              e.transform.position[2],
            ] as [number, number, number],
          },
        }));
      for (const ne of newEntities) {
        store.addEntity(ne);
      }
      store.setStatusMessage(`Pasted ${newEntities.length} item(s)`);
    }
    closeMarkingMenu();
  };

  const handleEditFeature = () => {
    if (selectedEntity) {
      const store = useEditorStore.getState();
      // Find timeline entry matching selected entity
      const entry = store.timeline.find((t) => t.id === selectedEntity.id);
      if (entry && entry.type !== 'sketch' && entry.type !== 'component' && entry.type !== 'joint') {
        store.openFeatureDialog(entry.type as any);
        useEditorStore.setState({
          featureDialog: {
            ...store.featureDialog,
            open: true,
            editing: true,
            editingFeatureId: entry.id,
          },
        });
      }
    }
    closeMarkingMenu();
  };

  const handleInspect = () => {
    const store = useEditorStore.getState();
    if (!store.inspectorOpen) store.toggleInspector();
    store.setInspectorTab('properties');
    closeMarkingMenu();
  };

  // Position the menu near the cursor but keep on screen
  const style: React.CSSProperties = {
    left: Math.min(markingMenu.x, window.innerWidth - 200),
    top: Math.min(markingMenu.y, window.innerHeight - 300),
  };

  return (
    <>
      <div className="fixed inset-0 z-[250]" onClick={closeMarkingMenu} onContextMenu={(e) => { e.preventDefault(); closeMarkingMenu(); }} />
      <div
        ref={ref}
        className="fixed z-[251] bg-fusion-surface border border-fusion-border-light rounded shadow-xl py-1 min-w-[180px]"
        style={style}
      >
        {hasSelection && (
          <>
            <CtxItem icon={Pencil} label="Edit Feature" onClick={handleEditFeature} />
            <CtxItem
              icon={selectedEntity?.visible ? EyeOff : Eye}
              label={selectedEntity?.visible ? 'Hide' : 'Show'}
              onClick={handleVisibility}
            />
            <CtxItem icon={MinusCircle} label="Suppress" onClick={handleSuppress} />
            <CtxSep />
            <CtxItem icon={Copy} label="Copy" shortcut="Ctrl+C" onClick={handleCopy} />
          </>
        )}
        <CtxItem
          icon={ClipboardPaste}
          label="Paste"
          shortcut="Ctrl+V"
          disabled={!hasClipboard}
          onClick={handlePaste}
        />
        {hasSelection && (
          <>
            <CtxSep />
            <CtxItem icon={Info} label="Properties" shortcut="I" onClick={handleInspect} />
            <CtxItem icon={Maximize2} label="Zoom to Selection" onClick={() => {
              useEditorStore.setState({ viewCommand: 'zoomFit' });
              closeMarkingMenu();
            }} />
            <CtxSep />
            <CtxItem icon={Trash2} label="Delete" shortcut="Del" danger onClick={handleDelete} />
          </>
        )}
      </div>
    </>
  );
}

function CtxItem({
  icon: Icon, label, shortcut, danger = false, disabled = false, onClick,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors',
        disabled
          ? 'text-fusion-text-disabled cursor-not-allowed'
          : danger
            ? 'text-fusion-error hover:bg-fusion-error/10'
            : 'text-fusion-text hover:bg-fusion-hover',
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={12} className="flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-fusion-text-disabled">{shortcut}</span>}
    </button>
  );
}

function CtxSep() {
  return <div className="h-px bg-fusion-border-light my-1 mx-2" />;
}
