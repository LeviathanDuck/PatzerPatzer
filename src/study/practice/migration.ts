


























import type { PositionProgress } from '../types';

// ===========================================================================
// Explicit reviewed-path mapping (the ONLY authoritative identity source)
// ===========================================================================

/**
 * One explicit reviewed-path mapping entry: a legacy `position-progress.key` (normalized FEN) that a
 * reviewed authoring pass has bound to a durable V2 decision identity. This — and ONLY this — makes a
 * legacy record classifiable as exact/reset. The mapping is produced upstream (D1 material identities);
 * the planner never derives it from chess content (rule 2, P2-ORP-12).
 */
export interface LegacyReviewedPathEntry {
  /** Legacy `PositionProgress.key` (normalized FEN) this entry authoritatively maps. */
  readonly legacyKey: string;
  /** Durable V2 decision UUID this legacy position was reviewed onto. Becomes the SRS `targetId`. */
  readonly decisionId: string;
  /** Owning V2 lesson scope (the SRS `lessonId`). */
  readonly lessonId: string;







  readonly targetRevision?: number;
  /**
   * NON-authoritative alternate position identities this decision is also known to match (a transposed
   * FEN, a SAN-sequence hash, a position hash). Present SOLELY so the planner can detect an unmapped
   * legacy record that is EQUIVALENT-by-content and classify it AMBIGUOUS — it never upgrades a record
   * to exact (rule 2). Never chess material the planner interprets; opaque equality keys only.
   */
  readonly equivalentPositionKeys?: readonly string[];
}

/** The explicit reviewed-path mapping: the authoritative legacy-key -> V2-decision identity source. */
export interface LegacyReviewedPathMapping {
  readonly entries: readonly LegacyReviewedPathEntry[];
}





/**
 * One canonical V2 decision identity as it actually EXISTS in the decision store: the durable
 * `decisionId` and its OWNING `lessonId`. This is the referential-integrity authority — the mapping is
 * validated against it so no proposal is ever emitted for a decision that does not exist or that a
 * mapping entry mis-attributes to the wrong lesson.
 */
export interface LegacyMigrationDecisionAuthorityEntry {
  readonly decisionId: string;
  readonly lessonId: string;
}








export interface LegacyMigrationDecisionAuthority {
  readonly decisions: readonly LegacyMigrationDecisionAuthorityEntry[];
}

// ===========================================================================
// Planner input
// ===========================================================================

/**
 * Everything the pure planner consumes. All three are supplied by the caller (the `studyDb.ts`
 * bounded-read seam in production, or fixtures in the focused test); the planner reads no I/O and no
 * clock. `alreadyEnrolledTargetIds` is the rerun/partial-apply-stability input (rule 1): a legacy
 * record whose mapped target is already enrolled in V2 is classified `already-migrated` and never
 * re-proposed, so planning after a partial apply neither double-classifies nor fabricates state.
 */
export interface LegacyMigrationInput {
  readonly legacyRecords: readonly PositionProgress[];
  readonly mapping: LegacyReviewedPathMapping;
  readonly alreadyEnrolledTargetIds: readonly string[];





  readonly decisionAuthority: LegacyMigrationDecisionAuthority;
}

// ===========================================================================
// Plan output
// ===========================================================================

/** The four required classifications plus the skipped-because-already-applied bucket. */
export type LegacyMigrationClassification =
  | 'exact'
  | 'ambiguous'
  | 'archived'
  | 'reset'
  | 'already-migrated';






























export interface LegacyEnrollmentProposal {
  readonly targetId: string;
  readonly lessonId: string;
  /** Explicit mapping revision when known; otherwise the base is deferred with the other counters. */
  readonly targetRevision: number | null;
  readonly status: 'active';
  readonly stepIndex: 0;
  readonly cleanStreak: 0;
  readonly lastCompletedAt: null;
  readonly lastAttemptId: null;
  /** Fields the pure planner MUST NOT fabricate — the enrollment service supplies them from an
   *  explicit clock + validated config at apply time, NEVER from a legacy timestamp. Constant tuple
   *  (byte-identical across runs). */
  readonly deferredToEnrollment: readonly [
    'scheduleRevision',
    'configId',
    'configVersion',
    'dueAt',
    'enrolledAt',
    'updatedAt',
  ];
  /** Explicit no-fabrication assertion: no legacy `nextDueAt`/`lastAttemptAt` produced a V2 due date. */
  readonly dueAtDerivedFromLegacy: false;
}

/** Diagnostic-only snapshot of the learned legacy state a `reset` deliberately DROPS (never transferred). */
export interface DroppedLegacyState {
  readonly level: number;
  readonly nextDueAt: number;
  readonly attempts: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly streak: number;
  readonly lastAttemptAt: number;
}

/** An exact migration: the legacy record is explicitly mapped and carried no learned state to drop. */
export interface ExactPlanEntry {
  readonly classification: 'exact';
  readonly legacyKey: string;
  readonly proposal: LegacyEnrollmentProposal;
}

/**
 * A reset migration: the legacy record IS explicitly mapped, but it carried learned progress
 * (level/streak/attempts/dueness) that CANNOT transfer (rule 2/3). The identity migrates; the mastery
 * is dropped and the mapped target is proposed for a fresh floor enrollment (a "reset to due"). The
 * dropped state is recorded for audit only.
 */
export interface ResetPlanEntry {
  readonly classification: 'reset';
  readonly legacyKey: string;
  readonly proposal: LegacyEnrollmentProposal;
  readonly droppedLegacyState: DroppedLegacyState;
}

/**
 * An ambiguous record: NO explicit mapping, but the legacy key matched one or more decisions'
 * non-authoritative equivalence keys (FEN/SAN/position-hash). It cannot become exact (rule 2); it is
 * surfaced with its candidate decision ids for manual/D1 resolution and produces no enrollment.
 */
export interface AmbiguousPlanEntry {
  readonly classification: 'ambiguous';
  readonly legacyKey: string;
  readonly candidateDecisionIds: readonly string[];
}

/**
 * An archived record: NO explicit mapping and NO content equivalence — an orphan with no path to a V2
 * decision. The plan PROPOSES archiving it (retain as history); nothing is deleted or rewritten here.
 */
export interface ArchivedPlanEntry {
  readonly classification: 'archived';
  readonly legacyKey: string;
  readonly reason: string;
}

/**
 * An already-migrated record: explicitly mapped, but the mapped V2 target is already enrolled. Skipped
 * so a rerun after a partial apply neither double-classifies nor re-proposes (rule 1). Not one of the
 * four action counts.
 */
export interface AlreadyMigratedPlanEntry {
  readonly classification: 'already-migrated';
  readonly legacyKey: string;
  readonly targetId: string;
}

export type LegacyMigrationPlanEntry =
  | ExactPlanEntry
  | ResetPlanEntry
  | AmbiguousPlanEntry
  | ArchivedPlanEntry
  | AlreadyMigratedPlanEntry;

/** Per-classification counts. `exact/ambiguous/archived/reset` are the four required action counts. */
export interface LegacyMigrationCounts {
  readonly exact: number;
  readonly ambiguous: number;
  readonly archived: number;
  readonly reset: number;
  readonly alreadyMigrated: number;
}

/**
 * The deterministic migration plan. `entries` are sorted by `legacyKey` (byte-stable code-unit order),
 * so the same input yields a byte-identical plan. `planVersion` is a schema discriminant mirroring the
 * sealed `SrsTraversalPlan.planVersion` convention.
 */
export interface LegacyMigrationPlan {
  readonly planVersion: 1;
  readonly counts: LegacyMigrationCounts;
  readonly entries: readonly LegacyMigrationPlanEntry[];
}

// ===========================================================================
// Typed failure contract (rule 6) — local, mirrors the family code/path/reason shape
// ===========================================================================

export type LegacyMigrationFailureCode =
  | 'not-an-array'
  | 'not-an-object'
  | 'missing-required-string'
  | 'non-finite-number'
  | 'out-of-domain'
  | 'duplicate-identity'
  | 'invalid-mapping'
  | 'capture-failed'
  | 'unknown-decision'
  | 'lesson-mismatch';

export interface LegacyMigrationFailure {
  readonly code: LegacyMigrationFailureCode;
  readonly path: string;
  readonly reason: string;
}

export type LegacyMigrationPlanResult =
  | { readonly ok: true; readonly plan: LegacyMigrationPlan }
  | { readonly ok: false; readonly failure: LegacyMigrationFailure };

// ===========================================================================
// Canonicalization + validation helpers (rule 6; family conventions)
// ===========================================================================

function fail(code: LegacyMigrationFailureCode, path: string, reason: string): LegacyMigrationFailure {
  return { code, path, reason };
}

/** Total-safe stringification for diagnostic interpolation (mirrors studyDb.ts `safeDiag`). */
function safeDiag(v: unknown): string {
  try {
    return String(v);
  } catch {
    return `<uncoercible ${typeof v}>`;
  }
}

/** Plain object only — null/Object.prototype prototype, not an array (mirrors studyDb.ts `isPlainObject`). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}








function isNonNegativeSafeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** Legacy `PositionProgress.level` domain ceiling (types.ts: `level: number; // 0–6`). */
const LEGACY_LEVEL_MAX = 6;

type LegacyNumericDomain = 'counter' | 'level' | 'timestamp';










function validateLegacyNumeric(v: unknown, domain: LegacyNumericDomain, path: string): LegacyMigrationFailure | null {
  if (!isFiniteNumber(v)) {
    return fail('non-finite-number', path, `legacy record ${path} must be a finite number, got ${safeDiag(v)}`);
  }
  switch (domain) {
    case 'counter':
      if (!isNonNegativeSafeInteger(v)) {
        return fail('out-of-domain', path, `legacy counter must be a non-negative safe integer, got ${safeDiag(v)}`);
      }
      break;
    case 'level':
      if (!isNonNegativeSafeInteger(v) || v > LEGACY_LEVEL_MAX) {
        return fail('out-of-domain', path, `legacy level must be an integer within 0..${LEGACY_LEVEL_MAX}, got ${safeDiag(v)}`);
      }
      break;
    case 'timestamp':
      if (v < 0) {
        return fail('out-of-domain', path, `legacy timestamp (epoch ms) must be non-negative, got ${safeDiag(v)}`);
      }
      break;
  }
  return null;
}

/** Byte-stable code-unit string comparison (locale-independent, unlike `localeCompare`). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A canonical, getter-free capture of one legacy record: every field is read EXACTLY once here into a
 * fresh frozen record, so the plan never retains the caller's object (defends against hostile getters
 * / prototype tricks per the family canonicalization discipline). Numeric fields are finite-validated.
 */
interface CanonicalLegacyRecord {
  readonly key: string;
  readonly level: number;
  readonly nextDueAt: number;
  readonly attempts: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly streak: number;
  readonly lastAttemptAt: number;
}

const LEGACY_NUMERIC_FIELDS: ReadonlyArray<readonly [keyof CanonicalLegacyRecord, LegacyNumericDomain]> = [
  ['level', 'level'],
  ['nextDueAt', 'timestamp'],
  ['attempts', 'counter'],
  ['correct', 'counter'],
  ['incorrect', 'counter'],
  ['streak', 'counter'],
  ['lastAttemptAt', 'timestamp'],
];







function canonicalizeLegacyRecord(
  raw: unknown,
  path: string,
): { readonly ok: true; readonly record: CanonicalLegacyRecord } | { readonly ok: false; readonly failure: LegacyMigrationFailure } {
  if (!isPlainObject(raw)) {
    return { ok: false, failure: fail('not-an-object', path, 'legacy position-progress record is not a plain object') };
  }
  const key = raw.key;
  if (!isNonEmptyString(key)) {
    return { ok: false, failure: fail('missing-required-string', `${path}.key`, 'legacy record key (normalized FEN) is missing/empty') };
  }
  const nums: Record<string, number> = {};
  for (const [f, domain] of LEGACY_NUMERIC_FIELDS) {
    const v = raw[f];
    const failure = validateLegacyNumeric(v, domain, `${path}.${f}`);
    if (failure) return { ok: false, failure };
    nums[f] = v as number;
  }
  const record: CanonicalLegacyRecord = Object.freeze({
    key,
    level: nums.level!,
    nextDueAt: nums.nextDueAt!,
    attempts: nums.attempts!,
    correct: nums.correct!,
    incorrect: nums.incorrect!,
    streak: nums.streak!,
    lastAttemptAt: nums.lastAttemptAt!,
  });
  return { ok: true, record };
}

interface CanonicalMappingEntry {
  readonly legacyKey: string;
  readonly decisionId: string;
  readonly lessonId: string;
  readonly targetRevision: number | null;
  readonly equivalentPositionKeys: readonly string[];
}

function canonicalizeMappingEntry(
  raw: unknown,
  path: string,
): { readonly ok: true; readonly entry: CanonicalMappingEntry } | { readonly ok: false; readonly failure: LegacyMigrationFailure } {
  if (!isPlainObject(raw)) {
    return { ok: false, failure: fail('not-an-object', path, 'mapping entry is not a plain object') };
  }
  if (!isNonEmptyString(raw.legacyKey)) {
    return { ok: false, failure: fail('missing-required-string', `${path}.legacyKey`, 'mapping entry legacyKey is missing/empty') };
  }
  if (!isNonEmptyString(raw.decisionId)) {
    return { ok: false, failure: fail('missing-required-string', `${path}.decisionId`, 'mapping entry decisionId is missing/empty') };
  }
  if (!isNonEmptyString(raw.lessonId)) {
    return { ok: false, failure: fail('missing-required-string', `${path}.lessonId`, 'mapping entry lessonId is missing/empty') };
  }
  let targetRevision: number | null = null;
  if (raw.targetRevision !== undefined) {



    if (!isNonNegativeSafeInteger(raw.targetRevision)) {
      return { ok: false, failure: fail('out-of-domain', `${path}.targetRevision`, `targetRevision, when set, must be a non-negative safe integer (B4 counter domain), got ${safeDiag(raw.targetRevision)}`) };
    }
    targetRevision = raw.targetRevision;
  }
  const equivalentPositionKeys: string[] = [];
  const rawEquiv = raw.equivalentPositionKeys;
  if (rawEquiv !== undefined) {
    if (!Array.isArray(rawEquiv)) {
      return { ok: false, failure: fail('not-an-array', `${path}.equivalentPositionKeys`, 'equivalentPositionKeys, when set, must be an array') };
    }
    for (let i = 0; i < rawEquiv.length; i += 1) {
      const k = rawEquiv[i];
      if (!isNonEmptyString(k)) {
        return { ok: false, failure: fail('missing-required-string', `${path}.equivalentPositionKeys[${i}]`, 'equivalence key must be a non-empty string') };
      }
      equivalentPositionKeys.push(k);
    }
  }
  const entry: CanonicalMappingEntry = Object.freeze({
    legacyKey: raw.legacyKey,
    decisionId: raw.decisionId,
    lessonId: raw.lessonId,
    targetRevision,
    equivalentPositionKeys: Object.freeze(equivalentPositionKeys),
  });
  return { ok: true, entry };
}

// ===========================================================================
// The pure planner
// ===========================================================================

function buildProposal(entry: CanonicalMappingEntry): LegacyEnrollmentProposal {
  return Object.freeze({
    targetId: entry.decisionId,
    lessonId: entry.lessonId,
    targetRevision: entry.targetRevision,
    status: 'active',
    stepIndex: 0,
    cleanStreak: 0,
    lastCompletedAt: null,
    lastAttemptId: null,
    deferredToEnrollment: Object.freeze([
      'scheduleRevision',
      'configId',
      'configVersion',
      'dueAt',
      'enrolledAt',
      'updatedAt',
    ] as const),
    dueAtDerivedFromLegacy: false,
  });
}












function carriesLearnedProgress(r: CanonicalLegacyRecord): boolean {
  return (
    r.level > 0 ||
    r.streak > 0 ||
    r.attempts > 0 ||
    r.correct > 0 ||
    r.incorrect > 0 ||
    r.nextDueAt > 0 ||
    r.lastAttemptAt > 0
  );
}

/**
 * Produce a deterministic migration plan. Pure: no I/O, no `Date.now`, no randomness; the same input
 * yields a byte-identical plan (entries are sorted by `legacyKey`). Zero writes. Every failure is
 * typed (rule 6).
 */
export function planLegacyMigration(rawInput: LegacyMigrationInput): LegacyMigrationPlanResult {






  let input: LegacyMigrationInput;
  try {
    input = structuredClone(rawInput);
  } catch (e) {
    return { ok: false, failure: fail('capture-failed', 'input', `migration input could not be snapshotted (hostile getter / uncloneable value): ${safeDiag(e)}`) };
  }
  if (!isPlainObject(input)) {
    return { ok: false, failure: fail('not-an-object', 'input', 'migration input is not a plain object') };
  }
  const { legacyRecords, mapping, alreadyEnrolledTargetIds, decisionAuthority } = input;

  // --- canonicalize the decision/lesson referential-integrity authority (finding 2) ---------------
  // decisionId -> owning lessonId. The mapping is validated against this: a mapping target must EXIST
  // and its declared lessonId must match the authority's owning lesson before any proposal is emitted.
  if (!isPlainObject(decisionAuthority)) {
    return { ok: false, failure: fail('not-an-object', 'input.decisionAuthority', 'decisionAuthority is required and must be a plain object') };
  }
  if (!Array.isArray(decisionAuthority.decisions)) {
    return { ok: false, failure: fail('not-an-array', 'input.decisionAuthority.decisions', 'decisionAuthority.decisions is not an array') };
  }
  const authorityLessonByDecisionId = new Map<string, string>();
  for (let i = 0; i < decisionAuthority.decisions.length; i += 1) {
    const rawDecision = decisionAuthority.decisions[i];
    const path = `input.decisionAuthority.decisions[${i}]`;
    if (!isPlainObject(rawDecision)) {
      return { ok: false, failure: fail('not-an-object', path, 'authority decision is not a plain object') };
    }
    if (!isNonEmptyString(rawDecision.decisionId)) {
      return { ok: false, failure: fail('missing-required-string', `${path}.decisionId`, 'authority decisionId is missing/empty') };
    }
    if (!isNonEmptyString(rawDecision.lessonId)) {
      return { ok: false, failure: fail('missing-required-string', `${path}.lessonId`, 'authority lessonId is missing/empty') };
    }
    if (authorityLessonByDecisionId.has(rawDecision.decisionId)) {
      return { ok: false, failure: fail('duplicate-identity', `${path}.decisionId`, `duplicate authority decisionId "${safeDiag(rawDecision.decisionId)}" (the decision store's primary key must be unique)`) };
    }
    authorityLessonByDecisionId.set(rawDecision.decisionId, rawDecision.lessonId);
  }

  // --- canonicalize the explicit mapping (authoritative identity source) --------------------------
  if (!isPlainObject(mapping)) {
    return { ok: false, failure: fail('not-an-object', 'input.mapping', 'mapping is not a plain object') };
  }
  if (!Array.isArray(mapping.entries)) {
    return { ok: false, failure: fail('not-an-array', 'input.mapping.entries', 'mapping.entries is not an array') };
  }
  // legacyKey -> mapping entry (authoritative). equivalence key -> set of decision ids (advisory).
  const byLegacyKey = new Map<string, CanonicalMappingEntry>();
  const equivalenceIndex = new Map<string, string[]>();
  // Referential integrity (finding 2): each decisionId may be targeted by AT MOST ONE mapping entry.
  // CHOICE 1 (documented): a two-keys-one-decision collision is a TYPED classification failure that
  // fails the whole plan (`duplicate-identity`), NOT a dedicated "conflict" bucket. Rationale: the
  // mapping is authored upstream (D1) as one authoritative unit; an internally self-contradictory
  // mapping (two legacy keys claiming the same durable decision identity) is a data-integrity defect of
  // the same class as the existing duplicate-legacyKey rejection, and a plan built on a contradictory
  // authority is not trustworthy. Failing fast keeps the plan DETERMINISTIC (a plan is either fully
  // valid or a typed failure — never a partial plan silently dropping conflicted entries) and HONEST
  // (the exact colliding entry + decisionId is surfaced on the typed path). No proposal is emitted.
  const mappedDecisionIds = new Set<string>();
  for (let i = 0; i < mapping.entries.length; i += 1) {
    const res = canonicalizeMappingEntry(mapping.entries[i], `input.mapping.entries[${i}]`);
    if (!res.ok) return { ok: false, failure: res.failure };
    const entry = res.entry;
    if (byLegacyKey.has(entry.legacyKey)) {
      return { ok: false, failure: fail('duplicate-identity', `input.mapping.entries[${i}].legacyKey`, `duplicate mapping legacyKey "${safeDiag(entry.legacyKey)}"`) };
    }
    // Referential integrity: the mapped decision must EXIST in the authority and its declared lessonId
    // must match the authority's owning lesson — a mapping to a nonexistent or mis-attributed decision
    // never produces a proposal (it fails the whole plan).
    const owningLesson = authorityLessonByDecisionId.get(entry.decisionId);
    if (owningLesson === undefined) {
      return { ok: false, failure: fail('unknown-decision', `input.mapping.entries[${i}].decisionId`, `mapping targets decisionId "${safeDiag(entry.decisionId)}" which does not exist in the decision authority`) };
    }
    if (owningLesson !== entry.lessonId) {
      return { ok: false, failure: fail('lesson-mismatch', `input.mapping.entries[${i}].lessonId`, `mapping declares lessonId "${safeDiag(entry.lessonId)}" for decision "${safeDiag(entry.decisionId)}" but the authority's owning lesson is "${safeDiag(owningLesson)}"`) };
    }
    if (mappedDecisionIds.has(entry.decisionId)) {
      return { ok: false, failure: fail('duplicate-identity', `input.mapping.entries[${i}].decisionId`, `decisionId "${safeDiag(entry.decisionId)}" is targeted by more than one mapping entry (at-most-one-mapping-per-decision)`) };
    }
    mappedDecisionIds.add(entry.decisionId);
    byLegacyKey.set(entry.legacyKey, entry);
    for (const eq of entry.equivalentPositionKeys) {
      const list = equivalenceIndex.get(eq);
      if (list) {
        if (!list.includes(entry.decisionId)) list.push(entry.decisionId);
      } else {
        equivalenceIndex.set(eq, [entry.decisionId]);
      }
    }
  }

  // --- canonicalize the already-enrolled set (rerun / partial-apply stability, rule 1) ------------
  if (!Array.isArray(alreadyEnrolledTargetIds)) {
    return { ok: false, failure: fail('not-an-array', 'input.alreadyEnrolledTargetIds', 'alreadyEnrolledTargetIds is not an array') };
  }
  const enrolled = new Set<string>();
  for (let i = 0; i < alreadyEnrolledTargetIds.length; i += 1) {
    const t = alreadyEnrolledTargetIds[i];
    if (!isNonEmptyString(t)) {
      return { ok: false, failure: fail('missing-required-string', `input.alreadyEnrolledTargetIds[${i}]`, 'enrolled target id must be a non-empty string') };
    }
    enrolled.add(t);
  }











  if (!Array.isArray(legacyRecords)) {
    return { ok: false, failure: fail('not-an-array', 'input.legacyRecords', 'legacyRecords is not an array') };
  }
  const entries: LegacyMigrationPlanEntry[] = [];
  const seenKeys = new Set<string>();
  const counts = { exact: 0, ambiguous: 0, archived: 0, reset: 0, alreadyMigrated: 0 };

  for (let i = 0; i < legacyRecords.length; i += 1) {
    const res = canonicalizeLegacyRecord(legacyRecords[i], `input.legacyRecords[${i}]`);
    if (!res.ok) return { ok: false, failure: res.failure };
    const record = res.record;
    if (seenKeys.has(record.key)) {
      return { ok: false, failure: fail('duplicate-identity', `input.legacyRecords[${i}].key`, `duplicate legacy record key "${safeDiag(record.key)}"`) };
    }
    seenKeys.add(record.key);

    const mapped = byLegacyKey.get(record.key);
    if (mapped) {
      // Explicit reviewed-path mapping present → known identity.
      if (enrolled.has(mapped.decisionId)) {
        // Already applied on a previous run: skip so a partial-apply rerun never re-proposes (rule 1).
        entries.push(Object.freeze({ classification: 'already-migrated', legacyKey: record.key, targetId: mapped.decisionId }));
        counts.alreadyMigrated += 1;
      } else if (carriesLearnedProgress(record)) {
        // Mapped but carried learned state that cannot transfer → reset (identity migrates, state dropped).
        entries.push(Object.freeze({
          classification: 'reset',
          legacyKey: record.key,
          proposal: buildProposal(mapped),
          droppedLegacyState: Object.freeze({
            level: record.level,
            nextDueAt: record.nextDueAt,
            attempts: record.attempts,
            correct: record.correct,
            incorrect: record.incorrect,
            streak: record.streak,
            lastAttemptAt: record.lastAttemptAt,
          }),
        }));
        counts.reset += 1;
      } else {
        // Mapped and pristine → lossless exact migration.
        entries.push(Object.freeze({ classification: 'exact', legacyKey: record.key, proposal: buildProposal(mapped) }));
        counts.exact += 1;
      }
    } else {
      // No explicit mapping. FEN/SAN/position-hash equivalence alone can NEVER be exact (rule 2).
      const candidates = equivalenceIndex.get(record.key);
      if (candidates && candidates.length > 0) {
        entries.push(Object.freeze({
          classification: 'ambiguous',
          legacyKey: record.key,
          candidateDecisionIds: Object.freeze([...candidates].sort(compareStrings)),
        }));
        counts.ambiguous += 1;
      } else {
        entries.push(Object.freeze({
          classification: 'archived',
          legacyKey: record.key,
          reason: 'no explicit reviewed-path mapping and no content equivalence to any mapped decision',
        }));
        counts.archived += 1;
      }
    }
  }

  // Deterministic order: sort by legacyKey (byte-stable). Keys are unique (duplicate check above), so
  // the ordering is total and the serialized plan is byte-identical for identical input.
  entries.sort((a, b) => compareStrings(a.legacyKey, b.legacyKey));

  const plan: LegacyMigrationPlan = Object.freeze({
    planVersion: 1,
    counts: Object.freeze({
      exact: counts.exact,
      ambiguous: counts.ambiguous,
      archived: counts.archived,
      reset: counts.reset,
      alreadyMigrated: counts.alreadyMigrated,
    }),
    entries: Object.freeze(entries),
  });
  return { ok: true, plan };
}
