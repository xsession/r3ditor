import { useState, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Settings, Plus, Copy, Trash2, X, Check } from 'lucide-react';
import clsx from 'clsx';

/**
 * ConfigurationManager — Onshape-style configurations / variants.
 *
 * One part design, multiple variant configurations that override parameter values.
 * E.g., "M6 Bolt" config: diameter=6, length=20
 *       "M8 Bolt" config: diameter=8, length=30
 */

export interface ConfigurationParam {
  name: string;
  type: 'number' | 'boolean' | 'string';
  defaultValue: number | boolean | string;
}

export interface ConfigurationVariant {
  id: string;
  name: string;
  /** Parameter name → overridden value */
  overrides: Record<string, number | boolean | string>;
  isDefault: boolean;
}

export interface ConfigurationState {
  params: ConfigurationParam[];
  variants: ConfigurationVariant[];
  activeVariantId: string | null;
}

const INITIAL_STATE: ConfigurationState = {
  params: [
    { name: 'Width', type: 'number', defaultValue: 20 },
    { name: 'Height', type: 'number', defaultValue: 10 },
    { name: 'Depth', type: 'number', defaultValue: 5 },
  ],
  variants: [
    { id: 'default', name: 'Default', overrides: {}, isDefault: true },
    { id: 'large', name: 'Large', overrides: { Width: 40, Height: 20, Depth: 10 }, isDefault: false },
    { id: 'small', name: 'Small', overrides: { Width: 10, Height: 5, Depth: 2.5 }, isDefault: false },
  ],
  activeVariantId: 'default',
};

export function ConfigurationManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ConfigurationState>(INITIAL_STATE);
  const [, setEditingVariant] = useState<string | null>(null);
  const setStatusMessage = useEditorStore((s) => s.setStatusMessage);

  const activeVariant = config.variants.find((v) => v.id === config.activeVariantId) ?? config.variants[0];

  const getEffectiveValue = useCallback((paramName: string) => {
    if (activeVariant && activeVariant.overrides[paramName] !== undefined) {
      return activeVariant.overrides[paramName];
    }
    const param = config.params.find((p) => p.name === paramName);
    return param?.defaultValue ?? 0;
  }, [activeVariant, config.params]);

  const addVariant = useCallback(() => {
    const id = `variant_${Date.now()}`;
    const name = `Variant ${config.variants.length}`;
    setConfig((prev) => ({
      ...prev,
      variants: [...prev.variants, { id, name, overrides: {}, isDefault: false }],
    }));
    setEditingVariant(id);
  }, [config.variants.length]);

  const duplicateVariant = useCallback((sourceId: string) => {
    const source = config.variants.find((v) => v.id === sourceId);
    if (!source) return;
    const id = `variant_${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      variants: [...prev.variants, {
        id,
        name: `${source.name} (Copy)`,
        overrides: { ...source.overrides },
        isDefault: false,
      }],
    }));
  }, [config.variants]);

  const removeVariant = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      variants: prev.variants.filter((v) => v.id !== id),
      activeVariantId: prev.activeVariantId === id ? 'default' : prev.activeVariantId,
    }));
  }, []);

  const activateVariant = useCallback((id: string) => {
    setConfig((prev) => ({ ...prev, activeVariantId: id }));
    const variant = config.variants.find((v) => v.id === id);
    setStatusMessage(`Configuration: ${variant?.name ?? id}`);
  }, [config.variants, setStatusMessage]);

  const updateOverride = useCallback((variantId: string, paramName: string, value: number | boolean | string) => {
    setConfig((prev) => ({
      ...prev,
      variants: prev.variants.map((v) =>
        v.id === variantId
          ? { ...v, overrides: { ...v.overrides, [paramName]: value } }
          : v
      ),
    }));
  }, []);

  const renameVariant = useCallback((id: string, name: string) => {
    setConfig((prev) => ({
      ...prev,
      variants: prev.variants.map((v) => v.id === id ? { ...v, name } : v),
    }));
  }, []);

  if (!isOpen) {
    return (
      <button
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-fusion-text-secondary hover:text-fusion-text hover:bg-fusion-hover rounded transition-colors"
        onClick={() => setIsOpen(true)}
        title="Configurations"
      >
        <Settings size={11} />
        <span>Configs</span>
      </button>
    );
  }

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[520px] bg-fusion-surface border border-fusion-border-light rounded shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-fusion-panel border-b border-fusion-border-light">
        <div className="flex items-center gap-1.5">
          <Settings size={13} className="text-fusion-blue" />
          <span className="text-xs font-medium text-fusion-text">Configuration Manager</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-fusion-blue hover:bg-fusion-blue/10 rounded transition-colors"
            onClick={addVariant}
          >
            <Plus size={10} />
            Add Variant
          </button>
          <button
            className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-text transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Configuration Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-fusion-panel">
              <th className="text-left px-3 py-1.5 text-[9px] text-fusion-text-disabled uppercase tracking-wider w-28 border-r border-fusion-border-light">
                Parameter
              </th>
              {config.variants.map((variant) => (
                <th
                  key={variant.id}
                  className={clsx(
                    'text-left px-3 py-1.5 text-[9px] uppercase tracking-wider border-r border-fusion-border-light min-w-[100px]',
                    config.activeVariantId === variant.id
                      ? 'text-fusion-blue bg-fusion-blue/5'
                      : 'text-fusion-text-disabled',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <input
                      className="bg-transparent outline-none w-full text-[9px] uppercase tracking-wider font-semibold"
                      value={variant.name}
                      onChange={(e) => renameVariant(variant.id, e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                      {config.activeVariantId !== variant.id && (
                        <button
                          className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-blue"
                          onClick={() => activateVariant(variant.id)}
                          title="Activate"
                        >
                          <Check size={9} />
                        </button>
                      )}
                      <button
                        className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-fusion-text"
                        onClick={() => duplicateVariant(variant.id)}
                        title="Duplicate"
                      >
                        <Copy size={9} />
                      </button>
                      {!variant.isDefault && (
                        <button
                          className="p-0.5 rounded hover:bg-fusion-hover text-fusion-text-disabled hover:text-red-400"
                          onClick={() => removeVariant(variant.id)}
                          title="Remove"
                        >
                          <Trash2 size={9} />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.params.map((param) => (
              <tr key={param.name} className="border-t border-fusion-border-light hover:bg-fusion-hover/50">
                <td className="px-3 py-1.5 text-fusion-text-secondary border-r border-fusion-border-light font-medium">
                  {param.name}
                </td>
                {config.variants.map((variant) => {
                  const val = variant.overrides[param.name] ?? param.defaultValue;
                  const isOverridden = variant.overrides[param.name] !== undefined;
                  return (
                    <td
                      key={variant.id}
                      className={clsx(
                        'px-3 py-1.5 border-r border-fusion-border-light',
                        config.activeVariantId === variant.id && 'bg-fusion-blue/5',
                      )}
                    >
                      {param.type === 'number' ? (
                        <input
                          type="number"
                          className={clsx(
                            'w-full bg-transparent outline-none text-xs font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                            isOverridden ? 'text-fusion-blue' : 'text-fusion-text',
                          )}
                          value={val as number}
                          onChange={(e) => updateOverride(variant.id, param.name, parseFloat(e.target.value) || 0)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      ) : param.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={val as boolean}
                          onChange={(e) => updateOverride(variant.id, param.name, e.target.checked)}
                          className="accent-fusion-blue"
                        />
                      ) : (
                        <input
                          type="text"
                          className="w-full bg-transparent outline-none text-xs text-fusion-text"
                          value={val as string}
                          onChange={(e) => updateOverride(variant.id, param.name, e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Active config indicator */}
      <div className="px-3 py-2 border-t border-fusion-border-light bg-fusion-panel text-[10px] text-fusion-text-disabled">
        Active: <span className="text-fusion-blue font-medium">{activeVariant?.name}</span>
        {' • '}
        {config.params.map((p) => `${p.name}=${getEffectiveValue(p.name)}`).join(', ')}
      </div>
    </div>
  );
}
