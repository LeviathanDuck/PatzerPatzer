



















import { countParseablePgnGames } from '../../tree/pgn';
import type { StudyItem, EngineDrillRecord } from '../types';
import type {
  StudyPracticeLessonRow, StudyPracticeDecisionRow, StudyPracticeAuthoredContentRow,
} from '../studyDb';
import type { SrsScheduleRecord, SrsAttemptRecord } from './srsTypes';
import type { DrillGoal } from './engineDrillCtrl';

export const ORP_BUNDLE_SCHEMA_VERSION = 1;

// --- Categories (closed checklist) -------------------------------------------

export type OrpBundleCategory =
  | 'personal-notes'
  | 'settings'
  | 'merge-provenance'
  | 'srs'
  | 'attempt-history'
  | 'drill-catalog';

export const ORP_BUNDLE_CATEGORIES: readonly OrpBundleCategory[] = [
  'personal-notes', 'settings', 'merge-provenance', 'srs', 'attempt-history', 'drill-catalog',
] as const;

export type OrpBundleMode = 'shareable-lesson' | 'personal-backup';

// --- Bundle shape ------------------------------------------------------------

export interface OrpBundlePgnEntry {
  readonly studyItemId: string;
  readonly title: string;
  /** Standard PGN — the ordinary chess material. Personal notes never ride here. */
  readonly pgn: string;
}

export interface OrpBundlePersonalNote {
  readonly studyItemId: string;
  readonly notes: string;
}

export interface OrpBundleProvenanceEntry {
  readonly studyItemId: string;
  /** The StudyItem's linked-source provenance layers, carried opaquely (D3 owns the shape). */
  readonly linkedSourceProvenance: unknown;
}

export interface OrpBundle {
  readonly schemaVersion: typeof ORP_BUNDLE_SCHEMA_VERSION;
  readonly mode: OrpBundleMode;
  /** Exactly the categories whose data is PRESENT on this bundle. */
  readonly manifest: { readonly includedCategories: readonly OrpBundleCategory[] };
  readonly pgn: readonly OrpBundlePgnEntry[];
  /** Versioned ORP metadata: stable identities, roles, trainability, hints, generic deviations. */
  readonly orp: {
    readonly lessons: readonly StudyPracticeLessonRow[];
    readonly decisions: readonly StudyPracticeDecisionRow[];
    readonly authoredContent: readonly StudyPracticeAuthoredContentRow[];
  };
  // Optional categories — ABSENT unless checked AND non-empty.
  readonly personalNotes?: readonly OrpBundlePersonalNote[];
  readonly settings?: unknown;
  readonly mergeProvenance?: readonly OrpBundleProvenanceEntry[];
  readonly srs?: readonly SrsScheduleRecord[];
  readonly attempts?: readonly SrsAttemptRecord[];
  readonly drillCatalog?: readonly EngineDrillRecord[];
}

export interface OrpBundleInput {
  readonly studies: readonly StudyItem[];
  readonly lessons: readonly StudyPracticeLessonRow[];
  readonly decisions: readonly StudyPracticeDecisionRow[];
  readonly authoredContent: readonly StudyPracticeAuthoredContentRow[];
  readonly settings?: unknown;
  readonly srs?: readonly SrsScheduleRecord[];
  readonly attempts?: readonly SrsAttemptRecord[];
  readonly drills?: readonly EngineDrillRecord[];
}

// --- Building ----------------------------------------------------------------

/**
 * Build the portable bundle. `categories` is the explicit advanced checklist — for Shareable
 * Lesson it defaults to NOTHING checked (the §14 exclusions-by-default), for Personal Backup
 * only checked categories appear. Drill history requires its category in BOTH modes.
 */
export function buildOrpBundle(
  input: OrpBundleInput,
  mode: OrpBundleMode,
  categories: readonly OrpBundleCategory[] = [],
): OrpBundle {
  const checked = new Set<OrpBundleCategory>(categories);
  const included: OrpBundleCategory[] = [];

  const personalNotes: OrpBundlePersonalNote[] = checked.has('personal-notes')
    ? input.studies
        .filter(s => typeof s.notes === 'string' && s.notes.length > 0)
        .map(s => ({ studyItemId: s.id, notes: s.notes! }))
    : [];
  const mergeProvenance: OrpBundleProvenanceEntry[] = checked.has('merge-provenance')
    ? input.studies
        .filter(s => (s as { linkedSourceProvenance?: unknown }).linkedSourceProvenance !== undefined)
        .map(s => ({
          studyItemId: s.id,
          linkedSourceProvenance: (s as { linkedSourceProvenance?: unknown }).linkedSourceProvenance,
        }))
    : [];
  const srs = checked.has('srs') ? (input.srs ?? []) : [];
  const attempts = checked.has('attempt-history') ? (input.attempts ?? []) : [];
  const drills = checked.has('drill-catalog') ? (input.drills ?? []) : [];
  const settingsIncluded = checked.has('settings') && input.settings !== undefined;

  if (personalNotes.length > 0) included.push('personal-notes');
  if (settingsIncluded) included.push('settings');
  if (mergeProvenance.length > 0) included.push('merge-provenance');
  if (srs.length > 0) included.push('srs');
  if (attempts.length > 0) included.push('attempt-history');
  if (drills.length > 0) included.push('drill-catalog');

  return {
    schemaVersion: ORP_BUNDLE_SCHEMA_VERSION,
    mode,
    manifest: { includedCategories: included },
    pgn: input.studies.map(s => ({ studyItemId: s.id, title: s.title, pgn: s.pgn })),
    orp: {
      lessons: [...input.lessons],
      decisions: [...input.decisions],
      authoredContent: [...input.authoredContent],
    },
    ...(personalNotes.length > 0 ? { personalNotes } : {}),
    ...(settingsIncluded ? { settings: input.settings } : {}),
    ...(mergeProvenance.length > 0 ? { mergeProvenance } : {}),
    ...(srs.length > 0 ? { srs } : {}),
    ...(attempts.length > 0 ? { attempts } : {}),
    ...(drills.length > 0 ? { drillCatalog: drills } : {}),
  };
}

// --- Selected-Drill export (§13 privacy boundary) ----------------------------

export type DrillExportScope = 'shareable' | 'personal-backup';

/** §13 shareable boundary: "selected chess moves/start position and explicitly safe setup
 *  metadata only" — structurally NO notes, assistance/feedback/timing detail, SRS, engine
 *  cache, or unrelated records. */
export interface ShareableDrillExportEntry {
  readonly startFen: string;
  readonly learnerIsWhite: boolean;
  readonly goals: readonly DrillGoal[];
  readonly moveLimit?: number;
  readonly moves: readonly { readonly uci: string; readonly byLearner: boolean }[];
}

export type SelectedDrillExport =
  | { readonly scope: 'shareable'; readonly drills: readonly ShareableDrillExportEntry[] }
  | { readonly scope: 'personal-backup'; readonly drills: readonly EngineDrillRecord[] };

export function buildSelectedDrillExport(
  records: readonly EngineDrillRecord[],
  scope: DrillExportScope,
): SelectedDrillExport {
  if (scope === 'personal-backup') {
    // Explicit selection is the caller's act (§13: full history only via the Personal Backup
    // Drill Catalog category); records travel verbatim.
    return { scope, drills: [...records] };
  }
  return {
    scope,
    drills: records.map(r => ({
      startFen: r.startFen,
      learnerIsWhite: r.snapshot.learnerIsWhite,
      goals: [...r.snapshot.goals],
      ...(r.snapshot.moveLimit !== undefined ? { moveLimit: r.snapshot.moveLimit } : {}),
      moves: r.snapshot.moves.map(m => ({ uci: m.uci, byLearner: m.byLearner })),
    })),
  };
}

// --- PGN-only loss report ----------------------------------------------------

/** "PGN-only export provides a concrete loss report" — built from what the bundle ACTUALLY
 *  carries; empty when a PGN-only export would lose nothing. */
export function pgnOnlyLossReport(bundle: OrpBundle): string[] {
  const report: string[] = [];
  if (bundle.orp.lessons.length > 0 || bundle.orp.decisions.length > 0) {
    report.push(`Stable identities: ${bundle.orp.lessons.length} lesson(s), ${bundle.orp.decisions.length} decision(s) lose their durable IDs.`);
  }
  const classified = bundle.orp.decisions.filter(d => d.role !== undefined || d.trainability !== undefined).length;
  if (classified > 0) report.push(`Branch roles/trainability on ${classified} decision(s) are dropped.`);
  const lineages = new Set(bundle.orp.decisions.map(d => d.sourceLineageId).filter(id => id !== 'unlinked'));
  if (lineages.size > 0) report.push(`Source lineage/provenance for ${lineages.size} lineage(s) is dropped.`);
  if (bundle.orp.authoredContent.length > 0) {
    report.push(`Authored hints/generic deviations on ${bundle.orp.authoredContent.length} decision(s) are dropped.`);
  }
  if (bundle.personalNotes !== undefined) report.push(`Personal notes on ${bundle.personalNotes.length} item(s) are dropped.`);
  if (bundle.settings !== undefined) report.push('Practice settings are dropped.');
  if (bundle.mergeProvenance !== undefined) report.push(`Merge provenance on ${bundle.mergeProvenance.length} item(s) is dropped.`);
  if (bundle.srs !== undefined) report.push(`${bundle.srs.length} SRS schedule row(s) are dropped.`);
  if (bundle.attempts !== undefined) report.push(`${bundle.attempts.length} attempt-history row(s) are dropped.`);
  if (bundle.drillCatalog !== undefined) report.push(`${bundle.drillCatalog.length} Drill Catalog record(s) are dropped.`);
  return report;
}

// --- Reading (never a mutating best-effort on newer versions) ----------------

export type OrpBundleReadResult =
  | { readonly kind: 'valid'; readonly bundle: OrpBundle }
  | { readonly kind: 'invalid'; readonly detail: string }
  | {
      readonly kind: 'newer-version';
      readonly schemaVersion: number;
      readonly compatibilityReport: readonly string[];
      /** Safe chess extraction: entries whose PGN text actually parses/replays. */
      readonly extractedPgn: readonly { readonly title?: string; readonly pgn: string }[];
    };

export function readOrpBundle(json: string): OrpBundleReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { kind: 'invalid', detail: `not JSON: ${String(e)}` };
  }
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'invalid', detail: 'not an object' };
  const raw = parsed as Record<string, unknown>;
  const version = raw['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'invalid', detail: 'missing/invalid schemaVersion' };
  }
  if (version > ORP_BUNDLE_SCHEMA_VERSION) {
    // Newer than this build understands: NEVER a mutating best-effort import. Report + extract
    // only chess material that PROVABLY parses.
    const extractedPgn: { title?: string; pgn: string }[] = [];
    const pgnField = raw['pgn'];
    if (Array.isArray(pgnField)) {
      for (const entry of pgnField) {
        if (typeof entry === 'object' && entry !== null) {
          const e = entry as Record<string, unknown>;
          if (typeof e['pgn'] === 'string' && countParseablePgnGames(e['pgn']) > 0) {
            extractedPgn.push({
              ...(typeof e['title'] === 'string' ? { title: e['title'] } : {}),
              pgn: e['pgn'],
            });
          }
        }
      }
    }
    return {
      kind: 'newer-version',
      schemaVersion: version,
      compatibilityReport: [
        `This bundle uses schema version ${version}; this build understands up to ${ORP_BUNDLE_SCHEMA_VERSION}.`,
        'No ORP metadata was imported — a newer bundle is never applied best-effort.',
        extractedPgn.length > 0
          ? `${extractedPgn.length} PGN game set(s) can be safely extracted as plain chess material.`
          : 'No safely extractable PGN material was found.',
      ],
      extractedPgn,
    };
  }
  if (raw['mode'] !== 'shareable-lesson' && raw['mode'] !== 'personal-backup') {
    return { kind: 'invalid', detail: 'unknown mode' };
  }
  const manifest = raw['manifest'];
  const orp = raw['orp'];
  if (typeof manifest !== 'object' || manifest === null
    || !Array.isArray((manifest as Record<string, unknown>)['includedCategories'])) {
    return { kind: 'invalid', detail: 'missing manifest' };
  }
  if (typeof orp !== 'object' || orp === null || !Array.isArray(raw['pgn'])) {
    return { kind: 'invalid', detail: 'missing pgn/orp sections' };
  }
  return { kind: 'valid', bundle: parsed as OrpBundle };
}

// --- Import planning (staged; replacement never default) ----------------------

export interface BundleImportConflicts {
  readonly studies: readonly string[];
  readonly lessons: readonly string[];
  readonly decisions: readonly string[];
}

export interface BundleImportChoice {
  readonly kind: 'additive' | 'merge' | 'replacement';
  readonly description: string;
  /** Replacement is applyable ONLY behind the explicit opt-in flag — never by default. */
  readonly applyable: boolean;
}

export interface BundleImportPlan {
  readonly conflicts: BundleImportConflicts;
  readonly choices: readonly BundleImportChoice[];
  readonly defaultChoice: 'additive';
}

export interface ExistingIds {
  readonly studyItemIds: ReadonlySet<string>;
  readonly lessonIds: ReadonlySet<string>;
  readonly decisionIds: ReadonlySet<string>;
}

export function planBundleImport(
  bundle: OrpBundle,
  existing: ExistingIds,
  opts?: { readonly allowReplacement?: boolean },
): BundleImportPlan {
  const conflicts: BundleImportConflicts = {
    studies: bundle.pgn.map(p => p.studyItemId).filter(id => existing.studyItemIds.has(id)),
    lessons: bundle.orp.lessons.map(l => l.lessonId).filter(id => existing.lessonIds.has(id)),
    decisions: bundle.orp.decisions.map(d => d.decisionId).filter(id => existing.decisionIds.has(id)),
  };
  const hasConflicts =
    conflicts.studies.length > 0 || conflicts.lessons.length > 0 || conflicts.decisions.length > 0;
  return {
    conflicts,
    choices: [
      {
        kind: 'additive',
        description: 'Import only material that does not exist yet; conflicting items are skipped.',
        applyable: true,
      },
      {
        kind: 'merge',
        description: 'Import new material and stage per-item merges for conflicting items.',
        applyable: hasConflicts,
      },
      {
        kind: 'replacement',
        description: 'Replace existing conflicting items with the bundle versions. Never the default; requires explicit confirmation.',
        applyable: hasConflicts && opts?.allowReplacement === true,
      },
    ],
    defaultChoice: 'additive',
  };
}
