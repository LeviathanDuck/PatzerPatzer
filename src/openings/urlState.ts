import type { OpeningsTool } from './types';

export type OpponentsUrlTargetKind = 'account' | 'collection';
export type OpponentsUrlColor = 'white' | 'black' | 'both';
export type OpponentsUrlOrientation = 'white' | 'black';
export type OpponentsUrlSpeed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical';
export type OpponentsUrlRange = 'last-week' | 'last-month' | 'last-3months' | 'last-6months';

export interface OpponentsUrlTarget {
  kind: OpponentsUrlTargetKind;
  id: string;
}

export interface OpponentsTreeUrlState {
  target?: OpponentsUrlTarget;
  tool: OpeningsTool;
  color: OpponentsUrlColor;
  speeds: OpponentsUrlSpeed[];
  range: OpponentsUrlRange | null;
  orientation: OpponentsUrlOrientation;
  line: string[];
}

export interface OpponentsUrlStateInvalidParam {
  field: string;
  value: string;
  fallback: string;
}

export interface OpponentsTreeUrlStateParseResult {
  state: OpponentsTreeUrlState;
  invalidParams: OpponentsUrlStateInvalidParam[];
  ignoredParams: string[];
}

const DEFAULT_STATE: OpponentsTreeUrlState = {
  tool:        'opening-tree',
  color:       'white',
  speeds:      [],
  range:       null,
  orientation: 'white',
  line:        [],
};

const KNOWN_PARAMS = new Set(['target', 'tool', 'color', 'speeds', 'range', 'orientation', 'line']);
const TARGET_KINDS = new Set<OpponentsUrlTargetKind>(['account', 'collection']);
const TOOLS = new Set<OpeningsTool>(['opening-tree', 'repertoire', 'prep-report', 'style', 'practice']);
const COLORS = new Set<OpponentsUrlColor>(['white', 'black', 'both']);
const SPEEDS: readonly OpponentsUrlSpeed[] = ['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical'];
const SPEED_SET = new Set<OpponentsUrlSpeed>(SPEEDS);
const RANGES = new Set<OpponentsUrlRange>(['last-week', 'last-month', 'last-3months', 'last-6months']);
const ORIENTATIONS = new Set<OpponentsUrlOrientation>(['white', 'black']);
const UCI_MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function normalizedQuery(input: string): string {
  const withoutHash = input.replace(/^#\/?/, '');
  const queryStart = withoutHash.indexOf('?');
  if (queryStart >= 0) return withoutHash.slice(queryStart + 1);
  return withoutHash.startsWith('?') ? withoutHash.slice(1) : withoutHash;
}

function invalid(field: string, value: string, fallback: string): OpponentsUrlStateInvalidParam {
  return { field, value, fallback };
}

function parseTarget(value: string): OpponentsUrlTarget | undefined {
  const separator = value.indexOf(':');
  if (separator <= 0) return undefined;
  const kind = value.slice(0, separator) as OpponentsUrlTargetKind;
  const id = value.slice(separator + 1);
  if (!TARGET_KINDS.has(kind) || id.trim() !== id || id.length === 0) return undefined;
  return { kind, id };
}

function uniqueNormalizedSpeeds(value: string): OpponentsUrlSpeed[] | undefined {
  const raw = value.split(',').map(speed => speed.trim().toLowerCase()).filter(Boolean);
  if (raw.length === 0) return undefined;
  const speeds: OpponentsUrlSpeed[] = [];
  for (const speed of raw) {
    if (!SPEED_SET.has(speed as OpponentsUrlSpeed)) return undefined;
    if (!speeds.includes(speed as OpponentsUrlSpeed)) speeds.push(speed as OpponentsUrlSpeed);
  }
  return SPEEDS.filter(speed => speeds.includes(speed));
}

function parseLine(value: string): string[] | undefined {
  const moves = value.split('.').map(move => move.trim().toLowerCase()).filter(Boolean);
  if (moves.length === 0) return undefined;
  return moves.every(move => UCI_MOVE_RE.test(move)) ? moves : undefined;
}

export function parseOpponentsTreeUrlState(input: string): OpponentsTreeUrlStateParseResult {
  const params = new URLSearchParams(normalizedQuery(input));
  const state: OpponentsTreeUrlState = { ...DEFAULT_STATE, speeds: [], line: [] };
  const invalidParams: OpponentsUrlStateInvalidParam[] = [];
  const ignoredParams: string[] = [];

  params.forEach((_value, key) => {
    if (!KNOWN_PARAMS.has(key) && !ignoredParams.includes(key)) ignoredParams.push(key);
  });

  const target = params.get('target');
  if (target !== null) {
    const parsed = parseTarget(target);
    if (parsed) state.target = parsed;
    else invalidParams.push(invalid('target', target, 'none'));
  }

  const tool = params.get('tool');
  if (tool !== null) {
    const normalized = tool.toLowerCase();
    if (TOOLS.has(normalized as OpeningsTool)) state.tool = normalized as OpeningsTool;
    else invalidParams.push(invalid('tool', tool, DEFAULT_STATE.tool));
  }

  const color = params.get('color');
  if (color !== null) {
    const normalized = color.toLowerCase();
    if (COLORS.has(normalized as OpponentsUrlColor)) state.color = normalized as OpponentsUrlColor;
    else invalidParams.push(invalid('color', color, DEFAULT_STATE.color));
  }

  const speeds = params.get('speeds');
  if (speeds !== null) {
    const parsed = uniqueNormalizedSpeeds(speeds);
    if (parsed) state.speeds = parsed;
    else invalidParams.push(invalid('speeds', speeds, 'all'));
  }

  const range = params.get('range');
  if (range !== null) {
    const normalized = range.toLowerCase();
    if (RANGES.has(normalized as OpponentsUrlRange)) state.range = normalized as OpponentsUrlRange;
    else invalidParams.push(invalid('range', range, 'all-time'));
  }

  const orientation = params.get('orientation');
  if (orientation !== null) {
    const normalized = orientation.toLowerCase();
    if (ORIENTATIONS.has(normalized as OpponentsUrlOrientation)) {
      state.orientation = normalized as OpponentsUrlOrientation;
    } else invalidParams.push(invalid('orientation', orientation, DEFAULT_STATE.orientation));
  }

  const line = params.get('line');
  if (line !== null) {
    const parsed = parseLine(line);
    if (parsed) state.line = parsed;
    else invalidParams.push(invalid('line', line, 'root'));
  }

  return { state, invalidParams, ignoredParams };
}

function encodeStateValue(value: string): string {
  return encodeURIComponent(value).replace(/%3A/gi, ':').replace(/%2C/gi, ',');
}

function appendParam(params: string[], key: string, value: string): void {
  params.push(`${key}=${encodeStateValue(value)}`);
}

export function serializeOpponentsTreeUrlState(state: Partial<OpponentsTreeUrlState>): string {
  const params: string[] = [];

  if (state.target) appendParam(params, 'target', `${state.target.kind}:${state.target.id}`);
  if (state.tool && state.tool !== DEFAULT_STATE.tool) appendParam(params, 'tool', state.tool);
  if (state.color && state.color !== DEFAULT_STATE.color) appendParam(params, 'color', state.color);
  if (state.speeds && state.speeds.length > 0) {
    const speeds = uniqueNormalizedSpeeds(state.speeds.join(','));
    if (speeds && speeds.length > 0) appendParam(params, 'speeds', speeds.join(','));
  }
  if (state.range) appendParam(params, 'range', state.range);
  if (state.orientation && state.orientation !== DEFAULT_STATE.orientation) {
    appendParam(params, 'orientation', state.orientation);
  }
  if (state.line && state.line.length > 0) appendParam(params, 'line', state.line.join('.'));

  return `#/opponents/tree${params.length > 0 ? `?${params.join('&')}` : ''}`;
}
