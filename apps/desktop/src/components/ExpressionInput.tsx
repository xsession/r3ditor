import { useState, useCallback, useRef, useEffect } from 'react';
import { evaluateExpression, isSimpleNumber, formatParameterValue } from '../engine/expressionEngine';
import type { VariableContext } from '../engine/expressionEngine';
import clsx from 'clsx';

/**
 * ExpressionInput — FreeCAD/Fusion 360-style formula-aware parameter field.
 *
 * Features:
 * - Accepts plain numbers or expressions (e.g. "10 * 2 + 5mm", "sqrt(d1^2 + 3)")
 * - Shows expression string while editing, resolved value when not
 * - Visual feedback: blue border for expressions, red for errors
 * - Inline tooltip showing resolved value while typing
 * - Supports variable context for cross-referencing parameters
 */
export function ExpressionInput({
  value,
  onChange,
  unit,
  label,
  variables = {},
  className,
}: {
  value: number;
  onChange: (val: number) => void;
  unit?: string;
  label?: string;
  variables?: VariableContext;
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [rawText, setRawText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync raw text when value changes externally
  useEffect(() => {
    if (!isEditing) {
      setRawText(formatParameterValue(value));
    }
  }, [value, isEditing]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    setRawText(formatParameterValue(value));
    setError(null);
    setPreviewValue(null);
    // Select all text on focus
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setRawText(text);

    if (!text.trim()) {
      setError(null);
      setPreviewValue(null);
      return;
    }

    const result = evaluateExpression(text, variables);
    if (result.error) {
      setError(result.error);
      setPreviewValue(null);
    } else {
      setError(null);
      setPreviewValue(result.value);
    }
  }, [variables]);

  const commitValue = useCallback(() => {
    setIsEditing(false);
    const text = rawText.trim();
    if (!text) return;

    // Fast path: plain number
    if (isSimpleNumber(text)) {
      onChange(parseFloat(text));
      setError(null);
      setPreviewValue(null);
      return;
    }

    // Expression evaluation
    const result = evaluateExpression(text, variables);
    if (result.value !== null) {
      onChange(result.value);
      setError(null);
      setPreviewValue(null);
    } else {
      // Revert on error
      setRawText(formatParameterValue(value));
      setError(null);
    }
  }, [rawText, variables, onChange, value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue();
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setRawText(formatParameterValue(value));
      setError(null);
      setPreviewValue(null);
      setIsEditing(false);
      inputRef.current?.blur();
    }
    // Stop propagation to prevent global shortcuts from firing
    e.stopPropagation();
  }, [commitValue, value]);

  const isExpression = isEditing && rawText.trim() && !isSimpleNumber(rawText.trim());

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {label && (
        <label className="text-xs text-fusion-text-secondary w-24 flex-shrink-0">{label}</label>
      )}
      <div className="relative flex-1">
        <div
          className={clsx(
            'flex items-center bg-fusion-panel border rounded px-2 py-1 transition-colors',
            error ? 'border-red-500' : isExpression ? 'border-fusion-blue' : 'border-fusion-border-light',
            'focus-within:border-fusion-blue',
          )}
        >
          {/* Expression icon indicator */}
          {isExpression && !error && (
            <span className="text-fusion-blue text-[10px] mr-1 font-mono">ƒ</span>
          )}
          <input
            ref={inputRef}
            type="text"
            className="bg-transparent text-xs text-fusion-text w-full outline-none font-mono"
            value={isEditing ? rawText : formatParameterValue(value)}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={commitValue}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          {unit && <span className="text-[10px] text-fusion-text-disabled ml-1">{unit}</span>}
        </div>

        {/* Live preview tooltip */}
        {isEditing && isExpression && previewValue !== null && !error && (
          <div className="absolute top-full left-0 mt-1 px-2 py-0.5 bg-fusion-surface border border-fusion-blue/30 rounded text-[10px] text-fusion-blue font-mono z-50 shadow-lg whitespace-nowrap">
            = {formatParameterValue(previewValue)}{unit ? ` ${unit}` : ''}
          </div>
        )}

        {/* Error tooltip */}
        {isEditing && error && (
          <div className="absolute top-full left-0 mt-1 px-2 py-0.5 bg-red-900/90 border border-red-500/30 rounded text-[10px] text-red-300 z-50 shadow-lg whitespace-nowrap max-w-[200px] truncate">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
