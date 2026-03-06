import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  isSimpleNumber,
  formatParameterValue,
  extractVariableNames,
} from '../../engine/expressionEngine';

describe('Expression Engine', () => {
  describe('evaluateExpression', () => {
    // ── Basic arithmetic ──
    it('evaluates simple addition', () => {
      expect(evaluateExpression('2 + 3')).toEqual({ value: 5, error: null });
    });

    it('evaluates subtraction', () => {
      expect(evaluateExpression('10 - 4')).toEqual({ value: 6, error: null });
    });

    it('evaluates multiplication', () => {
      expect(evaluateExpression('3 * 7')).toEqual({ value: 21, error: null });
    });

    it('evaluates division', () => {
      expect(evaluateExpression('20 / 4')).toEqual({ value: 5, error: null });
    });

    it('evaluates modulo', () => {
      expect(evaluateExpression('17 % 5')).toEqual({ value: 2, error: null });
    });

    it('evaluates exponentiation', () => {
      expect(evaluateExpression('2 ^ 10')).toEqual({ value: 1024, error: null });
    });

    it('respects operator precedence', () => {
      expect(evaluateExpression('2 + 3 * 4')).toEqual({ value: 14, error: null });
    });

    it('respects parentheses', () => {
      expect(evaluateExpression('(2 + 3) * 4')).toEqual({ value: 20, error: null });
    });

    it('handles nested parentheses', () => {
      expect(evaluateExpression('((2 + 3) * (4 - 1))')).toEqual({ value: 15, error: null });
    });

    // ── Unary operators ──
    it('handles unary minus', () => {
      expect(evaluateExpression('-5')).toEqual({ value: -5, error: null });
    });

    it('handles unary minus in expression', () => {
      expect(evaluateExpression('3 + -2')).toEqual({ value: 1, error: null });
    });

    // ── Decimal numbers ──
    it('evaluates decimal numbers', () => {
      expect(evaluateExpression('2.5 + 1.3')).toEqual({ value: 3.8, error: null });
    });

    // ── Constants ──
    it('resolves pi constant', () => {
      const result = evaluateExpression('pi');
      expect(result.error).toBeNull();
      expect(result.value).toBeCloseTo(Math.PI, 10);
    });

    it('resolves e constant', () => {
      const result = evaluateExpression('e');
      expect(result.error).toBeNull();
      expect(result.value).toBeCloseTo(Math.E, 10);
    });

    it('resolves tau constant', () => {
      const result = evaluateExpression('tau');
      expect(result.error).toBeNull();
      expect(result.value).toBeCloseTo(Math.PI * 2, 10);
    });

    // ── Functions ──
    it('evaluates sqrt', () => {
      expect(evaluateExpression('sqrt(16)')).toEqual({ value: 4, error: null });
    });

    it('evaluates abs', () => {
      expect(evaluateExpression('abs(-7)')).toEqual({ value: 7, error: null });
    });

    it('evaluates sin', () => {
      const result = evaluateExpression('sin(0)');
      expect(result.error).toBeNull();
      expect(result.value).toBeCloseTo(0, 10);
    });

    it('evaluates cos', () => {
      const result = evaluateExpression('cos(0)');
      expect(result.error).toBeNull();
      expect(result.value).toBeCloseTo(1, 10);
    });

    it('evaluates ceil', () => {
      expect(evaluateExpression('ceil(2.3)')).toEqual({ value: 3, error: null });
    });

    it('evaluates floor', () => {
      expect(evaluateExpression('floor(2.9)')).toEqual({ value: 2, error: null });
    });

    it('evaluates round', () => {
      expect(evaluateExpression('round(2.5)')).toEqual({ value: 3, error: null });
    });

    it('evaluates min with multiple args', () => {
      expect(evaluateExpression('min(5, 3, 8)')).toEqual({ value: 3, error: null });
    });

    it('evaluates max with multiple args', () => {
      expect(evaluateExpression('max(5, 3, 8)')).toEqual({ value: 8, error: null });
    });

    it('evaluates nested functions', () => {
      expect(evaluateExpression('sqrt(abs(-16))')).toEqual({ value: 4, error: null });
    });

    it('evaluates pow function', () => {
      expect(evaluateExpression('pow(2, 8)')).toEqual({ value: 256, error: null });
    });

    // ── Unit conversions ──
    it('converts mm (identity)', () => {
      expect(evaluateExpression('10mm')).toEqual({ value: 10, error: null });
    });

    it('converts cm to mm', () => {
      expect(evaluateExpression('2cm')).toEqual({ value: 20, error: null });
    });

    it('converts m to mm', () => {
      expect(evaluateExpression('1m')).toEqual({ value: 1000, error: null });
    });

    it('converts inches to mm', () => {
      expect(evaluateExpression('1in')).toEqual({ value: 25.4, error: null });
    });

    it('combines unit values in expression', () => {
      expect(evaluateExpression('1cm + 5mm')).toEqual({ value: 15, error: null });
    });

    // ── Variables ──
    it('resolves variables from context', () => {
      const ctx = { d1: 10 };
      expect(evaluateExpression('d1 * 2', ctx)).toEqual({ value: 20, error: null });
    });

    it('resolves dotted variable names', () => {
      const ctx = { 'Sketch1.Width': 25 };
      expect(evaluateExpression('Sketch1.Width + 5', ctx)).toEqual({ value: 30, error: null });
    });

    it('uses multiple variables', () => {
      const ctx = { width: 10, height: 20 };
      expect(evaluateExpression('width * height', ctx)).toEqual({ value: 200, error: null });
    });

    // ── Complex expressions ──
    it('evaluates FreeCAD-style formula', () => {
      const ctx = { 'Pad.Height': 10 };
      const result = evaluateExpression('Pad.Height * 2 + 5mm', ctx);
      expect(result).toEqual({ value: 25, error: null });
    });

    it('evaluates complex CAD expression', () => {
      const ctx = { radius: 5 };
      const result = evaluateExpression('pi * radius ^ 2', ctx);
      expect(result.error).toBeNull();
      expect(result.value).toBeCloseTo(Math.PI * 25, 10);
    });

    // ── Error handling ──
    it('returns error for empty expression', () => {
      expect(evaluateExpression('')).toEqual({ value: null, error: 'Empty expression' });
    });

    it('returns error for whitespace-only expression', () => {
      expect(evaluateExpression('   ')).toEqual({ value: null, error: 'Empty expression' });
    });

    it('returns error for unknown variable', () => {
      const result = evaluateExpression('unknown_var + 1');
      expect(result.value).toBeNull();
      expect(result.error).toContain('Unknown variable');
    });

    it('returns error for unknown function', () => {
      const result = evaluateExpression('badFunc(1)');
      expect(result.value).toBeNull();
      expect(result.error).toContain('Unknown function');
    });

    it('returns error for division by zero', () => {
      const result = evaluateExpression('10 / 0');
      expect(result.value).toBeNull();
      expect(result.error).toContain('Division by zero');
    });

    it('returns error for unexpected character', () => {
      const result = evaluateExpression('2 & 3');
      expect(result.value).toBeNull();
      expect(result.error).toContain('Unexpected character');
    });

    // ── Fast path for plain numbers ──
    it('fast-paths plain integer', () => {
      expect(evaluateExpression('42')).toEqual({ value: 42, error: null });
    });

    it('fast-paths plain decimal', () => {
      expect(evaluateExpression('3.14')).toEqual({ value: 3.14, error: null });
    });
  });

  describe('isSimpleNumber', () => {
    it('returns true for integer', () => {
      expect(isSimpleNumber('42')).toBe(true);
    });

    it('returns true for decimal', () => {
      expect(isSimpleNumber('3.14')).toBe(true);
    });

    it('returns true for negative integer', () => {
      expect(isSimpleNumber('-7')).toBe(true);
    });

    it('returns false for expression', () => {
      expect(isSimpleNumber('2 + 3')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isSimpleNumber('')).toBe(false);
    });

    it('returns false for text', () => {
      expect(isSimpleNumber('abc')).toBe(false);
    });
  });

  describe('formatParameterValue', () => {
    it('formats integer', () => {
      expect(formatParameterValue(10)).toBe('10');
    });

    it('formats decimal with default precision', () => {
      expect(formatParameterValue(3.14159)).toBe('3.142');
    });

    it('formats with custom precision', () => {
      expect(formatParameterValue(3.14159, 2)).toBe('3.14');
    });

    it('avoids negative zero', () => {
      expect(formatParameterValue(-0.000001)).toBe('0');
    });
  });

  describe('extractVariableNames', () => {
    it('extracts simple variable', () => {
      expect(extractVariableNames('d1 * 2')).toEqual(['d1']);
    });

    it('extracts dotted variable', () => {
      expect(extractVariableNames('Sketch1.Width + 5')).toEqual(['Sketch1.Width']);
    });

    it('extracts multiple variables', () => {
      const names = extractVariableNames('width * height + depth');
      expect(names).toContain('width');
      expect(names).toContain('height');
      expect(names).toContain('depth');
    });

    it('excludes functions', () => {
      expect(extractVariableNames('sqrt(x) + sin(y)')).toEqual(['x', 'y']);
    });

    it('excludes constants', () => {
      expect(extractVariableNames('pi * r')).toEqual(['r']);
    });

    it('returns empty for invalid expression', () => {
      expect(extractVariableNames('')).toEqual([]);
    });
  });
});
