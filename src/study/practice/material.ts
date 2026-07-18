















































import type { Fen, San, TreeNode, TreePath, Uci } from '../../tree/types';
import { collectAuthoredPathIds, extractVariationLine } from './extractLine';
import type { TrainableSequence } from '../types';

// --- Roles (P2-ORP-8 amendment: a closed set of five explicit roles) --------

/**
 * The five explicit branch roles. This is the complete closed set — no other role exists and no
 * importer may invent one. `accepted-alternate` is an AUTHORED classification only; it is NEVER an
 * import default (that is the exact `variation = accepted` inversion the Do-not-preserve rows forbid).
 */
export type BranchRole =
  | 'mainline-correct'
  | 'accepted-alternate'
  | 'wrong-refutation'
  | 'reference-only'
  | 'needs-classification';

/** The closed set, ordered for display/enumeration. */
export const BRANCH_ROLES: readonly BranchRole[] = [
  'mainline-correct',
  'accepted-alternate',
  'wrong-refutation',
  'reference-only',
  'needs-classification',
] as const;

/**
 * Trainability is SEPARATE from role (P2-ORP-8 amendment: "Accepted branches separately declare
 * Required, Optional practice, or Reference only"). Only `required` decisions block course coverage
 * or auto-enroll in SRS (contract §5.2). `untrainable` is the role-safe import default for every
 * derived decision — nothing becomes trainable until an author (D2) explicitly declares it.
 */
export type DecisionTrainability =
  | 'required'
  | 'optional-practice'
  | 'reference-only'
  | 'untrainable';

/**
 * The origin kind of the imported material, used ONLY to pick a role-safe default for side branches.
 * Recognized Gamebook / Interactive-Lesson side branches default to Wrong/refutation; ordinary PGN
 * side branches default to Needs classification (P2-ORP-8 amendment). This is a derivation input, not
 * a chess-content signal — D1 does not sniff the tree to guess it.
 */
export type LessonSourceKind = 'pgn' | 'gamebook' | 'interactive-lesson';

// --- Evidence vs identity ---------------------------------------------------

/**
 * Chess EVIDENCE for a decision — used for board restoration and display, NEVER for identity.
 * P2-ORP-17: "FEN and expected move are evidence, never sufficient identity." Two decisions may
 * share identical evidence (a transposition or a repeated position) and remain distinct decisions.
 */
export interface DecisionEvidence {
  readonly fen: Fen;
  readonly uci: Uci;
  readonly san: San;
  readonly ply: number;
}

/**
 * The identity tuple for one authored decision (contract §5.1). The `decisionId` is the identity;
 * every other field is an attribute that DESCRIBES the decision without being sufficient to identify
 * it. `authoredPath` is the exact authored node-id path (a `TreePath`) — it is an attribute, not a
 * hash source: the UUID is minted independently of it.
 */
export interface LessonDecisionIdentity {
  /**
   * Durable UUID, minted at authoring/derivation time — NEVER chess-content-derived (not a hash of
   * FEN/SAN/UCI/path/line). Equal to StudyPracticeDecisionRow.decisionId and B1's SRS `targetId`.
   * Stability across re-derivation comes from carrying prior identities forward by matching authored
   * path + expected move (see `deriveLessonDecisions`), NOT from deriving the id from content.
   */
  readonly decisionId: string;
  /** Query/scope foreign key to the owning lesson (chapter/start identity, part 1). */
  readonly lessonId: string;
  /** Chapter identity within the lesson, where known (chapter/start identity, part 2). */
  readonly chapterId?: string;
  /** Exact authored move path (concatenated 2-char tree node ids) — an identity ATTRIBUTE. */
  readonly authoredPath: TreePath;
  /** Source lineage grouping key, where the material is linked (attribute; §5.1). */
  readonly sourceLineageId?: string;
  /** Source snapshot revision, where linked (attribute; §5.1). */
  readonly sourceRevision?: number;
}

/**
 * The canonical decision VIEW over one authored branch of a `TreeNode` graph. This is metadata KEYED
 * to a tree node/path — it is NOT a copy of the moves, and it is NOT a flat lesson store. The
 * canonical lesson structure remains the branching `TreeNode` graph; this view attaches identity,
 * role, and trainability to authored decisions within it.
 */
export interface LessonDecision {
  readonly identity: LessonDecisionIdentity;
  readonly role: BranchRole;
  readonly trainability: DecisionTrainability;
  /** Learner side/orientation for this decision (§5.1 identity tuple). */
  readonly learnerSide: 'white' | 'black';
  /** Chess evidence — board restoration/display only, never identity. */
  readonly evidence: DecisionEvidence;
}

/**
 * Options for deriving the decision model from a canonical tree.
 */
export interface DeriveDecisionsOptions {
  readonly lessonId: string;
  readonly chapterId?: string;
  /** Governs role-safe side-branch defaults (see `LessonSourceKind`). */
  readonly sourceKind: LessonSourceKind;
  readonly learnerSide: 'white' | 'black';
  readonly sourceLineageId?: string;
  readonly sourceRevision?: number;
  /**
   * Identity minter. Injected so identity is provably NOT chess-content-derived: it is called once
   * per genuinely new decision, independent of FEN/SAN/UCI/path. Defaults to `crypto.randomUUID`.
   * Tests supply a deterministic counter to prove the id comes from the mint path, not the content.
   */
  readonly mintId?: () => string;
  /**
   * Prior decisions from an earlier derivation of the SAME lesson, supplied to carry identity forward
   * (idempotent re-derivation). A prior decision at the same authored path AND same expected move
   * keeps its `decisionId`; a changed expected move / authored path yields a NEW identity and the
   * replaced prior decision is returned in `archived` (append-only at the model level — never
   * overwritten). Omit for a first derivation.
   */
  readonly previous?: readonly LessonDecision[];
}

/**
 * The derived model: the current decisions plus the append-only archive of decisions that were
 * REPLACED or removed on this re-derivation. `archived` is empty on a first derivation and on an
 * idempotent re-derivation of unchanged material. Callers persist `archived` as append-only history
 * (P2-ORP-17); D1 never overwrites a replaced decision.
 */
export interface LessonDecisionModel {
  readonly lessonId: string;
  readonly decisions: readonly LessonDecision[];
  readonly archived: readonly LessonDecision[];
}

// --- Role + trainability defaults (role-safe) -------------------------------

/**
 * The role-safe default for a branch on IMPORT.
 *   - mainline (reached purely via first-child links) → Mainline correct
 *   - side branch, Gamebook / Interactive-Lesson source → Wrong/refutation
 *   - side branch, ordinary PGN source → Needs classification
 * NOTHING defaults to Accepted alternate (Do-not-preserve row 1458).
 */
export function defaultRoleFor(isMainline: boolean, sourceKind: LessonSourceKind): BranchRole {
  if (isMainline) return 'mainline-correct';
  if (sourceKind === 'gamebook' || sourceKind === 'interactive-lesson') return 'wrong-refutation';
  return 'needs-classification';
}

/**
 * The role-safe default trainability on IMPORT: EVERY derived decision is `untrainable`. Trainability
 * is an authored declaration (P2-ORP-8 amendment), and since nothing defaults to Accepted, nothing
 * defaults to trainable and nothing auto-enrolls in SRS. D2 authoring promotes a decision to Required
 * / Optional practice / Reference only later.
 */
export function defaultTrainability(): DecisionTrainability {
  return 'untrainable';
}

/**
 * Whether a decision auto-enrolls in SRS. Only `required` decisions do (contract §5.2). A
 * role-safe-defaulted (untrainable) decision is never auto-enrolled — this is what "import defaults
 * are role-safe" means.
 */
export function isSrsEnrollable(decision: LessonDecision): boolean {
  return decision.trainability === 'required';
}

// --- Derivation -------------------------------------------------------------

interface RawDecision {
  readonly authoredPath: TreePath;
  readonly role: BranchRole;
  readonly evidence: DecisionEvidence;
}

/**
 * The identity-continuity key: authored path + expected move. Two decisions match (and share a
 * durable id across re-derivation) only when BOTH agree. This is deliberately NOT a FEN or a
 * normalized FEN — transposed/repeated positions reaching the same FEN by different authored paths
 * have different keys and therefore stay DISTINCT (P2-ORP-17; Do-not-preserve row 1459).
 */
function continuityKey(authoredPath: TreePath, uci: Uci): string {
  return `${authoredPath} ${uci}`;
}

/** The lead-in (parent-position) path: the authored path minus its final 2-char node id. */
function leadInPathOf(authoredPath: TreePath): TreePath {
  return authoredPath.length >= 2 ? authoredPath.slice(0, -2) : '';
}

/**
 * Enumerate every authored move node as a raw decision (authored path + role + evidence). A node is
 * on the mainline iff every step from root to it followed the first child; the first non-first-child
 * step enters a side branch and that node and its descendants take the side-branch default role.
 * Root (no move) is not a decision. Pure walk — no identity minted here.
 */
function collectRawDecisions(root: TreeNode, sourceKind: LessonSourceKind): RawDecision[] {
  const out: RawDecision[] = [];
  const walk = (node: TreeNode, path: TreePath, onMainline: boolean): void => {
    node.children.forEach((child, index) => {
      const childOnMainline = onMainline && index === 0;
      const childPath = path + child.id;
      if (child.uci && child.san) {
        out.push({
          authoredPath: childPath,
          role: defaultRoleFor(childOnMainline, sourceKind),
          evidence: { fen: child.fen, uci: child.uci, san: child.san, ply: child.ply },
        });
      }
      walk(child, childPath, childOnMainline);
    });
  };
  walk(root, '', true);
  return out;
}

/**
 * Derive the canonical decision model from a branching `TreeNode` lesson.
 *
 * Identity is a MINTED UUID (never chess-content-derived). Re-derivation is idempotent on identity:
 * pass the earlier `previous` decisions and any decision whose authored path + expected move is
 * unchanged keeps its `decisionId`; a changed expected move / authored path mints a NEW id and the
 * replaced prior decision is archived (append-only, never overwritten). Transposed / repeated FEN
 * paths always receive DISTINCT ids because the continuity key is authored-path-based, never FEN.
 */
export function deriveLessonDecisions(
  root: TreeNode,
  options: DeriveDecisionsOptions,
): LessonDecisionModel {
  const mint = options.mintId ?? (() => crypto.randomUUID());
  const raws = collectRawDecisions(root, options.sourceKind);

  // Index prior decisions by their exact continuity key (path + move). Each prior id may be reused at
  // most once; anything left unconsumed was replaced or removed and is archived.
  const priorByKey = new Map<string, LessonDecision>();
  for (const prev of options.previous ?? []) {
    priorByKey.set(continuityKey(prev.identity.authoredPath, prev.evidence.uci), prev);
  }
  const consumed = new Set<string>();

  const decisions: LessonDecision[] = raws.map((raw) => {
    const key = continuityKey(raw.authoredPath, raw.evidence.uci);
    const prior = priorByKey.get(key);
    let decisionId: string;
    if (prior && !consumed.has(key)) {
      decisionId = prior.identity.decisionId; // idempotent: same material keeps its id
      consumed.add(key);
    } else {
      decisionId = mint(); // genuinely new (or changed) decision → fresh minted id
    }
    return {
      identity: {
        decisionId,
        lessonId: options.lessonId,
        ...(options.chapterId !== undefined ? { chapterId: options.chapterId } : {}),
        authoredPath: raw.authoredPath,
        ...(options.sourceLineageId !== undefined ? { sourceLineageId: options.sourceLineageId } : {}),
        ...(options.sourceRevision !== undefined ? { sourceRevision: options.sourceRevision } : {}),
      },
      role: raw.role,
      trainability: defaultTrainability(),
      learnerSide: options.learnerSide,
      evidence: raw.evidence,
    };
  });

  // Archive every prior decision not carried forward. A prior decision at the same lead-in position
  // as a freshly-minted current decision is a REPLACEMENT (changed expected move); one at a path no
  // longer present is a removal. Both are archived, never overwritten (append-only history).
  const archived: LessonDecision[] = [];
  for (const prev of options.previous ?? []) {
    const key = continuityKey(prev.identity.authoredPath, prev.evidence.uci);
    if (!consumed.has(key)) archived.push(prev);
  }

  return { lessonId: options.lessonId, decisions, archived };
}

/** True when this prior decision was replaced (same lead-in position, different expected move) by
 *  one of the freshly-derived current decisions — as opposed to simply removed. Diagnostic helper
 *  for callers building append-only replaced-decision links; D1 does not perform the reattachment. */
export function findReplacement(
  archivedPrior: LessonDecision,
  current: readonly LessonDecision[],
): LessonDecision | undefined {
  const leadIn = leadInPathOf(archivedPrior.identity.authoredPath);
  return current.find(
    (d) =>
      leadInPathOf(d.identity.authoredPath) === leadIn &&
      d.evidence.uci !== archivedPrior.evidence.uci,
  );
}

// --- Derived-only flat traversal (proves flat is NEVER canonical) -----------

/**
 * Derive the flat traversal for one decision's authored path, on demand. The flat `TrainableSequence`
 * is a DERIVED view (contract §5.1 / P2-ORP-15: "flat move sequences are derived traversals, never
 * canonical lesson storage") — it carries NO decisionId and NO role, and it is never persisted as the
 * source of truth. Identity/role live on the tree-keyed `LessonDecision`, not on the sequence. Reuses
 * the pure `extractLine` traversal engine; returns null if the authored path is not in the tree.
 */
export function deriveDecisionTraversal(
  root: TreeNode,
  decision: LessonDecision,
  label: string,
): TrainableSequence | null {
  const pathIds = collectAuthoredPathIds(root, decision.identity.authoredPath);
  if (!pathIds) return null;
  // The sequence id is the decision reference the traversal carries; the sequence body stays a pure
  // derived flat view of the authored path.
  return extractVariationLine(
    root,
    pathIds,
    decision.identity.lessonId,
    label,
    decision.learnerSide,
    decision.identity.decisionId,
  );
}
