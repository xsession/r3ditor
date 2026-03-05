import { X, Check, ChevronDown } from 'lucide-react';
import { useEditorStore, type FeatureTool } from '../store/editorStore';

/**
 * Fusion 360-style feature parameter dialog.
 * Appears as a floating panel with a blue header bar, parameter rows, and OK/Cancel buttons.
 */
export function FeatureDialog() {
  const { featureDialog, closeFeatureDialog, updateFeatureDialogParam } = useEditorStore();

  if (!featureDialog.open || !featureDialog.featureType) return null;

  const featureType = featureDialog.featureType;
  const params = featureDialog.params;

  const featureLabel = featureType.replace(/([A-Z])/g, ' $1').trim();

  return (
    <div className="absolute top-12 right-4 w-72 bg-fusion-surface border border-fusion-border-light rounded shadow-2xl z-50 select-none overflow-hidden">
      {/* Header — Fusion 360 blue header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-fusion-blue">
        <span className="text-sm font-medium text-white capitalize">
          {featureLabel}
        </span>
        <button
          className="p-0.5 rounded hover:bg-white/20 text-white/80 hover:text-white"
          onClick={closeFeatureDialog}
        >
          <X size={14} />
        </button>
      </div>

      {/* Parameters */}
      <div className="p-3 space-y-3">
        {renderParams(featureType, params, updateFeatureDialogParam)}
      </div>

      {/* Actions — Fusion 360 OK (green check) / Cancel (X) */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-fusion-border-light bg-fusion-panel">
        <button
          className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium rounded bg-fusion-green hover:bg-fusion-green-hover text-white transition-colors"
          onClick={() => {
            const store = useEditorStore.getState();
            // Add to first component's children if possible
            const id = `${featureType}_${Date.now()}`;
            // Add to timeline
            store.setTimeline([...store.timeline, {
              id,
              name: featureLabel,
              type: featureType,
              suppressed: false,
              hasError: false,
            }]);
            store.setStatusMessage(`Created ${featureLabel}`);
            closeFeatureDialog();
          }}
        >
          <Check size={12} />
          OK
        </button>
        <button
          className="px-4 py-1.5 text-xs rounded bg-fusion-surface hover:bg-fusion-surface-hover text-fusion-text-secondary border border-fusion-border-light transition-colors"
          onClick={closeFeatureDialog}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Render parameter controls based on feature type ──
function renderParams(
  featureType: FeatureTool,
  params: Record<string, unknown>,
  update: (key: string, value: unknown) => void,
) {
  switch (featureType) {
    case 'extrude':
      return (
        <>
          <ParamNumber label="Distance" paramKey="distance" value={params.distance as number} update={update} unit="mm" />
          <ParamSelect label="Direction" paramKey="direction" value={params.direction as string} update={update}
            options={['one_side', 'two_sides', 'symmetric', 'all']} />
          <ParamSelect label="Operation" paramKey="operation" value={params.operation as string} update={update}
            options={['new_body', 'join', 'cut', 'intersect']} />
          <ParamNumber label="Taper Angle" paramKey="taper" value={params.taper as number} update={update} unit="°" />
        </>
      );
    case 'revolve':
      return (
        <>
          <ParamNumber label="Angle" paramKey="angle" value={params.angle as number} update={update} unit="°" />
          <ParamSelect label="Direction" paramKey="direction" value={params.direction as string} update={update}
            options={['full', 'one_side', 'two_sides', 'symmetric']} />
          <ParamSelect label="Operation" paramKey="operation" value={params.operation as string} update={update}
            options={['new_body', 'join', 'cut', 'intersect']} />
        </>
      );
    case 'fillet':
      return <ParamNumber label="Radius" paramKey="radius" value={params.radius as number} update={update} unit="mm" />;
    case 'chamfer':
      return (
        <>
          <ParamSelect label="Chamfer Type" paramKey="chamferType" value={params.chamferType as string} update={update}
            options={['equal_distance', 'two_distances', 'distance_angle']} />
          <ParamNumber label="Distance" paramKey="distance" value={params.distance as number} update={update} unit="mm" />
          <ParamNumber label="Angle" paramKey="angle" value={params.angle as number} update={update} unit="°" />
        </>
      );
    case 'shell':
      return (
        <>
          <ParamNumber label="Thickness" paramKey="thickness" value={params.thickness as number} update={update} unit="mm" />
          <ParamSelect label="Direction" paramKey="direction" value={params.direction as string} update={update}
            options={['inside', 'outside', 'both']} />
        </>
      );
    case 'hole':
      return (
        <>
          <ParamSelect label="Hole Type" paramKey="holeType" value={params.holeType as string} update={update}
            options={['simple', 'counterbore', 'countersink', 'tapped']} />
          <ParamNumber label="Diameter" paramKey="diameter" value={params.diameter as number} update={update} unit="mm" />
          <ParamNumber label="Depth" paramKey="depth" value={params.depth as number} update={update} unit="mm" />
        </>
      );
    case 'boolean':
      return (
        <ParamSelect label="Operation" paramKey="operation" value={params.operation as string} update={update}
          options={['combine', 'cut', 'intersect']} />
      );
    case 'linearPattern':
      return (
        <>
          <ParamNumber label="Quantity" paramKey="count" value={params.count as number} update={update} />
          <ParamNumber label="Distance" paramKey="spacing" value={params.spacing as number} update={update} unit="mm" />
          <ParamSelect label="Direction" paramKey="direction" value={params.direction as string} update={update}
            options={['x', 'y', 'z']} />
        </>
      );
    case 'circularPattern':
      return (
        <>
          <ParamNumber label="Quantity" paramKey="count" value={params.count as number} update={update} />
          <ParamNumber label="Total Angle" paramKey="angle" value={params.angle as number} update={update} unit="°" />
          <ParamSelect label="Axis" paramKey="axis" value={params.axis as string} update={update}
            options={['x', 'y', 'z']} />
        </>
      );
    case 'thread':
      return (
        <>
          <ParamSelect label="Thread Type" paramKey="threadType" value={params.threadType as string} update={update}
            options={['ISO Metric', 'ISO Metric Trapezoidal', 'ANSI Unified']} />
          <ParamSelect label="Size" paramKey="size" value={params.size as string} update={update}
            options={['M3x0.5', 'M4x0.7', 'M5x0.8', 'M6x1', 'M8x1.25', 'M10x1.5']} />
          <ParamCheckbox label="Full Length" paramKey="fullLength" value={params.fullLength as boolean} update={update} />
        </>
      );
    default:
      return <p className="text-xs text-fusion-text-secondary">No parameters for this feature.</p>;
  }
}

// ── Parameter input components (Fusion 360 style) ──

function ParamNumber({
  label, paramKey, value, update, unit,
}: {
  label: string; paramKey: string; value: number; update: (k: string, v: unknown) => void; unit?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-fusion-text-secondary w-24 flex-shrink-0">{label}</label>
      <div className="flex items-center flex-1 bg-fusion-panel border border-fusion-border-light rounded px-2 py-1 focus-within:border-fusion-blue">
        <input
          type="number"
          className="bg-transparent text-xs text-fusion-text w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={value ?? 0}
          onChange={(e) => update(paramKey, parseFloat(e.target.value) || 0)}
        />
        {unit && <span className="text-[10px] text-fusion-text-disabled ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function ParamSelect({
  label, paramKey, value, update, options,
}: {
  label: string; paramKey: string; value: string; update: (k: string, v: unknown) => void; options: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-fusion-text-secondary w-24 flex-shrink-0">{label}</label>
      <div className="relative flex-1">
        <select
          className="w-full bg-fusion-panel border border-fusion-border-light rounded px-2 py-1 text-xs text-fusion-text outline-none appearance-none pr-6 cursor-pointer focus:border-fusion-blue"
          value={value ?? options[0]}
          onChange={(e) => update(paramKey, e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-fusion-text-disabled pointer-events-none" />
      </div>
    </div>
  );
}

function ParamCheckbox({
  label, paramKey, value, update,
}: {
  label: string; paramKey: string; value: boolean; update: (k: string, v: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-fusion-text-secondary w-24 flex-shrink-0">{label}</label>
      <input
        type="checkbox"
        className="w-3.5 h-3.5 rounded border-fusion-border-light bg-fusion-panel accent-fusion-blue"
        checked={value ?? false}
        onChange={(e) => update(paramKey, e.target.checked)}
      />
    </div>
  );
}
