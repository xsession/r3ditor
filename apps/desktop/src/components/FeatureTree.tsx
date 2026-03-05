import { Trash2 } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import * as api from '../api/tauri';
import clsx from 'clsx';

export function FeatureTree() {
  const { entities, selectedIds, select, removeEntity } = useEditorStore();

  const handleDelete = async (id: string) => {
    await api.deleteEntity(id);
    removeEntity(id);
  };

  return (
    <div className="w-60 bg-editor-surface border-r border-editor-border flex flex-col">
      <div className="px-3 py-2 border-b border-editor-border">
        <h2 className="text-sm font-semibold text-editor-text">Feature Tree</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {entities.length === 0 ? (
          <p className="text-editor-muted text-xs px-2 py-4 text-center">
            No objects. Create a box or cylinder to start.
          </p>
        ) : (
          entities.map((entity) => {
            const isSelected = selectedIds.includes(entity.id);
            return (
              <div
                key={entity.id}
                className={clsx(
                  'flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm',
                  isSelected
                    ? 'bg-editor-accent/20 text-editor-accent'
                    : 'text-editor-text hover:bg-editor-border/50'
                )}
                onClick={() => select(entity.id)}
              >
                <span className="flex-1 truncate">{entity.name}</span>
                <button
                  className="p-0.5 text-editor-muted hover:text-editor-error"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entity.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
