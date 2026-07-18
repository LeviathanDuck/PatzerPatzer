


































import type { TreeNode, TreePath, Uci } from '../../tree/types';
import {
  deriveLessonDecisions,
  defaultTrainability,
  type DecisionTrainability,
  type LessonDecision,
  type LessonSourceKind,
} from './material';
import { isUsableSourceRevision } from './linkedSource';
import type { SrsScheduleRecord, SrsAttemptRecord } from './srsTypes';
import type { LocalAuthoredProvenance, SourceImportedProvenance } from '../types';
// Type-only import of D4's producer output. A VALUE import would create a module cycle
// (studyDb → linkedStudyMerge → lichessLibrary → studyDb); a type import is erased at build time.
import type { ResolvedVerifiedSource, ResolvedChapter } from './lichessLibrary';

// --- Identity keys (reuse D1's discipline; NEVER FEN) ----------------------------------------------
//
// D1's `continuityKey`/`leadInPathOf` are module-private in material.ts (a no-touch reuse target), so
// the exact formulae are replicated here with a source reference. Two decisions MATCH only when
// authored path AND expected move agree — deliberately NOT FEN: a transposition reaching the same FEN by
// a different authored path has a different key and stays DISTINCT (material.ts:239-241; P2-ORP-17).

/** The identity-continuity key: authored path + expected move (mirrors material.ts:239-241). */
export function continuityKey(authoredPath: TreePath, uci: Uci): string {
  return `${authoredPath} ${uci}`;
}

/** The lead-in (parent-position) path: the authored path minus its final 2-char node id
 *  (mirrors material.ts:244-246). */
function leadInPathOf(authoredPath: TreePath): TreePath {
  return authoredPath.length >= 2 ? authoredPath.slice(0, -2) : '';
}

function keyOf(decision: LessonDecision): string {
  return continuityKey(decision.identity.authoredPath, decision.evidence.uci);
}

// --- Presentation digest — the unchanged-vs-presentation-only signal -------------------------------
//
// D1's `LessonDecision` carries identity/role/evidence but NOT annotations, so distinguishing
// "unchanged" from "presentation-only-change" needs a presentation fingerprint per authored decision.
// A `SourceSnapshot` therefore pairs the derived decisions with a `presentationByKey` digest map. The
// digest is derived purely from the tree node's presentation fields (glyphs/nags/comments/shapes) — it
// never influences identity (which stays authored-path + move).

function stableComments(node: TreeNode): string[] {
  return (node.comments ?? []).map((c) => c.text);
}

function presentationDigestFor(node: TreeNode): string {
  return JSON.stringify({
    glyphs: (node.glyphs ?? []).map((g) => g.id),
    nags: node.nags ?? [],
    comments: stableComments(node),
    shapes: (node.shapes ?? []).map((s) => ({ orig: s.orig, dest: s.dest ?? null, brush: s.brush ?? null })),
  });
}

/** Walk a chapter tree collecting a presentation digest for every authored move node, keyed by the
 *  same continuity key D1 uses. Mirrors D1's `collectRawDecisions` walk (material.ts:254-272) for path
 *  construction so the digest keys line up with the derived decisions' keys. */
function collectPresentationDigests(root: TreeNode, out: Map<string, string>): void {
  const walk = (node: TreeNode, path: TreePath): void => {
    node.children.forEach((child) => {
      const childPath = path + child.id;
      if (child.uci && child.san) {
        out.set(continuityKey(childPath, child.uci), presentationDigestFor(child));
      }
      walk(child, childPath);
    });
  };
  walk(root, '');
}

// --- Snapshot leg (baseline R0 / incoming R1) ------------------------------------------------------

/**
 * A source snapshot leg: the derived decision set PLUS the per-key presentation digest. The baseline
 * (R0) is INJECTED as this shape (durable persistence deferred to D15); the incoming (R1) is built from
 * D4's `ResolvedVerifiedSource` via `snapshotFromChapters`.
 */
export interface SourceSnapshot {
  readonly decisions: readonly LessonDecision[];
  /** continuityKey → presentation digest. */
  readonly presentationByKey: ReadonlyMap<string, string>;
}

/** Config for deriving a source snapshot from chapters — mirrors D1's `DeriveDecisionsOptions` minus
 *  the tree and `previous` (both supplied per call). */
export interface MergeDeriveConfig {
  readonly lessonId: string;
  readonly chapterId?: string;
  readonly sourceKind: LessonSourceKind;
  readonly learnerSide: 'white' | 'black';
  readonly sourceLineageId?: string;
  readonly sourceRevision?: number;
  /** Identity minter (injected so a "new"/"changed" decision's id provably comes from the mint, not the
   *  content). Forwarded to D1's `deriveLessonDecisions`. */
  readonly mintId?: () => string;
}








export function snapshotFromChapters(
  chapters: readonly ResolvedChapter[],
  config: MergeDeriveConfig,
  previous?: readonly LessonDecision[],
): SourceSnapshot {
  const decisions: LessonDecision[] = [];
  const presentationByKey = new Map<string, string>();
  for (const chapter of chapters) {
    const model = deriveLessonDecisions(chapter.tree, {
      lessonId: config.lessonId,
      sourceKind: config.sourceKind,
      learnerSide: config.learnerSide,
      ...(config.chapterId !== undefined ? { chapterId: config.chapterId } : {}),
      ...(config.sourceLineageId !== undefined ? { sourceLineageId: config.sourceLineageId } : {}),
      ...(config.sourceRevision !== undefined ? { sourceRevision: config.sourceRevision } : {}),
      ...(config.mintId !== undefined ? { mintId: config.mintId } : {}),
      ...(previous !== undefined ? { previous } : {}),
    });
    decisions.push(...model.decisions);
    collectPresentationDigests(chapter.tree, presentationByKey);
  }
  return { decisions, presentationByKey };
}

// --- Local leg (current Study + user-owned layers) -------------------------------------------------

/**
 * The current-local overlay for one decision, keyed by its durable `decisionId`. Carries the SRS row
 * and immutable attempt history the merge must PROTECT (never mutate an attempt, never delete a row).
 * Assembled by studyDb.ts read-helpers from EXISTING rows; the merge attaches it to a class by matching
 * `decisionId` against the baseline (which carries both `decisionId` and the continuity key), so the
 * join stays identity-based and FEN-free.
 */
export interface LocalDecisionState {
  readonly decisionId: string;
  /** Decision-row lifecycle status (freeform), if the row exists. */
  readonly status?: string;
  readonly srs?: SrsScheduleRecord;
  readonly attempts?: readonly SrsAttemptRecord[];
}

/**
 * The "current local Study + user-owned layers" leg. Carries the protected StudyItem overlays
 * (`notes`, `localProvenanceLayers`, `linkedSourceProvenance`) that a source stamp must never clobber
 * plus the per-decision overlays keyed by `decisionId`.
 */
export interface LocalMergeState {
  readonly studyItemId: string;
  readonly lessonId: string;
  readonly decisions: readonly LocalDecisionState[];
  readonly notes?: string;
  readonly localProvenanceLayers?: readonly LocalAuthoredProvenance[];
  readonly linkedSourceProvenance?: SourceImportedProvenance;
}

// --- MergePlan classes (the closed 6-class set) ----------------------------------------------------

/**
 * The closed classification set. Every affected decision falls into exactly one class; there is NO
 * "apply the rest silently" bucket. A decision that exists ONLY locally (in neither baseline nor
 * incoming — user-authored) is deliberately NOT emitted at all: it is protected by OMISSION, since
 * `applyAcceptedMerge` only ever acts on emitted entries ("never delete local material").
 */
export type MergeClass =
  | 'unchanged'
  | 'presentation-only-change'
  | 'expected-move-or-path-change'
  | 'removed'
  | 'new-in-source'
  | 'ambiguous';

/**
 * One inert classification. Records the incoming/baseline decisions and the local overlay to protect so
 * the gated apply can carry My-notes/SRS/attempts forward verbatim. `side` disambiguates the two halves
 * of a rewrite/split/merge; `replacementDecisionId` is the fresh, `untrainable` id an
 * `expected-move-or-path-change` mints for the replacement (already minted by D1's derive — never a
 * copy of the archived id, never a heuristic mastery carry).
 */
export interface MergePlanEntry {
  readonly cls: MergeClass;
  readonly continuityKey: string;
  readonly leadIn?: TreePath;
  readonly side?: 'removed' | 'added';
  readonly incoming?: LessonDecision;
  readonly baseline?: LessonDecision;
  readonly local?: LocalDecisionState;
  /** Fresh minted id for the replacement decision (untrainable); present on `expected-move-or-path-change`
   *  added-side and mirrored on the archived-side entry for linkage. */
  readonly replacementDecisionId?: string;
  /** Trainability the replacement/new decision is created with — always the role-safe `untrainable`
   *  default; never a transferred `required`. */
  readonly newTrainability?: DecisionTrainability;
}

/** Why a plan is fail-closed (no per-decision apply): the required baseline leg is missing, or the
 *  incoming revision is not a usable finite integer. Fail-closed routes to explicit update review — it
 *  NEVER falls back to a two-way local-vs-incoming diff that could overwrite local edits (§8 risk 6). */
export type MergeFailClosedReason = 'missing-baseline' | 'unusable-revision';

/**
 * The inert merge plan — a PROPOSAL. It mutates nothing; `applyAcceptedMerge` (studyDb.ts) applies it
 * only when explicitly accepted, never automatically.
 */
export interface MergePlan {
  readonly studyItemId: string;
  readonly lessonId: string;
  readonly sourceLineageId: string;
  /** The validated finite incoming revision this plan is keyed to (dismissal keys on this exact value). */
  readonly sourceRevision: number | null;
  /** The ONLY layer a source update authors — assembled from the incoming source (never a My-* layer). */
  readonly incomingProvenance: SourceImportedProvenance;
  readonly entries: readonly MergePlanEntry[];
  /** Present ⇒ the whole update is routed to explicit review; apply performs no per-decision mutation. */
  readonly failClosed?: MergeFailClosedReason;
}

// --- Provenance assembly (inline; avoids a lichessLibrary value-import cycle) -----------------------

/** Assemble the source-imported provenance layer from a resolved source. Trivial pure assembly of
 *  already-produced values (mirrors D4's `toSourceImportedProvenance`, reproduced here so this pure
 *  module needs no VALUE import from lichessLibrary — which would form a studyDb import cycle). */
function provenanceFromIncoming(incoming: ResolvedVerifiedSource): SourceImportedProvenance {
  return {
    layer: 'source-imported',
    sourceLineageId: incoming.sourceLineageId,
    version: incoming.version,
    ...(incoming.source !== undefined ? { source: incoming.source } : {}),
    linkedAt: incoming.fetchedAt,
  };
}

// --- The three-way producer ------------------------------------------------------------------------

export interface ProduceMergePlanInput {
  /** R0 last-imported baseline snapshot — REQUIRED (injected). `null` ⇒ fail-closed to update review. */
  readonly baseline: SourceSnapshot | null;
  /** R1 latest incoming snapshot (D4's producer output). */
  readonly incoming: ResolvedVerifiedSource;
  /** Current local Study + user-owned layers. */
  readonly local: LocalMergeState;
  /** Derivation config for turning the incoming chapters into decisions (mint injected in tests). */
  readonly deriveConfig: MergeDeriveConfig;
}

interface LeadInGroup {
  readonly removed: LessonDecision[]; // baseline keys absent from incoming, grouped by lead-in
  readonly added: LessonDecision[];   // incoming keys absent from baseline, grouped by lead-in
}

/**
 * Produce the inert three-way merge plan. Compares the baseline (R0), incoming (R1), and current-local
 * legs, matching decisions by `continuityKey` (authored path + move) — NEVER FEN. Reuses D1's
 * `deriveLessonDecisions` (via `snapshotFromChapters`) for the incoming derivation so identity is
 * carried forward on unchanged material and fresh ids are minted for new/changed decisions. Writes
 * NOTHING — the plan is a proposal applied later, and only on explicit acceptance.
 */
export function produceMergePlan(input: ProduceMergePlanInput): MergePlan {
  const { baseline, incoming, local, deriveConfig } = input;
  const incomingProvenance = provenanceFromIncoming(incoming);

  // Fail-closed guards (§8 risks 6, 8). A missing baseline or a non-finite incoming revision routes the
  // WHOLE update to explicit review rather than degrading to a two-way diff that could overwrite local
  // edits. No per-decision entry is emitted, so apply mutates nothing (beyond, on accept, the provenance
  // stamp the caller opts into).
  if (baseline === null) {
    return {
      studyItemId: local.studyItemId,
      lessonId: local.lessonId,
      sourceLineageId: incoming.sourceLineageId,
      sourceRevision: isUsableSourceRevision(incoming.sourceRevision) ? incoming.sourceRevision : null,
      incomingProvenance,
      entries: [],
      failClosed: 'missing-baseline',
    };
  }
  if (!isUsableSourceRevision(incoming.sourceRevision)) {
    return {
      studyItemId: local.studyItemId,
      lessonId: local.lessonId,
      sourceLineageId: incoming.sourceLineageId,
      sourceRevision: null,
      incomingProvenance,
      entries: [],
      failClosed: 'unusable-revision',
    };
  }

  // Derive the incoming decisions, carrying baseline identity forward (unchanged → same id; new/changed
  // → freshly minted by D1). This is the source→source delta reuse (§2.2).
  const incomingSnapshot = snapshotFromChapters(incoming.chapters, deriveConfig, baseline.decisions);

  const baseByKey = new Map<string, LessonDecision>();
  for (const d of baseline.decisions) baseByKey.set(keyOf(d), d);
  const incByKey = new Map<string, LessonDecision>();
  for (const d of incomingSnapshot.decisions) incByKey.set(keyOf(d), d);

  // Local overlay is joined by decisionId; baseline carries both decisionId and the continuity key, so a
  // local decision attaches to a class via its baseline counterpart's id (identity-based, FEN-free).
  const localById = new Map<string, LocalDecisionState>();
  for (const l of local.decisions) localById.set(l.decisionId, l);
  const localFor = (decision: LessonDecision | undefined): LocalDecisionState | undefined =>
    decision ? localById.get(decision.identity.decisionId) : undefined;

  const entries: MergePlanEntry[] = [];

  // 1) Keys present in BOTH baseline and incoming → unchanged or presentation-only (identity carried).
  for (const [key, baseDecision] of baseByKey) {
    const incDecision = incByKey.get(key);
    if (!incDecision) continue; // handled by the removed/replacement pass below
    const baseDigest = baseline.presentationByKey.get(key);
    const incDigest = incomingSnapshot.presentationByKey.get(key);
    const cls: MergeClass = baseDigest === incDigest ? 'unchanged' : 'presentation-only-change';
    const local = localFor(baseDecision);
    entries.push({
      cls,
      continuityKey: key,
      baseline: baseDecision,
      incoming: incDecision,
      ...(local !== undefined ? { local } : {}),
    });
  }

  // 2) Group the source delta by lead-in position to distinguish rewrite (1:1) from split/merge (n:m).
  const groups = new Map<TreePath, LeadInGroup>();
  const groupFor = (leadIn: TreePath): LeadInGroup => {
    let g = groups.get(leadIn);
    if (!g) { g = { removed: [], added: [] }; groups.set(leadIn, g); }
    return g;
  };
  for (const [key, baseDecision] of baseByKey) {
    if (!incByKey.has(key)) groupFor(leadInPathOf(baseDecision.identity.authoredPath)).removed.push(baseDecision);
  }
  for (const [key, incDecision] of incByKey) {
    if (!baseByKey.has(key)) groupFor(leadInPathOf(incDecision.identity.authoredPath)).added.push(incDecision);
  }

  // 3) Classify each lead-in group.
  for (const [leadIn, g] of groups) {
    const r = g.removed.length;
    const a = g.added.length;
    if (r >= 1 && a >= 1 && r === 1 && a === 1) {
      // Exactly one removed + one added at the same lead-in → a changed expected move / authored path.
      // Mint a NEW decision (D1 already minted the incoming's id) + archive the replaced one — append-
      // only, ZERO mastery transfer (P2-ORP-18 "creates a new decision and archives the replaced
      // history"; P2-ORP-17 no heuristic inheritance).
      const removed = g.removed[0]!;
      const added = g.added[0]!;
      const local = localFor(removed);
      const replacementDecisionId = added.identity.decisionId;
      entries.push({
        cls: 'expected-move-or-path-change',
        continuityKey: keyOf(removed),
        leadIn,
        side: 'removed',
        baseline: removed,
        ...(local !== undefined ? { local } : {}),
        replacementDecisionId,
      });
      entries.push({
        cls: 'expected-move-or-path-change',
        continuityKey: keyOf(added),
        leadIn,
        side: 'added',
        incoming: added,
        replacementDecisionId,
        newTrainability: defaultTrainability(),
      });
    } else if (r >= 1 && a >= 1) {
      // Split (1→n), merge (n→1), or reshaped (n→m) → explicit update review, NO mastery mapping onto
      // any new id (P2-ORP-17). Removed-side locals suspend + preserve; added-side are offered only.
      for (const removed of g.removed) {
        const local = localFor(removed);
        entries.push({
          cls: 'ambiguous',
          continuityKey: keyOf(removed),
          leadIn,
          side: 'removed',
          baseline: removed,
          ...(local !== undefined ? { local } : {}),
        });
      }
      for (const added of g.added) {
        entries.push({
          cls: 'ambiguous',
          continuityKey: keyOf(added),
          leadIn,
          side: 'added',
          incoming: added,
          newTrainability: defaultTrainability(),
        });
      }
    } else if (r >= 1) {
      // Pure removal (no replacement at the lead-in) → Unmatched Material, training suspended, notes/
      // history preserved, NO delete (P2-ORP-18).
      for (const removed of g.removed) {
        const local = localFor(removed);
        entries.push({
          cls: 'removed',
          continuityKey: keyOf(removed),
          leadIn,
          side: 'removed',
          baseline: removed,
          ...(local !== undefined ? { local } : {}),
        });
      }
    } else {
      // Purely added at this lead-in → new-in-source: offered as fresh, untrainable, not auto-enrolled.
      for (const added of g.added) {
        entries.push({
          cls: 'new-in-source',
          continuityKey: keyOf(added),
          leadIn,
          side: 'added',
          incoming: added,
          newTrainability: defaultTrainability(),
        });
      }
    }
  }

  return {
    studyItemId: local.studyItemId,
    lessonId: local.lessonId,
    sourceLineageId: incoming.sourceLineageId,
    sourceRevision: incoming.sourceRevision,
    incomingProvenance,
    entries,
  };
}

// --- Non-blocking lifecycle — pure snooze / dismiss predicates -------------------------------------
//
// P2-ORP-18: "Updates are non-blocking and may be deferred, snoozed 7/30 days, or dismissed for the
// exact source version." This is the inert lifecycle STATE SHAPE + pure predicates; durable persistence
// of the state is DEFERRED to D15 (Option A). Dismissal keys on `(sourceLineageId, exact finite
// sourceRevision)` — a dismissal for R1 never covers a later R2.

/** Snooze duration presets (7 / 30 days), in ms. */
export const SNOOZE_7D_MS = 7 * 24 * 60 * 60 * 1000;
export const SNOOZE_30D_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Inert per-lineage lifecycle state. `dismissedRevisions` are the EXACT finite revisions dismissed;
 * `snoozedUntil` is an epoch-ms suppression deadline (null/undefined ⇒ not snoozed).
 */
export interface LinkedUpdateLifecycleState {
  readonly sourceLineageId: string;
  readonly dismissedRevisions?: readonly number[];
  readonly snoozedUntil?: number | null;
}

/**
 * True iff this lineage's update at EXACTLY this revision was dismissed. Fail-closed on a non-finite
 * revision (never treated as dismissed) and lineage-scoped (a dismissal for another lineage never
 * applies). A dismissal for R1 does NOT cover R2 — the revision must match exactly.
 */
export function isDismissedForRevision(
  state: LinkedUpdateLifecycleState,
  sourceLineageId: string,
  revision: number,
): boolean {
  if (state.sourceLineageId !== sourceLineageId) return false;
  if (!isUsableSourceRevision(revision)) return false;
  return (state.dismissedRevisions ?? []).includes(revision);
}

/** True iff a snooze is currently active (suppression deadline strictly in the future). A past or
 *  absent `snoozedUntil` does not suppress. */
export function isSnoozeActive(state: LinkedUpdateLifecycleState, now: number): boolean {
  const until = state.snoozedUntil;
  return typeof until === 'number' && Number.isFinite(until) && until > now;
}

/**
 * Convenience: whether a fresh update for `(lineage, revision)` should SURFACE now — i.e. the revision
 * is usable, not dismissed for that exact revision, and not currently snoozed. Pure; surfacing/acting is
 * UI (D5/D12), out of D6.
 */
export function shouldSurfaceUpdate(
  state: LinkedUpdateLifecycleState,
  sourceLineageId: string,
  revision: number,
  now: number,
): boolean {
  if (!isUsableSourceRevision(revision)) return false;
  if (isDismissedForRevision(state, sourceLineageId, revision)) return false;
  if (isSnoozeActive(state, now)) return false;
  return true;
}

// --- Acceptance gate -------------------------------------------------------------------------------
//
// The apply path (studyDb.ts `applyAcceptedMerge`) accepts ONLY an `AcceptedMergePlan`, an explicit
// owner-acceptance wrapper minted here. This makes "no silent apply" structural: a bare `produceMergePlan`
// output cannot be applied — the owner (via D5/D12 UI, later) must explicitly accept it first.

const acceptedBrand: unique symbol = Symbol('AcceptedMergePlan');

/** An explicitly owner-accepted plan. Unforgeable outside this module (the brand key is not exported),
 *  so `applyAcceptedMerge` cannot be handed anything but a plan that passed `acceptMergePlan`. */
export interface AcceptedMergePlan {
  readonly [acceptedBrand]: true;
  readonly plan: MergePlan;
}

/**
 * Wrap a plan as owner-accepted. This is the ONLY constructor of `AcceptedMergePlan`; calling it is the
 * explicit accept action the apply path gates on. A fail-closed plan cannot be accepted (its whole
 * update belongs in review, not apply).
 */
export function acceptMergePlan(plan: MergePlan): AcceptedMergePlan {
  if (plan.failClosed !== undefined) {
    throw new Error(`acceptMergePlan: a fail-closed plan (${plan.failClosed}) cannot be accepted; it routes to update review`);
  }
  return { [acceptedBrand]: true, plan };
}

/** Read the plan out of an accepted wrapper (the apply path's sole entry into the plan). */
export function acceptedPlan(accepted: AcceptedMergePlan): MergePlan {
  return accepted.plan;
}
