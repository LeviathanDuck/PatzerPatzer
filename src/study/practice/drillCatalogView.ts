
















import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs } from '../../ui/controlExplainer';
import { writeHashRoute } from '../../router';
import {
  listRecentEngineDrills, listEngineDrillsByStudyItem,
  deleteEngineDrillRecord, createEngineDrillRecord,
  getStudy, createStudyStrict, saveStudyStrict, savePracticeDecision,
} from '../studyDb';



export interface DrillCatalogDeps {
  readonly listRecentEngineDrills: typeof listRecentEngineDrills;
  readonly listEngineDrillsByStudyItem: typeof listEngineDrillsByStudyItem;
  readonly deleteEngineDrillRecord: typeof deleteEngineDrillRecord;
  readonly createEngineDrillRecord: typeof createEngineDrillRecord;
  readonly getStudy: typeof getStudy;
  readonly createStudyStrict: typeof createStudyStrict;
  readonly saveStudyStrict: typeof saveStudyStrict;
  readonly savePracticeDecision: typeof savePracticeDecision;
}

const REAL_CATALOG_DEPS: DrillCatalogDeps = {
  listRecentEngineDrills, listEngineDrillsByStudyItem,
  deleteEngineDrillRecord, createEngineDrillRecord,
  getStudy, createStudyStrict, saveStudyStrict, savePracticeDecision,
};

let _catalogDeps: DrillCatalogDeps = REAL_CATALOG_DEPS;
import type { EngineDrillRecord } from '../types';
import { resumePersistedEngineDrill, startEngineDrill, engineDrillActive, openDrillRecordOnBoard } from './engineDrillHost';
import { buildSelectedDrillExport, type DrillExportScope } from './orpBundle';
import { planDrillPromotion, applyDrillPromotion, type DrillPromotionPlan } from './drillPromotion';

const PAGE_LIMIT = 200;
const UNDO_WINDOW_MS = 10_000;

// --- Module state -------------------------------------------------------------

export type DrillCatalogScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'study'; readonly studyItemId: string; readonly title: string };

type CatalogStatus = 'loading' | 'error' | 'ready';

let _open = false;
let _scope: DrillCatalogScope = { kind: 'global' };
let _status: CatalogStatus = 'loading';
let _records: EngineDrillRecord[] = [];
let _search = '';
const _filters = {
  study: '' as string,          // studyItemId ('' = any)
  side: '' as '' | 'white' | 'black',
  outcome: '' as '' | 'won' | 'lost' | 'draw' | 'ended',
  goal: '' as string,           // goal kind ('' = any)
  difficulty: '' as string,
  assistance: '' as '' | 'used' | 'clean',
  completion: '' as '' | 'complete' | 'partial' | 'interrupted',
};
let _selected = new Set<string>();
let _undo: { records: EngineDrillRecord[]; timer: ReturnType<typeof setTimeout> } | null = null;
let _exportPreview: { records: EngineDrillRecord[]; scope: DrillExportScope } | null = null;
let _promotion:
  | { stage: 'title'; record: EngineDrillRecord; title: string }
  | { stage: 'preview'; record: EngineDrillRecord; plan: DrillPromotionPlan }
  | { stage: 'error'; message: string }
  | null = null;
let _notice: string | null = null;

let _dialogOpener: HTMLElement | null = null;

export function isDrillCatalogOpen(): boolean { return _open; }

export function closeDrillCatalog(): void {
  _open = false;
  _exportPreview = null;
  _promotion = null;
  _selected = new Set();
  _notice = null;
}



export function openDrillCatalogPromotion(record: EngineDrillRecord, redraw: () => void): void {
  openDrillCatalog({ kind: 'global' }, redraw);
  _promotion = { stage: 'title', record, title: 'Promoted drill' };
  writeHashRoute('#/study');
}

export function openDrillCatalog(scope: DrillCatalogScope, redraw: () => void, deps: DrillCatalogDeps = REAL_CATALOG_DEPS): void {
  _catalogDeps = deps;
  _open = true;
  _scope = scope;
  _status = 'loading';
  _records = [];
  _selected = new Set();
  _exportPreview = null;
  _promotion = null;
  _notice = null;
  const load = scope.kind === 'global'
    ? _catalogDeps.listRecentEngineDrills(PAGE_LIMIT)
    : _catalogDeps.listEngineDrillsByStudyItem(scope.studyItemId, PAGE_LIMIT);
  load.then(records => {
    if (!_open) return;
    // Per-Study reads come back in key order; newest-first is the catalog's contract order.
    _records = [...records].sort((a, b) => b.updatedAt - a.updatedAt);
    _status = 'ready';
    redraw();
  }).catch(() => {
    if (!_open) return;
    _status = 'error';
    redraw();
  });
}

// --- Filtering ---------------------------------------------------------------

function goalKindsOf(r: EngineDrillRecord): string[] {
  return r.snapshot.goals.map(g => g.kind);
}

function usedAssistance(r: EngineDrillRecord): boolean {
  return r.snapshot.takebacks > 0 || r.snapshot.moves.some(m => m.assistanceUsed.length > 0);
}

function matchesFilters(r: EngineDrillRecord): boolean {
  if (_filters.study !== '' && r.studyItemId !== _filters.study) return false;
  if (_filters.side !== '' && (r.snapshot.learnerIsWhite ? 'white' : 'black') !== _filters.side) return false;
  if (_filters.outcome !== '' && r.outcome !== _filters.outcome) return false;
  if (_filters.goal !== '' && !goalKindsOf(r).includes(_filters.goal)) return false;
  if (_filters.difficulty !== '' && r.snapshot.difficulty !== _filters.difficulty) return false;
  if (_filters.assistance === 'used' && !usedAssistance(r)) return false;
  if (_filters.assistance === 'clean' && usedAssistance(r)) return false;
  if (_filters.completion !== '' && r.completionState !== _filters.completion) return false;
  if (_search.trim().length > 0) {
    const needle = _search.trim().toLowerCase();
    const hay = [
      r.drillId, r.studyItemId ?? '', r.outcome ?? '', r.completionState,
      r.snapshot.difficulty, ...goalKindsOf(r),
    ].join(' ').toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

function dateGroupLabel(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

// --- Actions -----------------------------------------------------------------

function resumeRecord(record: EngineDrillRecord, redraw: () => void): void {
  if (engineDrillActive()) { _notice = 'A drill is already live on the analysis board — finish or abandon it first.'; redraw(); return; }


  openDrillRecordOnBoard(record);
  resumePersistedEngineDrill(record);
  closeDrillCatalog();
  writeHashRoute('#/analysis');
  redraw();
}

function retryRecord(record: EngineDrillRecord, redraw: () => void): void {
  if (engineDrillActive()) { _notice = 'A drill is already live on the analysis board — finish or abandon it first.'; redraw(); return; }

  openDrillRecordOnBoard(record, { atStart: true });
  const s = record.snapshot;
  startEngineDrill({
    startFen: s.startFen,
    learnerIsWhite: s.learnerIsWhite,
    goals: s.goals,
    ...(s.moveLimit !== undefined ? { moveLimit: s.moveLimit } : {}),
    ...(s.timeLimitMs !== undefined ? { timeLimitMs: s.timeLimitMs } : {}),
    difficulty: s.requestedDifficulty,
    retryOfDrillId: record.drillId, // §13/§14.1: retries are LINKED attempts, never overwrites
  });
  closeDrillCatalog();
  writeHashRoute('#/analysis');
  redraw();
}

function deleteRecords(records: readonly EngineDrillRecord[], redraw: () => void): void {
  if (records.length === 0) return;
  if (_undo !== null) { clearTimeout(_undo.timer); commitUndoExpiry(); }
  Promise.all(records.map(r => _catalogDeps.deleteEngineDrillRecord(r.drillId))).then(() => {
    _undo = {
      records: [...records],
      timer: setTimeout(() => { _undo = null; redraw(); }, UNDO_WINDOW_MS),
    };
    _records = _records.filter(r => !records.some(d => d.drillId === r.drillId));
    _selected = new Set([..._selected].filter(id => !records.some(d => d.drillId === id)));
    redraw();
  }).catch(() => { _notice = 'Delete failed — the records were not removed.'; redraw(); });
}

function commitUndoExpiry(): void {

  _undo = null;
}

function undoDelete(redraw: () => void): void {
  const undo = _undo;
  if (undo === null) return;
  clearTimeout(undo.timer);
  _undo = null;
  Promise.all(undo.records.map(r => _catalogDeps.createEngineDrillRecord(r))).then(results => {
    if (results.some(r => r.duplicate)) _notice = 'Some drills already existed and were left untouched.';
    _records = [..._records, ...undo.records].sort((a, b) => b.updatedAt - a.updatedAt);
    redraw();
  }).catch(() => { _notice = 'Undo failed — the drills could not be restored.'; redraw(); });
}

function downloadExport(records: readonly EngineDrillRecord[], scope: DrillExportScope): void {
  const exported = buildSelectedDrillExport(records, scope);
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.dataset.uiExplainerExempt = 'programmatic-download-node';
  a.href = url;
  a.download = scope === 'shareable' ? 'drills-shareable.json' : 'drills-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

function beginPromotion(record: EngineDrillRecord): void {
  _promotion = { stage: 'title', record, title: 'Promoted drill' };
}

async function previewPromotion(redraw: () => void): Promise<void> {
  if (_promotion === null || _promotion.stage !== 'title') return;
  const { record, title } = _promotion;
  const planned = await planDrillPromotion(
    record, { kind: 'complete-drill' }, { kind: 'new-study-item', title },
    { loadStudy: _catalogDeps.getStudy },
  );
  _promotion = planned.ok
    ? { stage: 'preview', record, plan: planned.plan }
    : { stage: 'error', message: `Promotion failed: ${planned.reason}` };
  redraw();
}

async function confirmPromotion(redraw: () => void): Promise<void> {
  if (_promotion === null || _promotion.stage !== 'preview') return;
  const applied = await applyDrillPromotion(_promotion.plan, {
    loadStudy: _catalogDeps.getStudy,
    createStudy: _catalogDeps.createStudyStrict,
    saveStudy: _catalogDeps.saveStudyStrict,
    saveDecisionRow: _catalogDeps.savePracticeDecision,
    mintId: () => crypto.randomUUID(),
    now: () => Date.now(),
  });
  if (applied.ok) {
    _promotion = null;
    _notice = 'Drill promoted to a new Study chapter.';
  } else {
    _promotion = { stage: 'error', message: `Promotion failed: ${applied.reason}` };
  }
  redraw();
}

// --- Rendering ----------------------------------------------------------------

function filterSelect(
  label: string, value: string, options: readonly { value: string; label: string }[],
  onChange: (value: string) => void, redraw: () => void,
): VNode {
  return h('label.drill-catalog__filter', [
    h('span.drill-catalog__filter-label', label),
    h('select', {
      attrs: controlExplainerAttrs({ label: `Filter by ${label.toLowerCase()}` }),
      on: { change: (e: Event) => { onChange((e.target as HTMLSelectElement).value); redraw(); } },
    }, [
      h('option', { attrs: { value: '', selected: value === '' } }, 'Any'),
      ...options.map(o => h('option', { attrs: { value: o.value, selected: value === o.value } }, o.label)),
    ]),
  ]);
}

function renderFilters(redraw: () => void): VNode {
  const studies = [...new Set(_records.map(r => r.studyItemId).filter((id): id is string => id !== undefined))];
  const goals = [...new Set(_records.flatMap(goalKindsOf))];
  return h('div.drill-catalog__filters', [
    h('input.drill-catalog__search', {
      attrs: {
        type: 'search', placeholder: 'Search drills…', value: _search,
        ...controlExplainerAttrs({ label: 'Search drills', description: 'Matches goal, outcome, difficulty, completion, and Study.' }),
      },
      on: { input: (e: Event) => { _search = (e.target as HTMLInputElement).value; redraw(); } },
    }),
    filterSelect('Study', _filters.study, studies.map(s => ({ value: s, label: s })), v => { _filters.study = v; }, redraw),
    filterSelect('Side', _filters.side, [{ value: 'white', label: 'White' }, { value: 'black', label: 'Black' }], v => { _filters.side = v as typeof _filters.side; }, redraw),
    filterSelect('Outcome', _filters.outcome, ['won', 'lost', 'draw', 'ended'].map(v => ({ value: v, label: v })), v => { _filters.outcome = v as typeof _filters.outcome; }, redraw),
    filterSelect('Goal', _filters.goal, goals.map(g => ({ value: g, label: g })), v => { _filters.goal = v; }, redraw),
    filterSelect('Difficulty', _filters.difficulty, [{ value: 'casual', label: 'Casual' }, { value: 'mastery', label: 'Mastery' }], v => { _filters.difficulty = v; }, redraw),
    filterSelect('Assistance', _filters.assistance, [{ value: 'used', label: 'Assistance used' }, { value: 'clean', label: 'No assistance' }], v => { _filters.assistance = v as typeof _filters.assistance; }, redraw),
    filterSelect('Completion', _filters.completion, ['complete', 'partial', 'interrupted'].map(v => ({ value: v, label: v })), v => { _filters.completion = v as typeof _filters.completion; }, redraw),
  ]);
}

function rowSummary(r: EngineDrillRecord): string {
  const side = r.snapshot.learnerIsWhite ? 'White' : 'Black';
  const goals = goalKindsOf(r).join(', ') || 'open-ended';
  const outcome = r.outcome ?? r.completionState;
  return `${side} · ${goals} · ${r.snapshot.difficulty} · ${outcome}`;
}

function renderRow(r: EngineDrillRecord, redraw: () => void): VNode {
  const selected = _selected.has(r.drillId);
  return h('div.drill-catalog__row', { key: r.drillId }, [
    h('input.drill-catalog__select', {
      attrs: {
        type: 'checkbox', checked: selected,
        ...controlExplainerAttrs({ label: 'Select drill', description: 'Adds this drill to the multi-selection for bulk Export or Delete.' }),
      },
      on: {
        change: () => {
          if (selected) _selected.delete(r.drillId); else _selected.add(r.drillId);
          redraw();
        },
      },
    }),
    h('div.drill-catalog__row-main', [
      h('div.drill-catalog__row-title', rowSummary(r)),
      h('div.drill-catalog__row-sub', [
        `${r.snapshot.moves.length} moves`,
        r.retryOfDrillId !== undefined ? ' · retry (linked attempt)' : '',
        r.completionState === 'partial' ? ' · resumable' : '',
      ].join('')),
    ]),
    h('div.drill-catalog__row-actions', [



      r.completionState === 'partial' || r.completionState === 'interrupted'
        ? h('button.drill-catalog__action', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Resume', tier: 'essential',
              description: 'Continues this unfinished drill live on the analysis board from where it stopped.',
            }) },
            on: { click: () => resumeRecord(r, redraw) },
          }, 'Resume')
        : null,



      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Analysis', tier: 'essential',
          description: 'Opens this drill game on the analysis board.',
        }) },
        on: {
          click: () => {
            openDrillRecordOnBoard(r);
            closeDrillCatalog();
            redraw();
          },
        },
      }, 'Analysis'),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Retry', tier: 'essential',
          description: 'Starts a fresh drill from the same setup as a linked attempt; this record is kept.',
        }) },
        on: { click: () => retryRecord(r, redraw) },
      }, 'Retry'),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Export', tier: 'essential',
          description: 'Opens the export scope and manifest preview for this drill. Nothing downloads without the preview.',
        }) },
        on: { click: () => { _exportPreview = { records: [r], scope: 'shareable' }; redraw(); } },
      }, 'Export'),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Promote to Study', tier: 'essential',
          description: 'Starts the previewed promotion of this drill into a new Study chapter. Never automatic.',
        }) },
        on: { click: () => { beginPromotion(r); redraw(); } },
      }, 'Promote'),
      h('button.drill-catalog__action.drill-catalog__action--danger', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Delete drill', tier: 'essential',
          description: 'Removes this drill record with a 10-second undo. Study material and SRS are never affected.',
        }) },
        on: { click: () => deleteRecords([r], redraw) },
      }, 'Delete'),
    ]),
  ]);
}




function asDialog(label: string, onClose: () => void, children: (VNode | null)[]): VNode {
  return h('div.drill-catalog__modal', {
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' },
    hook: {
      insert: (vnode) => {
        _dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        (vnode.elm as HTMLElement | undefined)?.focus();
      },
      destroy: () => {
        _dialogOpener?.focus();
        _dialogOpener = null;
      },
    },
    on: {
      keydown: (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }



        if (e.key === 'Tab') {
          const root = e.currentTarget as HTMLElement;
          const focusables = Array.from(root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ));
          if (focusables.length === 0) { e.preventDefault(); root.focus(); return; }
          const first = focusables[0]!;
          const last = focusables[focusables.length - 1]!;
          const active = document.activeElement;
          if (e.shiftKey && (active === first || active === root)) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          } else if (active === null || !(active instanceof HTMLElement) || !root.contains(active)) {
            // Focus escaped or was lost — pull it back inside.
            e.preventDefault();
            first.focus();
          }
        }
      },
    },
  }, children);
}

function renderExportPreview(redraw: () => void): VNode | null {
  const preview = _exportPreview;
  if (preview === null) return null;
  const exported = buildSelectedDrillExport(preview.records, preview.scope);
  const manifest = preview.scope === 'shareable'
    ? ['Chess moves and start positions', 'Goals, side, and move limits']
    : ['Full drill records: settings changes, assistance, takebacks, feedback inputs, timing, results'];
  const excluded = preview.scope === 'shareable'
    ? ['Personal notes', 'Assistance/feedback/timing detail', 'Results and identities', 'SRS and attempts', 'Engine cache']
    : [];
  return asDialog(
    'Export drills — scope and manifest preview',
    () => { _exportPreview = null; redraw(); },
    [
    h('div.drill-catalog__modal-title', `Export ${preview.records.length} drill(s) — ${preview.scope === 'shareable' ? 'Shareable' : 'Personal Backup'} scope`),
    h('div.drill-catalog__manifest', [
      h('div.drill-catalog__manifest-head', 'Included'),
      ...manifest.map(line => h('div.drill-catalog__manifest-line', `• ${line}`)),
      ...(excluded.length > 0 ? [
        h('div.drill-catalog__manifest-head', 'Excluded (privacy boundary)'),
        ...excluded.map(line => h('div.drill-catalog__manifest-line', `• ${line}`)),
      ] : []),
    ]),
    h('div.drill-catalog__modal-actions', [
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: preview.scope === 'shareable' ? 'Switch to Personal Backup scope' : 'Switch to Shareable scope',
          description: 'Changes what the export includes; the preview above updates before anything downloads.',
        }) },
        on: { click: () => { _exportPreview = { ...preview, scope: preview.scope === 'shareable' ? 'personal-backup' : 'shareable' }; redraw(); } },
      }, preview.scope === 'shareable' ? 'Backup scope' : 'Shareable scope'),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Download export', tier: 'essential',
          description: 'Downloads exactly what the preview shows as a JSON file.',
        }) },
        on: { click: () => { downloadExport(preview.records, preview.scope); _exportPreview = null; redraw(); } },
      }, 'Download'),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel export', description: 'Closes the preview without downloading.' }) },
        on: { click: () => { _exportPreview = null; redraw(); } },
      }, 'Cancel'),
    ]),
    h('div.drill-catalog__modal-note', `${exported.drills.length} record(s) in scope.`),
  ]);
}

function renderPromotion(redraw: () => void): VNode | null {
  const promo = _promotion;
  if (promo === null) return null;
  if (promo.stage === 'error') {
    return asDialog('Promotion message', () => { _promotion = null; redraw(); }, [
      h('div.drill-catalog__modal-title', 'Promotion'),
      h('div.drill-catalog__modal-note', promo.message),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Close promotion message', description: 'Dismisses this message; nothing was written.' }) },
        on: { click: () => { _promotion = null; redraw(); } },
      }, 'Close'),
    ]);
  }
  if (promo.stage === 'title') {
    return asDialog('Promote drill — choose destination', () => { _promotion = null; redraw(); }, [
      h('div.drill-catalog__modal-title', 'Promote drill — choose destination'),
      h('label.drill-catalog__filter', [
        h('span.drill-catalog__filter-label', 'New Study chapter title'),
        h('input', {
          attrs: { type: 'text', value: promo.title, ...controlExplainerAttrs({ label: 'New Study chapter title' }) },
          on: { input: (e: Event) => { _promotion = { ...promo, title: (e.target as HTMLInputElement).value }; } },
        }),
      ]),
      h('div.drill-catalog__modal-actions', [
        h('button.drill-catalog__action', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Preview promotion', tier: 'essential',
            description: 'Shows exactly what will be created before anything is written.',
          }) },
          on: { click: () => { void previewPromotion(redraw); } },
        }, 'Preview'),
        h('button.drill-catalog__action', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel promotion', description: 'Closes without writing anything.' }) },
          on: { click: () => { _promotion = null; redraw(); } },
        }, 'Cancel'),
      ]),
    ]);
  }
  const preview = promo.plan.preview;
  return asDialog('Promotion preview', () => { _promotion = null; redraw(); }, [
    h('div.drill-catalog__modal-title', 'Promotion preview'),
    h('div.drill-catalog__manifest', [
      h('div.drill-catalog__manifest-line', `Destination: ${preview.destinationDescription}`),
      h('div.drill-catalog__manifest-line', `Moves: ${preview.sanLine.join(' ')}`),
      h('div.drill-catalog__manifest-line', `Default classification: ${preview.defaultRole} (trainability: ${preview.trainability} — promotion never creates trainability)`),
    ]),
    h('div.drill-catalog__modal-actions', [
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Confirm promotion', tier: 'essential',
          description: 'Creates the previewed Study chapter. Existing Studies are never overwritten.',
        }) },
        on: { click: () => { void confirmPromotion(redraw); } },
      }, 'Create chapter'),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel promotion', description: 'Closes the preview without writing anything.' }) },
        on: { click: () => { _promotion = null; redraw(); } },
      }, 'Cancel'),
    ]),
  ]);
}

export function renderDrillCatalog(redraw: () => void): VNode {
  if (_status === 'loading') return h('div.drill-catalog', h('div.drill-catalog__state', 'Loading drills…'));
  if (_status === 'error') {
    return h('div.drill-catalog', [
      h('div.drill-catalog__state', 'Could not load the Drill Catalog.'),
      h('button.drill-catalog__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Retry loading drills', description: 'Reloads the Drill Catalog records.' }) },
        on: { click: () => openDrillCatalog(_scope, redraw) },
      }, 'Retry'),
    ]);
  }
  const visible = _records.filter(matchesFilters);
  const groups = new Map<string, EngineDrillRecord[]>();
  for (const r of visible) {
    const label = dateGroupLabel(r.updatedAt);
    const group = groups.get(label);
    if (group) group.push(r); else groups.set(label, [r]);
  }
  const selectedRecords = _records.filter(r => _selected.has(r.drillId));
  return h('div.drill-catalog', [
    h('div.drill-catalog__scope',
      _scope.kind === 'global' ? 'All drills' : `Drills from “${_scope.title}”`),
    renderFilters(redraw),
    _notice !== null ? h('div.drill-catalog__notice', _notice) : null,
    _undo !== null
      ? h('div.drill-catalog__undo', [
          `${_undo.records.length} drill(s) deleted. `,
          h('button.drill-catalog__action', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Undo delete', tier: 'essential',
              description: 'Restores the drills deleted a moment ago. The window closes after ten seconds.',
            }) },
            on: { click: () => undoDelete(redraw) },
          }, 'Undo'),
        ])
      : null,
    selectedRecords.length > 0
      ? h('div.drill-catalog__bulk', [
          `${selectedRecords.length} selected `,
          h('button.drill-catalog__action', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Export selected drills', tier: 'essential',
              description: 'Opens the scope and manifest preview for the selection. Nothing downloads without the preview.',
            }) },
            on: { click: () => { _exportPreview = { records: selectedRecords, scope: 'shareable' }; redraw(); } },
          }, 'Export'),
          h('button.drill-catalog__action.drill-catalog__action--danger', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Delete selected drills', tier: 'essential',
              description: 'Removes the selected drill records with a 10-second undo. Study material and SRS are never affected.',
            }) },
            on: { click: () => deleteRecords(selectedRecords, redraw) },
          }, 'Delete'),
        ])
      : null,
    visible.length === 0
      ? h('div.drill-catalog__state', _records.length === 0
          ? 'No drills yet — finish an Engine Drill and it will appear here.'
          : 'No drills match the current search/filters.')
      : h('div.drill-catalog__groups',
          [...groups.entries()].map(([label, records]) =>
            h('div.drill-catalog__group', { key: label }, [
              h('div.drill-catalog__group-date', label),
              ...records.map(r => renderRow(r, redraw)),
            ]))),
    renderExportPreview(redraw),
    renderPromotion(redraw),
  ]);
}
