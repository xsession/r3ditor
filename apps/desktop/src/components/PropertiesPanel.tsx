import { useEditorStore } from '../store/editorStore';
import { X } from 'lucide-react';
import clsx from 'clsx';

const tabList = ['properties', 'appearance', 'physical', 'notes'] as const;

/**
 * Fusion 360-style Inspector panel (right side).
 * Replaces Onshape's Properties/Context panel.
 */
export function PropertiesPanel() {
  const {
    entities, selectedIds, inspectorTab, setInspectorTab,
    inspectorOpen, toggleInspector, isSketchActive, sketchPoints, sketchSegments,
    sketchConstraints, sketchDimensions, sketchDof,
  } = useEditorStore();

  if (!inspectorOpen) return null;

  const selected = entities.filter((e) => selectedIds.includes(e.id));

  return (
    <div className="w-64 bg-fusion-panel border-l border-fusion-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-fusion-border bg-fusion-toolbar">
        <span className="text-xs font-medium text-fusion-text uppercase tracking-wide">Inspector</span>
        <button
          className="p-0.5 rounded hover:bg-fusion-surface text-fusion-text-secondary hover:text-fusion-text"
          onClick={toggleInspector}
        >
          <X size={12} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-fusion-border">
        {tabList.map((tab) => (
          <button
            key={tab}
            className={clsx(
              'flex-1 px-1 py-1.5 text-[10px] capitalize transition-colors',
              inspectorTab === tab
                ? 'text-fusion-blue border-b-2 border-fusion-blue bg-fusion-surface'
                : 'text-fusion-text-disabled hover:text-fusion-text-secondary hover:bg-fusion-surface',
            )}
            onClick={() => setInspectorTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {inspectorTab === 'properties' && (
          <>
            {/* Sketch info when active */}
            {isSketchActive && (
              <div className="space-y-2">
                <SectionHeader title="Active Sketch" />
                <PropRow label="Points" value={sketchPoints.length.toString()} />
                <PropRow label="Segments" value={sketchSegments.length.toString()} />
                <PropRow label="Constraints" value={sketchConstraints.length.toString()} />
                <PropRow label="Dimensions" value={sketchDimensions.length.toString()} />
                <PropRow label="DOF" value={sketchDof.toString()}
                  valueClass={sketchDof === 0 ? 'text-fusion-green' : 'text-fusion-orange'} />
              </div>
            )}

            {/* Selected entity properties */}
            {selected.length === 0 && !isSketchActive ? (
              <p className="text-fusion-text-disabled text-[10px] text-center py-6">
                Select an object to inspect
              </p>
            ) : (
              selected.map((entity) => (
                <div key={entity.id} className="space-y-2">
                  <SectionHeader title={entity.name} />
                  <PropRow label="Type" value={entity.type} />
                  <PropRow label="ID" value={entity.id.slice(0, 10) + '…'} />
                  <PropRow label="Faces" value={entity.faceCount.toString()} />
                  <PropRow label="Edges" value={entity.edgeCount.toString()} />
                  <PropRow label="Vertices" value={entity.vertexCount.toString()} />
                  <PropRow label="Visible" value={entity.visible ? 'Yes' : 'No'} />
                  <PropRow label="Suppressed" value={entity.suppressed ? 'Yes' : 'No'} />

                  <SectionHeader title="Transform" />
                  <PropRow label="Position"
                    value={entity.transform.position.map((v) => v.toFixed(1)).join(', ')} />
                  <PropRow label="Rotation"
                    value={entity.transform.rotation.map((v) => `${(v * 180 / Math.PI).toFixed(1)}°`).join(', ')} />
                  <PropRow label="Scale"
                    value={entity.transform.scale.map((v) => v.toFixed(2)).join(', ')} />
                </div>
              ))
            )}
          </>
        )}

        {inspectorTab === 'appearance' && (
          <div className="space-y-3">
            <SectionHeader title="Material" />
            <PropRow label="Color" value="#808080" />
            <PropRow label="Metallic" value="0.0" />
            <PropRow label="Roughness" value="0.5" />
            <div className="mt-2 grid grid-cols-6 gap-1">
              {['#808090', '#f87171', '#4ade80', '#60a5fa', '#fbbf24', '#a78bfa',
                '#f472b6', '#fb923c', '#22d3ee', '#a3e635', '#e2e8f0', '#1e1e2e',
              ].map((c) => (
                <button key={c} className="w-6 h-6 rounded border border-fusion-border-light hover:ring-2 ring-fusion-blue"
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        )}

        {inspectorTab === 'physical' && (
          <div className="space-y-3">
            <SectionHeader title="Physical Properties" />
            <PropRow label="Volume" value="—" />
            <PropRow label="Surface Area" value="—" />
            <PropRow label="Mass" value="—" />
            <PropRow label="Density" value="—" />
            <p className="text-fusion-text-disabled text-[10px] text-center py-3">
              Select a body to calculate physical properties
            </p>
          </div>
        )}

        {inspectorTab === 'notes' && (
          <div>
            <textarea
              className="w-full h-32 bg-fusion-surface border border-fusion-border-light rounded p-2 text-xs text-fusion-text outline-none resize-none focus:border-fusion-blue"
              placeholder="Add notes about this document…"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[10px] font-semibold text-fusion-text-disabled uppercase tracking-wider border-b border-fusion-border pb-1">
      {title}
    </h3>
  );
}

function PropRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center text-xs">
      <span className="w-20 text-fusion-text-disabled flex-shrink-0">{label}</span>
      <span className={clsx('text-fusion-text truncate font-mono text-[10px]', valueClass)}>{value}</span>
    </div>
  );
}
