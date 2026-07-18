

































import type { TreeNode, TreePath } from '../../tree/types';
import type {
  BranchRole,
  DecisionTrainability,
  LessonDecision,
} from './material';
import { collectAuthoredPathIds } from './extractLine';

// --- Authored-content layer (the §6 text fields D1's LessonDecision does not carry) ---------

/**
 * The authored text attached to one decision, keyed by its D1 `decisionId`. D1's `LessonDecision`
 * has NO text fields (material.ts:142-150); this record is D2's own model. It references a decision
 * by id and never carries or mutates the D1 identity tuple.
 *
 *   - `instructionalPrompt`  — the recall prompt shown in Learn (the "missing prompts" target of §6.3).
 *   - `hiddenHint`           — optional Learn Hint payload (§6.1).
 *   - `genericDeviation`     — the fallback wrong-move explanation (§6.1).
 *   - `wrongRefutationExplanation` — branch-specific wrong/refutation explanation (§6.1).
 *   - `authoredBranchName` / `recallPromptCue` — the unique-cue material (§6.2). Either serves as the
 *     "unique authored branch name OR recall prompt"; both are free text the author owns and neither
 *     is ever auto-populated from the move's SAN/UCI (cue-safety guardrail, §6.2).
 *
 * Comments / glyphs / arrows / shapes are NOT stored here: they already live on the `TreeNode`
 * (node.comments / node.glyphs / node.shapes) and are authored through the existing Study editors.
 */
export interface AuthoredLessonContent {
  readonly decisionId: string;
  readonly instructionalPrompt?: string;
  readonly hiddenHint?: string;
  readonly genericDeviation?: string;
  readonly wrongRefutationExplanation?: string;
  readonly authoredBranchName?: string;
  readonly recallPromptCue?: string;
}

/** The editable authored-text fields (comments/glyphs/shapes are edited on the tree, not here). */
export type AuthoredTextField =
  | 'instructionalPrompt'
  | 'hiddenHint'
  | 'genericDeviation'
  | 'wrongRefutationExplanation'
  | 'authoredBranchName'
  | 'recallPromptCue';

/** An empty authored-content record keyed to a decision. Note: NO field is seeded from chess
 *  material — the cue-safety guardrail forbids auto-populating a cue from the move (§6.2). */
export function emptyAuthoredContent(decisionId: string): AuthoredLessonContent {
  return { decisionId };
}

/** Fetch the authored content for a decision, or an empty record keyed to it. Pure lookup. */
export function authoredContentFor(
  content: ReadonlyMap<string, AuthoredLessonContent>,
  decisionId: string,
): AuthoredLessonContent {
  return content.get(decisionId) ?? emptyAuthoredContent(decisionId);
}

/**
 * Apply one authored-text field edit. Returns a NEW content record with the SAME `decisionId`
 * (proves D2 never re-mints identity when editing text). An empty/whitespace value clears the field.
 */
export function editAuthoredField(
  content: AuthoredLessonContent,
  field: AuthoredTextField,
  value: string,
): AuthoredLessonContent {
  const trimmed = value.trim();
  // Build on a mutable copy: `AuthoredLessonContent`'s fields are readonly by contract, but the edit
  // op is the one sanctioned place that produces the next immutable snapshot.
  const next: { -readonly [K in keyof AuthoredLessonContent]: AuthoredLessonContent[K] } = { ...content };
  // Normalize away a cleared field so equality/serialization stays clean (no explicit `undefined`).
  if (trimmed) next[field] = trimmed;
  else delete next[field];
  return next;
}

// --- Decision edits (role / trainability / learner side) — identity UNCHANGED ---------------

/** Change a decision's branch role. Returns a NEW decision; `identity` (and `decisionId`,
 *  `authoredPath`) and `evidence` are preserved byte-for-byte (no re-mint, no re-derivation). */
export function editDecisionRole(decision: LessonDecision, role: BranchRole): LessonDecision {
  return { ...decision, role };
}

/** Change a decision's trainability (Required / Optional practice / Reference only / untrainable).
 *  Returns a NEW decision with identity/evidence preserved. */
export function editDecisionTrainability(
  decision: LessonDecision,
  trainability: DecisionTrainability,
): LessonDecision {
  return { ...decision, trainability };
}

/** Change a decision's learner side/orientation. Returns a NEW decision with identity preserved. */
export function editDecisionLearnerSide(
  decision: LessonDecision,
  learnerSide: 'white' | 'black',
): LessonDecision {
  return { ...decision, learnerSide };
}

// --- Scoped readiness validation ("Preview as learner") -------------------------------------

/** The four exact scoped blockers (§6.3 / §5.3). "duplicate labels" and "unreachable targets/broken
 *  authored paths" from the register map onto `duplicate-required-cue` and `unreachable-path`. */
export type LessonBlockerKind =
  | 'missing-recall-prompt'
  | 'unclassified-branch'
  | 'duplicate-required-cue'
  | 'unreachable-path';

/** A direct route to a repair location (§6.3 "a direct route to every repair location"). */
export interface LessonBlockerRoute {
  readonly decisionId: string;
  readonly authoredPath: TreePath;
}

export interface LessonBlocker {
  readonly kind: LessonBlockerKind;
  /** Every decision this blocker routes to. Duplicate-cue blockers name ALL colliding members. */
  readonly routes: readonly LessonBlockerRoute[];
  /** One short, plain-language explanation of the blocker. */
  readonly message: string;
}

export interface ScopeValidationInput {
  /** The scope's decisions (Study / chapter / selection). Only these are evaluated. */
  readonly decisions: readonly LessonDecision[];
  /** Authored content keyed by `decisionId`. Missing entries are treated as empty. */
  readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  /** The canonical tree root, for reachability (`collectAuthoredPathIds`). */
  readonly root: TreeNode;
}

export interface ScopeValidationResult {
  readonly blockers: readonly LessonBlocker[];
  /** True iff this scope has ZERO blockers among its (reachable) decisions — "before that scope
   *  becomes trainable" (§6.2:254). Per-scope: a Study with one blocked chapter still reports its
   *  clean chapters trainable (§5.3:227-228). */
  readonly trainable: boolean;
}

/** The neutral fallback cue permitted ONLY when exactly one Required alternate exists at a position. */
export const NEUTRAL_REQUIRED_CUE = 'Play the required alternate';

function normalizeCue(text: string | undefined): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const NEUTRAL_CUE_NORMALIZED = normalizeCue(NEUTRAL_REQUIRED_CUE);

/** The normalized cue for a decision: authored branch name OR recall-prompt cue (§6.2). Empty when
 *  the author has supplied neither — which is treated as the neutral fallback below. Deliberately
 *  independent of `instructionalPrompt` so the recall prompt (a Required obligation of its own,
 *  blocker #1) and the disambiguating cue stay separately authorable and separately testable. */
function cueOf(content: AuthoredLessonContent | undefined): string {
  return normalizeCue(content?.authoredBranchName || content?.recallPromptCue);
}

/** The effective cue used for duplicate detection: an absent cue collapses to the neutral fallback,
 *  so two Required alternates with no cue at all are (correctly) a duplicate/ambiguous pair. */
function effectiveCue(content: AuthoredLessonContent | undefined): string {
  const cue = cueOf(content);
  return cue === '' ? NEUTRAL_CUE_NORMALIZED : cue;
}

/** The lead-in (shared learner position) path: the authored path minus its final 2-char node id.
 *  Mirrors D1's `leadInPathOf` (material.ts:243-246); grouping by this — NOT by FEN — keeps
 *  transpositions D1 deliberately kept distinct from being merged (blind-spot §7.10). */
function leadInPathOf(authoredPath: TreePath): TreePath {
  return authoredPath.length >= 2 ? authoredPath.slice(0, -2) : '';
}

function isReachable(root: TreeNode, authoredPath: TreePath): boolean {
  return collectAuthoredPathIds(root, authoredPath) !== null;
}

function routeFor(decision: LessonDecision): LessonBlockerRoute {
  return { decisionId: decision.identity.decisionId, authoredPath: decision.identity.authoredPath };
}

/**
 * Validate one scope's readiness ("Preview as learner"). Returns the blocker set (each with a direct
 * route to its repair location) plus per-scope `trainable`. This function is PURE and NON-MUTATING:
 * it inspects roles/trainability/content and reports — it NEVER edits a decision to clear a blocker
 * (§5.3:229 "never silently recasts"). Use `editDecision*` explicitly to resolve a blocker.
 */
export function validateScopeReadiness(input: ScopeValidationInput): ScopeValidationResult {
  const { decisions, content, root } = input;
  const blockers: LessonBlocker[] = [];

  // Partition by reachability. An unresolved authored path is blocker #4; only reachable decisions
  // are evaluated for blockers #1–#3.
  const reachable: LessonDecision[] = [];
  for (const decision of decisions) {
    if (isReachable(root, decision.identity.authoredPath)) {
      reachable.push(decision);
    } else {
      blockers.push({
        kind: 'unreachable-path',
        routes: [routeFor(decision)],
        message: `The authored path for this decision no longer resolves in the tree (${decision.identity.authoredPath || 'root'}).`,
      });
    }
  }

  // Blocker #1 — Missing recall prompt: a Required decision with absent/whitespace instructionalPrompt.
  for (const decision of reachable) {
    if (decision.trainability !== 'required') continue;
    const prompt = content.get(decision.identity.decisionId)?.instructionalPrompt?.trim();
    if (!prompt) {
      blockers.push({
        kind: 'missing-recall-prompt',
        routes: [routeFor(decision)],
        message: 'This Required decision has no recall prompt yet.',
      });
    }
  }

  // Blocker #2 — Unclassified branch: a reachable decision still at the Needs-classification default.
  // The validator ROUTES to it; it does NOT reclassify (§5.3:229).
  for (const decision of reachable) {
    if (decision.role === 'needs-classification') {
      blockers.push({
        kind: 'unclassified-branch',
        routes: [routeFor(decision)],
        message: 'This branch still needs an explicit role before the scope can be trained.',
      });
    }
  }

  // Blocker #3 — Duplicate Required cue: within any learner position with ≥2 Required continuations,
  // fire when two share a cue OR when a member relies on the neutral fallback (allowed only for a
  // lone Required alternate). A group of exactly one Required continuation never fires.
  const requiredByLeadIn = new Map<TreePath, LessonDecision[]>();
  for (const decision of reachable) {
    if (decision.trainability !== 'required') continue;
    const leadIn = leadInPathOf(decision.identity.authoredPath);
    (requiredByLeadIn.get(leadIn) ?? requiredByLeadIn.set(leadIn, []).get(leadIn)!).push(decision);
  }
  for (const group of requiredByLeadIn.values()) {
    if (group.length < 2) continue; // a lone Required alternate may use the neutral fallback (§6.2)
    const offenders = new Map<string, LessonDecision>();
    const byCue = new Map<string, LessonDecision[]>();
    for (const decision of group) {
      const cue = effectiveCue(content.get(decision.identity.decisionId));
      // Any member relying on the neutral fallback is an offender in a ≥2 group.
      if (cue === NEUTRAL_CUE_NORMALIZED) offenders.set(decision.identity.decisionId, decision);
      (byCue.get(cue) ?? byCue.set(cue, []).get(cue)!).push(decision);
    }
    // Any cue shared by ≥2 members makes every one of them an offender.
    for (const members of byCue.values()) {
      if (members.length >= 2) for (const d of members) offenders.set(d.identity.decisionId, d);
    }
    if (offenders.size > 0) {
      blockers.push({
        kind: 'duplicate-required-cue',
        routes: [...offenders.values()].map(routeFor),
        message: 'Multiple Required continuations at this position need unique branch names or recall prompts.',
      });
    }
  }

  return { blockers, trainable: blockers.length === 0 };
}

// --- Multi-scope convenience (makes "blocking only the affected scope" explicit) --------------

export interface LessonScope {
  readonly scopeId: string;
  readonly decisions: readonly LessonDecision[];
}

/**
 * Validate several scopes independently and return a per-scope result map. This is the concrete
 * expression of "blocking only the affected scope" (P2-ORP-15:1128): a blocked chapter never taints
 * a clean sibling chapter's `trainable`.
 */
export function validateScopes(
  scopes: readonly LessonScope[],
  content: ReadonlyMap<string, AuthoredLessonContent>,
  root: TreeNode,
): Map<string, ScopeValidationResult> {
  const results = new Map<string, ScopeValidationResult>();
  for (const scope of scopes) {
    results.set(scope.scopeId, validateScopeReadiness({ decisions: scope.decisions, content, root }));
  }
  return results;
}

// --- Cue-safety guardrail (review criterion, NOT an auto-clearing blocker) --------------------

/**
 * True when a cue would leak the solution — it contains the move's SAN, UCI, or destination square.
 * This is a REVIEW criterion surfaced to the author (§6.2:256-257), not a runtime blocker: the
 * author owns the cue text, and D2 never auto-populates it from the move. Callers may warn on this;
 * `validateScopeReadiness` deliberately does not treat it as a scope blocker.
 */
export function cueLeaksMove(cue: string | undefined, san: string, uci: string): boolean {
  const normalized = normalizeCue(cue);
  if (!normalized) return false;
  const dest = uci.length >= 4 ? uci.slice(2, 4).toLowerCase() : '';
  const tokens = normalized.split(/\s+/);
  const needles = [san.toLowerCase(), uci.toLowerCase()].filter(Boolean);
  if (needles.some((needle) => normalized.includes(needle))) return true;
  return Boolean(dest) && tokens.includes(dest);
}
