import { h, type VNode } from 'snabbdom';
import type { ImportedGame } from '../import/types';
import type { TreeNode } from '../tree/types';
import {
  buildRepertoireIndexFromSource,
  isUploadedRepertoireSource,
  type RepertoireMatchRecord,
  type RepertoirePositionIndex,
  type RepertoireSource,
} from '../repertoire';
import { computeRepertoireMatchRecord } from '../repertoire/scan';
import { repertoireScanSourceVersion } from '../repertoire/scanRun';
import { getCurrentRepertoireMatchRecord, saveRepertoireMatchRecords } from '../repertoire/sourceDb';
import { repertoireDivergenceCategoryLabel } from '../repertoire/report';
import { resolveRepertoireOrpLine } from '../repertoire/orp';
import { repertoireSourceSideBadge } from '../repertoire/explorerViewModel';
import { saveRepertoireLineToOrpLibrary } from '../study/saveAction';

export interface AnalysisRepertoireComplianceRow {
  source: RepertoireSource;
  sourceIndex: number;
  accentIndex: number;
  record: RepertoireMatchRecord;
  computedOnDemand: boolean;
}

export interface AnalysisRepertoireComplianceStorage {
  getCurrentRecord(
    sourceId: string,
    sourceVersion: string,
    gameId: string,
  ): Promise<RepertoireMatchRecord | undefined>;
  saveRecords(records: readonly RepertoireMatchRecord[]): Promise<void>;
}

export interface RenderAnalysisRepertoireComplianceInput {
  game: ImportedGame | null | undefined;
  mainline: readonly TreeNode[];
  sources: readonly RepertoireSource[];
  sourcesLoaded: boolean;
  sourcesError: boolean;
  loadSources(redraw: () => void): void;
  navigate(path: string): void;
  redraw(): void;
  storage?: AnalysisRepertoireComplianceStorage;
  currentNavigationToken?: () => number;
  isNavigationTokenCurrent?: (token: number) => boolean;
}

interface LoadState {
  key: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  generation: number;
  navigationToken: number | null;
  rows: AnalysisRepertoireComplianceRow[];
  error: string | null;
}

const PANEL_OPEN_KEY = 'patzer.analysisRepertoireComplianceOpen';

const defaultStorage: AnalysisRepertoireComplianceStorage = {
  getCurrentRecord: getCurrentRepertoireMatchRecord,
  saveRecords: saveRepertoireMatchRecords,
};

let loadState: LoadState = {
  key: '',
  status: 'idle',
  generation: 0,
  navigationToken: null,
  rows: [],
  error: null,
};
let loadGeneration = 0;
const orpSavingRows = new Set<string>();
const orpFeedback = new Map<string, string>();
const orpFeedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

function enabledSourcesWithIndex(sources: readonly RepertoireSource[]): Array<{ source: RepertoireSource; sourceIndex: number }> {
  return sources
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(item => item.source.enabled && isUploadedRepertoireSource(item.source));
}

export function analysisRepertoireComplianceLoadKey(
  gameId: string,
  sources: readonly RepertoireSource[],
): string {
  return [
    gameId,
    ...enabledSourcesWithIndex(sources).map(({ source, sourceIndex }) =>
      [
        sourceIndex,
        source.id,
        repertoireScanSourceVersion(source),
        source.updatedAt,
      ].join(':'),
    ),
  ].join('|');
}

export function analysisMainlinePathForPly(mainline: readonly TreeNode[], ply: number | null): string | null {
  if (ply === null || !Number.isFinite(ply)) return null;
  if (ply <= 0) return '';

  let path = '';
  let sawMove = false;
  for (const node of mainline.slice(1)) {
    if (node.ply > ply) break;
    path += node.id;
    sawMove = true;
    if (node.ply === ply) return path;
  }
  return sawMove ? path : '';
}


















interface JumpPathCacheEntry {
  root:   TreeNode | undefined;
  leaf:   TreeNode | undefined;
  length: number;
  paths:  Map<number, string | null>;
}
let jumpPathCache: JumpPathCacheEntry | null = null;

function cachedMainlinePathForPly(mainline: readonly TreeNode[], ply: number | null): string | null {
  if (ply === null || !Number.isFinite(ply)) return null;
  const root = mainline[0];
  const leaf = mainline[mainline.length - 1];
  if (
    !jumpPathCache ||
    jumpPathCache.root !== root ||
    jumpPathCache.leaf !== leaf ||
    jumpPathCache.length !== mainline.length
  ) {
    jumpPathCache = { root, leaf, length: mainline.length, paths: new Map() };
  }
  const cached = jumpPathCache.paths.get(ply);
  if (cached !== undefined) return cached;
  const path = analysisMainlinePathForPly(mainline, ply);
  jumpPathCache.paths.set(ply, path);
  return path;
}

export interface LoadAnalysisRepertoireComplianceRowsInput {
  game: ImportedGame;
  sources: readonly RepertoireSource[];
  storage?: AnalysisRepertoireComplianceStorage;
  isCurrent?: () => boolean;
  yieldToMain?: () => Promise<void>;
}

function defaultYieldToMain(): Promise<void> {
  return new Promise(resolve => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 120 });
    } else {
      globalThis.setTimeout(resolve, 0);
    }
  });
}

function sourceIndexForSource(
  sourceIndexes: Map<string, RepertoirePositionIndex>,
  source: RepertoireSource,
): RepertoirePositionIndex {
  const key = `${source.id}:${repertoireScanSourceVersion(source)}`;
  const existing = sourceIndexes.get(key);
  if (existing) return existing;

  let sourceIndex: RepertoirePositionIndex;
  try {
    sourceIndex = buildRepertoireIndexFromSource(source);
  } catch {
    sourceIndex = new Map();
  }
  sourceIndexes.set(key, sourceIndex);
  return sourceIndex;
}

export async function loadAnalysisRepertoireComplianceRows(
  params: LoadAnalysisRepertoireComplianceRowsInput,
): Promise<AnalysisRepertoireComplianceRow[]> {
  const storage = params.storage ?? defaultStorage;
  const isCurrent = params.isCurrent ?? (() => true);
  const yieldToMain = params.yieldToMain ?? defaultYieldToMain;
  const rows: AnalysisRepertoireComplianceRow[] = [];
  const computedRecords: RepertoireMatchRecord[] = [];
  const sourceIndexes = new Map<string, RepertoirePositionIndex>();

  for (const { source, sourceIndex } of enabledSourcesWithIndex(params.sources)) {
    if (!isCurrent()) return [];
    const sourceVersion = repertoireScanSourceVersion(source);
    let record = await storage.getCurrentRecord(source.id, sourceVersion, params.game.id);
    if (!isCurrent()) return [];
    let computedOnDemand = false;
    if (!record) {
      await yieldToMain();
      if (!isCurrent()) return [];
      const repertoireIndex = sourceIndexForSource(sourceIndexes, source);
      if (!isCurrent()) return [];
      record = computeRepertoireMatchRecord({
        game: params.game,
        source,
        sourceIndex: repertoireIndex,
      });
      if (!isCurrent()) return [];
      computedRecords.push(record);
      computedOnDemand = true;
    }
    rows.push({
      source,
      sourceIndex,
      accentIndex: sourceIndex % 8,
      record,
      computedOnDemand,
    });
  }

  if (computedRecords.length > 0) {
    if (!isCurrent()) return [];
    await storage.saveRecords(computedRecords);
    if (!isCurrent()) return [];
  }
  return rows;
}

function panelOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(PANEL_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

function setPanelOpen(open: boolean): void {
  try {
    globalThis.localStorage?.setItem(PANEL_OPEN_KEY, open ? 'true' : 'false');
  } catch {
    // Ignore unavailable storage; the panel still works for this render.
  }
}

function loadStillCurrent(
  input: RenderAnalysisRepertoireComplianceInput,
  key: string,
  generation: number,
  navigationToken: number | null,
): boolean {
  return loadState.key === key
    && loadState.generation === generation
    && (
      navigationToken === null
      || !input.isNavigationTokenCurrent
      || input.isNavigationTokenCurrent(navigationToken)
    );
}

function startLoad(input: RenderAnalysisRepertoireComplianceInput, key: string): void {
  const generation = ++loadGeneration;
  const navigationToken = input.currentNavigationToken?.() ?? null;
  loadState = {
    key,
    status: 'loading',
    generation,
    navigationToken,
    rows: [],
    error: null,
  };

  const game = input.game;
  if (!game) return;

  const loadParams: LoadAnalysisRepertoireComplianceRowsInput = {
    game,
    sources: input.sources,
    isCurrent: () => loadStillCurrent(input, key, generation, navigationToken),
  };
  if (input.storage) loadParams.storage = input.storage;

  void loadAnalysisRepertoireComplianceRows(loadParams).then(rows => {
    if (!loadStillCurrent(input, key, generation, navigationToken)) return;
    loadState = {
      key,
      status: 'ready',
      generation,
      navigationToken,
      rows,
      error: null,
    };
    input.redraw();
  }).catch(error => {
    if (!loadStillCurrent(input, key, generation, navigationToken)) return;
    loadState = {
      key,
      status: 'error',
      generation,
      navigationToken,
      rows: [],
      error: error instanceof Error ? error.message : 'Could not load repertoire records.',
    };
    input.redraw();
  });
}

function renderSourceChip(source: RepertoireSource, accentIndex: number): VNode {
  return h(`span.repertoire__chip.repertoire__accent--${accentIndex}`, [
    h('span.repertoire__chip-dot'),
    h('span.repertoire__chip-name', source.name),
    h('span.repertoire__side-badge', repertoireSourceSideBadge(source.side)),
  ]);
}

function colorLabel(color: 'white' | 'black'): string {
  return color === 'white' ? 'White' : 'Black';
}

function moveLabel(ply: number | null): string {
  if (ply === null || ply <= 0) return 'start';
  return `move ${Math.ceil(ply / 2)}`;
}

function matchedDepthLabel(ply: number): string {
  return ply > 0 ? `through ${moveLabel(ply)}` : 'at start';
}

function sourceStatus(row: AnalysisRepertoireComplianceRow): string {
  const { source, record } = row;
  if (record.status === 'in') return `in repertoire ${matchedDepthLabel(record.matchedDepthPly)}`;
  if (record.status === 'diverged') return `diverged at ${moveLabel(record.firstDivergencePly)}`;
  if (source.side !== 'both' && record.ownerColor !== source.side) {
    return `not applicable (owner played ${colorLabel(record.ownerColor)})`;
  }
  return 'not applicable';
}

function playedMoveLabel(record: RepertoireMatchRecord): string {
  const played = record.linePrefix?.[record.linePrefix.length - 1];
  return played?.san ?? record.playedUci ?? '?';
}

function missedMoveLabel(record: RepertoireMatchRecord): string {
  return record.missedSan ?? record.missedUci ?? '?';
}

function analysisOrpKey(row: AnalysisRepertoireComplianceRow): string {
  return `${row.source.id}:${row.record.key}`;
}

function setAnalysisOrpFeedback(key: string, message: string, redraw: () => void): void {
  orpFeedback.set(key, message);
  const existingTimer = orpFeedbackTimers.get(key);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    orpFeedback.delete(key);
    orpFeedbackTimers.delete(key);
    redraw();
  }, 1800);
  orpFeedbackTimers.set(key, timer);
}

function analysisOrpUnavailableReason(row: AnalysisRepertoireComplianceRow): string | null {
  // T7-A5 (Audit C F14, second bullet; T7_REPERTOIRE_DESIGN_2026-07-06 §A.1/§A.2): an
  // 'opponent-left' divergence has no owner move to drill — gate, don't warn, ahead of the
  // missedUci check below. No ownerColor 'mixed' check here (unlike A4's libraryView.ts
  // version): a single RepertoireMatchRecord is always one game's one owner color, never
  // 'mixed' — that field only exists on the aggregated RepertoireComplianceReportGroup.
  if (row.record.category === 'opponent-left') return "This was the opponent's deviation, not yours — there's no repertoire move of your own to drill here.";
  if (!row.record.missedUci) return 'No repertoire move is available for this row.';
  return null;
}

function saveAnalysisRepertoireLineToOrp(
  row: AnalysisRepertoireComplianceRow,
  input: RenderAnalysisRepertoireComplianceInput,
): void {
  const key = analysisOrpKey(row);
  if (orpSavingRows.has(key)) return;
  orpSavingRows.add(key);
  input.redraw();
  void Promise.resolve().then(async () => {
    const line = resolveRepertoireOrpLine({
      source: row.source,
      trainAs: row.record.ownerColor,
      linePrefix: row.record.linePrefix ?? [],
      missedUci: row.record.missedUci,
      missedSan: row.record.missedSan ?? null,
    });
    if (!line) return 'Could not resolve the full source line for ORP.';
    if (line.ucis.length < 3) return 'Line too short to practice.';
    const result = await saveRepertoireLineToOrpLibrary({
      ucis: line.ucis,
      sans: line.sans,
      trainAs: line.trainAs,
      sourceName: line.sourceName,
      title: line.label,
    });
    return result?.alreadyExisted ? 'Already in practice' : result ? 'Saved to Library!' : 'Save failed - invalid moves';
  }).then(message => {
    setAnalysisOrpFeedback(key, message, input.redraw);
  }).catch(error => {
    const message = error instanceof Error && error.message ? `Save failed - ${error.message}` : 'Save failed';
    setAnalysisOrpFeedback(key, message, input.redraw);
  }).finally(() => {
    orpSavingRows.delete(key);
    input.redraw();
  });
}

function renderDivergence(row: AnalysisRepertoireComplianceRow, input: RenderAnalysisRepertoireComplianceInput): VNode | null {
  const record = row.record;
  if (record.status !== 'diverged' || record.category === null) return null;
  const jumpPath = cachedMainlinePathForPly(input.mainline, record.firstDivergencePly);
  const categoryLabel = repertoireDivergenceCategoryLabel(record.category);
  const jumpTitle = jumpPath === null
    ? 'Divergence node is not available in the current mainline'
    : `Jump to ${moveLabel(record.firstDivergencePly)}`;
  const data = jumpPath === null
    ? {
        attrs: {
          type: 'button',
          title: jumpTitle,
          'aria-label': jumpTitle,
          disabled: 'disabled',
        },
      }
    : {
        attrs: {
          type: 'button',
          title: jumpTitle,
          'aria-label': jumpTitle,
        },
        on: {
          click: () => input.navigate(jumpPath),
        },
      };

  const orpReason = analysisOrpUnavailableReason(row);
  const orpKey = analysisOrpKey(row);
  const saving = orpSavingRows.has(orpKey);
  const feedback = orpFeedback.get(orpKey) ?? null;
  const orpTitle = orpReason ?? `Send ${row.source.name} line to Opening Repetition Practice`;

  return h('div.analysis-repertoire__divergence-wrap', [
    h('button.analysis-repertoire__divergence.repertoire__line-summary', data, [
      h('span.repertoire__line-main', [
        h('span.repertoire__line-text', [
          h('span.repertoire__line-prefix', `${moveLabel(record.firstDivergencePly)}: played `),
          h('span.repertoire__line-highlight', playedMoveLabel(record)),
          h('span.repertoire__line-expected', ` - repertoire ${missedMoveLabel(record)}`),
        ]),
      ]),
      h('span.repertoire__line-metrics', [
        h('span.repertoire__category-badge', categoryLabel),
        h('span.analysis-repertoire__jump', 'Jump'),
      ]),
    ]),
    h('div.repertoire__line-actions.analysis-repertoire__orp-actions', [
      h('button.study-btn.repertoire__line-action', {
        attrs: {
          type: 'button',
          title: orpTitle,
          'aria-label': orpTitle,
          disabled: Boolean(orpReason) || saving,
        },
        on: {
          click: () => {
            if (orpReason || saving) return;
            saveAnalysisRepertoireLineToOrp(row, input);
          },
        },
      }, saving ? 'Saving...' : 'Send to ORP'),
      feedback ? h('span.openings__save-feedback.repertoire__line-feedback', feedback) : null,
    ]),
  ]);
}

function renderRow(row: AnalysisRepertoireComplianceRow, input: RenderAnalysisRepertoireComplianceInput): VNode {
  return h(`div.analysis-repertoire__source-row.repertoire__accent--${row.accentIndex}`, {
    key: `${row.source.id}:${row.record.sourceVersion}`,
  }, [
    h('div.analysis-repertoire__source-summary', [
      renderSourceChip(row.source, row.accentIndex),
      h('span.analysis-repertoire__status', sourceStatus(row)),
      h('span.analysis-repertoire__meta', `matched ${matchedDepthLabel(row.record.matchedDepthPly)}`),
    ]),
    renderDivergence(row, input),
  ]);
}

function renderPanel(
  input: RenderAnalysisRepertoireComplianceInput,
  meta: string,
  body: Array<VNode | null>,
): VNode {
  const open = panelOpen();
  const headerTitle = open ? 'Collapse Repertoire Compliance' : 'Expand Repertoire Compliance';
  return h('section.analysis-repertoire.repertoire', [
    h('button.analysis-repertoire__header', {
      attrs: {
        type: 'button',
        title: headerTitle,
        'aria-label': headerTitle,
        'aria-expanded': String(open),
      },
      on: {
        click: () => {
          setPanelOpen(!open);
          input.redraw();
        },
      },
    }, [
      h('span.analysis-repertoire__title', 'Repertoire Compliance'),
      h('span.analysis-repertoire__header-meta', meta),
      h('span.analysis-repertoire__toggle', open ? '^' : 'v'),
    ]),
    open ? h('div.analysis-repertoire__body', body) : null,
  ]);
}

export function renderAnalysisRepertoireCompliance(input: RenderAnalysisRepertoireComplianceInput): VNode | null {
  if (!input.game) return null;

  if (!input.sourcesLoaded) {
    input.loadSources(input.redraw);
    return renderPanel(input, 'loading', [
      h('div.analysis-repertoire__message', 'Loading repertoire sources...'),
    ]);
  }

  if (input.sourcesError) {
    return renderPanel(input, 'error', [
      h('div.analysis-repertoire__message.analysis-repertoire__message--error', 'Could not load repertoire sources.'),
    ]);
  }

  if (enabledSourcesWithIndex(input.sources).length === 0) return null;

  const key = analysisRepertoireComplianceLoadKey(input.game.id, input.sources);
  const navigationToken = input.currentNavigationToken?.() ?? null;
  const loadingTokenIsStale = loadState.status === 'loading'
    && loadState.navigationToken !== null
    && navigationToken !== null
    && loadState.navigationToken !== navigationToken;
  if (loadState.key !== key || loadingTokenIsStale) startLoad(input, key);

  if (loadState.status === 'ready') {
    return renderPanel(input, `${loadState.rows.length} sources`, loadState.rows.map(row => renderRow(row, input)));
  }

  if (loadState.status === 'error') {
    return renderPanel(input, 'error', [
      h('div.analysis-repertoire__message.analysis-repertoire__message--error', loadState.error ?? 'Could not load repertoire records.'),
    ]);
  }

  return renderPanel(input, 'loading', [
    h('div.analysis-repertoire__message', 'Loading repertoire records...'),
  ]);
}
