















// --- Values and layers --------------------------------------------------------

/** The closed v1 settable field set. */
export interface OrpSettingsValues {
  /** SRS interval ladder, milliseconds per step. */
  readonly intervals: readonly number[];
  /** New lines introduced per Learn session. */
  readonly newPerSession: number;
  /** Due targets per Review session. */
  readonly duePerSession: number;
  readonly moveFeedback: boolean;
  readonly hints: boolean;
  /** Default Engine Drill difficulty request. */
  readonly drillDifficulty: string;
}

export type OrpSettingsField = keyof OrpSettingsValues;

export const ORP_SETTINGS_FIELDS: readonly OrpSettingsField[] = [
  'intervals', 'newPerSession', 'duePerSession', 'moveFeedback', 'hints', 'drillDifficulty',
] as const;

/** Matches the shipped ORP_DEFAULT_LADDER (dueReviewHost) so resolution starts from live truth. */
export const ORP_DEFAULT_SETTINGS: OrpSettingsValues = {
  intervals: [
    4 * 3600_000, 24 * 3600_000, 3 * 86_400_000, 7 * 86_400_000,
    14 * 86_400_000, 30 * 86_400_000, 90 * 86_400_000, 180 * 86_400_000,
  ],
  newPerSession: 5,
  duePerSession: 20,
  moveFeedback: true,
  hints: true,
  drillDifficulty: 'casual',
};

/** A layer holds ONLY explicitly-set fields — absent = inherited. */
export type OrpSettingsLayer = Partial<OrpSettingsValues>;

/** Session overrides expire (§10). Expiry is judged by comparison to the caller's `now`. */
export interface OrpSessionOverride {
  readonly values: OrpSettingsLayer;
  readonly expiresAt: number;
}

/** Which layer a resolved field came from, for the D20 UI's scope legibility. */
export type OrpSettingsProvenance = Readonly<Record<OrpSettingsField, 'global' | 'study' | 'session'>>;

export interface ResolvedOrpSettings {
  readonly values: OrpSettingsValues;
  readonly provenance: OrpSettingsProvenance;
}

// --- Resolution ---------------------------------------------------------------

export function resolveOrpSettings(
  global: OrpSettingsValues,
  studyOverride: OrpSettingsLayer | undefined,
  session: OrpSessionOverride | undefined,
  now: number,
): ResolvedOrpSettings {
  const sessionValues: OrpSettingsLayer =
    session !== undefined && session.expiresAt > now ? session.values : {};
  const values = {} as { -readonly [K in OrpSettingsField]: OrpSettingsValues[K] };
  const provenance = {} as { -readonly [K in OrpSettingsField]: 'global' | 'study' | 'session' };
  for (const field of ORP_SETTINGS_FIELDS) {
    if (sessionValues[field] !== undefined) {
      (values as Record<string, unknown>)[field] = sessionValues[field];
      provenance[field] = 'session';
    } else if (studyOverride !== undefined && studyOverride[field] !== undefined) {
      (values as Record<string, unknown>)[field] = studyOverride[field];
      provenance[field] = 'study';
    } else {
      (values as Record<string, unknown>)[field] = global[field];
      provenance[field] = 'global';
    }
  }
  return { values: values as OrpSettingsValues, provenance };
}

// --- Writers (pure — return new layers) ---------------------------------------

/** "Save only for this Study": sets ONE field explicitly; every other field keeps inheriting. */
export function withStudyOverride<K extends OrpSettingsField>(
  layer: OrpSettingsLayer,
  field: K,
  value: OrpSettingsValues[K],
): OrpSettingsLayer {
  return { ...layer, [field]: value };
}

/** "Reset to inherited": removes the Study override so the global default flows through again. */
export function resetToInherited(layer: OrpSettingsLayer, field: OrpSettingsField): OrpSettingsLayer {
  const { [field]: _removed, ...rest } = layer;
  return rest;
}

/** "Save as ORP defaults": updates global defaults (full-value object — globals have no holes). */
export function withGlobalDefaults(
  global: OrpSettingsValues,
  changes: OrpSettingsLayer,
): OrpSettingsValues {
  return { ...global, ...changes };
}

export function makeSessionOverride(
  values: OrpSettingsLayer,
  now: number,
  ttlMs: number,
): OrpSessionOverride {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('session override ttlMs must be positive');
  return { values, expiresAt: now + ttlMs };
}

/**
 * The CONFIRMED bulk action (§10): wholesale replacement of a Study's override layer. Requires
 * the literal confirm token so no ordinary save path can reach it by accident; the per-field
 * writers above are the only other mutators and cannot express a bulk replacement.
 */
export function replaceAllStudyOverrides(
  newLayer: OrpSettingsLayer,
  confirm: { readonly confirmed: true },
): OrpSettingsLayer {
  if (confirm.confirmed !== true) throw new Error('bulk override replacement requires explicit confirmation');
  return { ...newLayer };
}

// --- Previewed interval recompute (§10) ---------------------------------------

export interface RecomputeInputRow {
  readonly targetId: string;
  readonly status: string;
  /** 0-based ladder step the row currently sits at. */
  readonly step: number;
  readonly dueAt: number;
}

export interface RecomputePlanEntry {
  readonly targetId: string;
  readonly oldDueAt: number;
  readonly newDueAt: number;
}

export interface IntervalRecomputePlan {
  readonly entries: readonly RecomputePlanEntry[];
  readonly skippedInactive: number;
}

function intervalAt(intervals: readonly number[], step: number): number {
  if (intervals.length === 0) return 0;
  const clamped = Math.min(Math.max(step, 0), intervals.length - 1);
  return intervals[clamped]!;
}

/**
 * Build the PREVIEW for moving existing due dates onto a new ladder. Exact re-anchoring: each
 * active row's implied last-review anchor is `dueAt − oldInterval(step)`; the new due date is
 * `anchor + newInterval(step)` (steps clamped into each ladder). Inactive rows are skipped and
 * counted. This function never applies anything — the plan is the §10 "separate previewed
 * recomputation action" payload.
 */
export function planIntervalRecompute(
  rows: readonly RecomputeInputRow[],
  oldIntervals: readonly number[],
  newIntervals: readonly number[],
): IntervalRecomputePlan {
  const entries: RecomputePlanEntry[] = [];
  let skippedInactive = 0;
  for (const row of rows) {
    if (row.status !== 'active') { skippedInactive++; continue; }
    const anchor = row.dueAt - intervalAt(oldIntervals, row.step);
    entries.push({
      targetId: row.targetId,
      oldDueAt: row.dueAt,
      newDueAt: anchor + intervalAt(newIntervals, row.step),
    });
  }
  return { entries, skippedInactive };
}
