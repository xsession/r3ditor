/**
 * Expression Engine — FreeCAD/Fusion 360-style formula evaluation for parameter fields.
 *
 * Supports:
 * - Arithmetic: +, -, *, /, ^, %
 * - Parentheses: (2 + 3) * 4
 * - Named constants: pi, e
 * - Functions: sin, cos, tan, asin, acos, atan, sqrt, abs, ceil, floor, round, min, max, log, ln
 * - Unit suffixes: 10mm, 2.5in, 1cm, 0.5m (converted to mm)
 * - Variable references: Sketch1.Width, Pad.Height, d1, d2
 *
 * Usage:
 *   const ctx = { 'd1': 10, 'Sketch1.Width': 25 };
 *   evaluateExpression('d1 * 2 + 5mm', ctx)  → { value: 25, error: null }
 *   evaluateExpression('sqrt(d1^2 + 3)', ctx) → { value: ~10.44, error: null }
 */

export interface ExpressionResult {
  value: number | null;
  error: string | null;
}

export type VariableContext = Record<string, number>;

// ── Unit conversion factors (everything to mm) ──

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  inch: 25.4,
  ft: 304.8,
  '°': Math.PI / 180, // degrees to radians (for angle contexts)
  deg: Math.PI / 180,
  rad: 1,
};

// ── Built-in constants ──

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
  tau: Math.PI * 2,
};

// ── Built-in functions ──

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: (y, x) => Math.atan2(y, x),
  sqrt: Math.sqrt,
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  log: Math.log10,
  log10: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  pow: (base, exp) => Math.pow(base, exp),
};

// ── Token types ──

type TokenType = 'number' | 'op' | 'lparen' | 'rparen' | 'ident' | 'comma';

interface Token {
  type: TokenType;
  value: string;
  numValue?: number;
}

// ── Tokenizer ──

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];

    // Skip whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Number (including decimals and unit suffixes)
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < len && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      // Check for unit suffix
      let unitStr = '';
      const unitStart = i;
      while (i < len && /[a-zA-Z°]/.test(expr[i])) {
        unitStr += expr[i];
        i++;
      }
      let numVal = parseFloat(numStr);
      if (isNaN(numVal)) throw new Error(`Invalid number: ${numStr}`);
      if (unitStr && UNIT_TO_MM[unitStr.toLowerCase()]) {
        numVal *= UNIT_TO_MM[unitStr.toLowerCase()];
      } else if (unitStr) {
        // Not a unit, push back identifier chars
        i = unitStart;
      }
      tokens.push({ type: 'number', value: numStr + unitStr, numValue: numVal });
      continue;
    }

    // Operators
    if ('+-*/%^'.includes(ch)) {
      // Handle unary minus/plus
      if ((ch === '-' || ch === '+') && (tokens.length === 0 || tokens[tokens.length - 1].type === 'op' || tokens[tokens.length - 1].type === 'lparen')) {
        // Unary: read the number
        let numStr = ch;
        i++;
        while (i < len && /[0-9.]/.test(expr[i])) {
          numStr += expr[i];
          i++;
        }
        if (numStr.length > 1) {
          const numVal = parseFloat(numStr);
          if (isNaN(numVal)) throw new Error(`Invalid number: ${numStr}`);
          tokens.push({ type: 'number', value: numStr, numValue: numVal });
          continue;
        }
        // Just the operator
        i = i - (numStr.length - 1);
      }
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }

    // Identifier (variable or function name — allows dots for "Sketch1.Width")
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < len && /[a-zA-Z0-9_.]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }

    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }

  return tokens;
}

// ── Recursive Descent Parser ──

class Parser {
  private tokens: Token[];
  private pos: number;
  private ctx: VariableContext;

  constructor(tokens: Token[], ctx: VariableContext) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    if (this.pos >= this.tokens.length) throw new Error('Unexpected end of expression');
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} '${t.value}'`);
    return t;
  }

  // expression = term (('+' | '-') term)*
  parseExpression(): number {
    let result = this.parseTerm();
    while (this.peek()?.type === 'op' && (this.peek()!.value === '+' || this.peek()!.value === '-')) {
      const op = this.consume().value;
      const right = this.parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  // term = power (('*' | '/' | '%') power)*
  private parseTerm(): number {
    let result = this.parsePower();
    while (this.peek()?.type === 'op' && ('*/%'.includes(this.peek()!.value))) {
      const op = this.consume().value;
      const right = this.parsePower();
      if (op === '*') result *= right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        result /= right;
      }
      else result %= right;
    }
    return result;
  }

  // power = unary ('^' power)?
  private parsePower(): number {
    let result = this.parseUnary();
    if (this.peek()?.type === 'op' && this.peek()!.value === '^') {
      this.consume();
      const exp = this.parsePower(); // right-associative
      result = Math.pow(result, exp);
    }
    return result;
  }

  // unary = '-' unary | primary
  private parseUnary(): number {
    if (this.peek()?.type === 'op' && (this.peek()!.value === '-' || this.peek()!.value === '+')) {
      const op = this.consume().value;
      const val = this.parseUnary();
      return op === '-' ? -val : val;
    }
    return this.parsePrimary();
  }

  // primary = number | '(' expression ')' | functionCall | variable
  private parsePrimary(): number {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end of expression');

    // Number literal
    if (t.type === 'number') {
      this.consume();
      return t.numValue!;
    }

    // Parenthesized expression
    if (t.type === 'lparen') {
      this.consume();
      const val = this.parseExpression();
      this.expect('rparen');
      return val;
    }

    // Identifier — function call or variable/constant
    if (t.type === 'ident') {
      this.consume();
      const name = t.value;

      // Function call: ident '(' args ')'
      if (this.peek()?.type === 'lparen') {
        this.consume(); // eat '('
        const args: number[] = [];
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseExpression());
          while (this.peek()?.type === 'comma') {
            this.consume();
            args.push(this.parseExpression());
          }
        }
        this.expect('rparen');
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`Unknown function: ${name}`);
        return fn(...args);
      }

      // Constant
      if (CONSTANTS[name] !== undefined) return CONSTANTS[name];

      // Variable from context
      if (this.ctx[name] !== undefined) return this.ctx[name];

      throw new Error(`Unknown variable: '${name}'`);
    }

    throw new Error(`Unexpected token: ${t.type} '${t.value}'`);
  }

  isComplete(): boolean {
    return this.pos >= this.tokens.length;
  }
}

// ── Public API ──

/**
 * Evaluate a mathematical expression with optional variable context.
 *
 * @param expr - Expression string, e.g. "d1 * 2 + 5mm"
 * @param ctx  - Variable name → value mapping
 * @returns { value, error }
 */
export function evaluateExpression(expr: string, ctx: VariableContext = {}): ExpressionResult {
  if (!expr || !expr.trim()) return { value: null, error: 'Empty expression' };

  // Fast path: plain number
  const plain = parseFloat(expr);
  if (!isNaN(plain) && String(plain) === expr.trim()) {
    return { value: plain, error: null };
  }

  try {
    const tokens = tokenize(expr.trim());
    if (tokens.length === 0) return { value: null, error: 'Empty expression' };

    const parser = new Parser(tokens, ctx);
    const value = parser.parseExpression();

    if (!parser.isComplete()) {
      return { value: null, error: 'Unexpected tokens after expression' };
    }

    if (!isFinite(value)) return { value: null, error: 'Result is not finite' };

    return { value, error: null };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

/**
 * Check if a string is a simple numeric value (no expressions needed).
 */
export function isSimpleNumber(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  return !isNaN(parseFloat(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed);
}

/**
 * Format a number for display in parameter fields.
 */
export function formatParameterValue(value: number, decimals = 3): string {
  // Avoid -0
  const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return rounded === 0 ? '0' : String(rounded);
}

/**
 * Extract variable names referenced in an expression.
 */
export function extractVariableNames(expr: string): string[] {
  try {
    const tokens = tokenize(expr.trim());
    const names: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'ident') {
        // Skip if it's a function or constant
        if (FUNCTIONS[t.value] || CONSTANTS[t.value]) continue;
        // Skip if next is '(' (function call)
        if (i + 1 < tokens.length && tokens[i + 1].type === 'lparen') continue;
        if (!names.includes(t.value)) names.push(t.value);
      }
    }
    return names;
  } catch {
    return [];
  }
}
