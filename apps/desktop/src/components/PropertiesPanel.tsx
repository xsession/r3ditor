import { useEditorStore } from '../store/editorStore';

export function PropertiesPanel() {
  const { entities, selectedIds } = useEditorStore();
  const selected = entities.filter((e) => selectedIds.includes(e.id));

  return (
    <div className="w-72 bg-editor-surface border-l border-editor-border flex flex-col">
      <div className="px-3 py-2 border-b border-editor-border">
        <h2 className="text-sm font-semibold text-editor-text">Properties</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {selected.length === 0 ? (
          <p className="text-editor-muted text-xs text-center py-4">
            No selection
          </p>
        ) : (
          selected.map((entity) => (
            <div key={entity.id} className="space-y-2">
              <PropertyRow label="Name" value={entity.name} />
              <PropertyRow label="ID" value={entity.id.slice(0, 8) + '...'} />
              <PropertyRow label="Faces" value={entity.faceCount.toString()} />
              <PropertyRow label="Edges" value={entity.edgeCount.toString()} />
              <PropertyRow
                label="Vertices"
                value={entity.vertexCount.toString()}
              />
              <PropertyRow
                label="Visible"
                value={entity.visible ? 'Yes' : 'No'}
              />

              <div className="border-t border-editor-border pt-2 mt-2">
                <h3 className="text-xs font-semibold text-editor-muted uppercase mb-2">
                  Transform
                </h3>
                <PropertyRow label="Position" value="0, 0, 0" />
                <PropertyRow label="Rotation" value="0°, 0°, 0°" />
                <PropertyRow label="Scale" value="1, 1, 1" />
              </div>

              <div className="border-t border-editor-border pt-2 mt-2">
                <h3 className="text-xs font-semibold text-editor-muted uppercase mb-2">
                  Material
                </h3>
                <PropertyRow label="Color" value="#808080" />
                <PropertyRow label="Metallic" value="0.0" />
                <PropertyRow label="Roughness" value="0.5" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center text-xs">
      <span className="w-20 text-editor-muted flex-shrink-0">{label}</span>
      <span className="text-editor-text truncate">{value}</span>
    </div>
  );
}
