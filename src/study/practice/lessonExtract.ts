

















import type { Shape, TreeNode, TreePath } from '../../tree/types';
import {
  BRANCH_ROLES, deriveLessonDecisions,
  type BranchRole, type DecisionTrainability, type LessonDecision, type LessonSourceKind,
} from './material';
import { getNodeAtPath } from './extractLine';
import type { LearnReply } from './drillCtrl';
import type { AuthoredLessonContent } from './lessonAuthoring';

export interface ExtractLessonModelInput {
  /** Parsed lesson tree (`StudyItem.pgn` via the detail/host parser). */
  readonly root: TreeNode;
  /** Owning lesson id (= `StudyItem.id`). */
  readonly lessonId: string;
  readonly learnerSide: 'white' | 'black';
  /** Governs role-safe side-branch defaults in the derivation (see `LessonSourceKind`). */
  readonly sourceKind: LessonSourceKind;
  /** Authored content keyed by `decisionId` — passed through untouched for the controller. */
  readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  /**
   * Prior decisions for id continuity (idempotent re-derivation). Until the E2a durable-identity
   * row lands, hosts cannot rebuild this from IDB — do NOT point the extractor at a Study with
   * enrolled SRS rows without it (consult guard 1).
   */
  readonly previous?: readonly LessonDecision[] | undefined;
  /** Host overlay applying persisted role/trainability onto each derived decision (consult §1). */
  readonly decisionOverlay?: (base: LessonDecision) => LessonDecision;
  /** Deterministic id mint for tests; defaults to `crypto.randomUUID` inside the derivation. */
  readonly mintId?: () => string;
  readonly chapterId?: string;
  readonly sourceLineageId?: string;
  readonly sourceRevision?: number;
}

/** The material-aware bundle callers combine with session state (`targetIds`/`scope`/`trainAs`). */
export interface LessonModel {
  /**
   * The FULL derived decision model (both sides), traversal order, overlay applied. This is the
   * authoring surface's model — the panel edits decisions at any current path, learner or opponent.
   */
  readonly decisions: readonly LessonDecision[];
  /** Append-only archive of prior decisions replaced/removed by this re-derivation (P2-ORP-17). */
  readonly archived: readonly LessonDecision[];
  /** Learner-side decisions in traversal order — `LearnViewConfig.line` / `BuildLearnStepsInput.line`. */
  readonly line: readonly LessonDecision[];
  /**
   * Authored learner siblings at a lead-in AUTHORED PATH (never a FEN — P2-ORP-17). Returns the full
   * group; consumers exclude the decision itself (`buildLearnSteps` already does).
   */
  readonly siblingsAt: (leadInPath: TreePath) => readonly LessonDecision[];
  /** Authored opponent replies keyed by the learner decision id (Stockfish never selects a reply). */
  readonly replies: ReadonlyMap<string, LearnReply>;
  /** The input content map, passed through. */
  readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  /** The FEN the learner recalls FROM: the parent node's position, never `evidence.fen` (after-move). */
  readonly leadInFenFor: (decision: LessonDecision) => string;
  /** Authored arrows/highlights on the decision's own node (`TreeNode.shapes`). */
  readonly shapesFor: (decision: LessonDecision) => readonly Shape[];
  readonly rootFen: string;
}

/** The lead-in (parent-position) path: the authored path minus its final 2-char node id. Mirrors
 *  D1's private `leadInPathOf` (material.ts) — the same precedent `sessionBuilder.ts` follows. */
function leadInPathOf(authoredPath: TreePath): TreePath {
  return authoredPath.length >= 2 ? authoredPath.slice(0, -2) : '';
}

/** Mover color for a node ply (ply is AFTER the move: odd ⇒ white moved — studyDetailView numbering). */
function moverSideOf(ply: number): 'white' | 'black' {
  return ply % 2 === 1 ? 'white' : 'black';
}

/** Join a node's comment texts into one reply comment, or undefined when there is none. */
function replyCommentOf(node: TreeNode): string | undefined {
  const texts = (node.comments ?? []).map(c => c.text.trim()).filter(t => t.length > 0);
  return texts.length ? texts.join('\n') : undefined;
}

/**
 * STRUCTURAL shape of a persisted `study-practice-decisions` row as this pure module needs it —
 * declared locally so lessonExtract keeps no dependency on the persistence layer (`studyDb.ts`'s
 * `StudyPracticeDecisionRow` satisfies it structurally). The E2a fields are optional: legacy rows
 * predate the continuity key.
 */
export interface PersistedDecisionRowLike {
  readonly decisionId: string;
  readonly lessonId: string;
  readonly chapterId?: string;
  readonly sourceLineageId?: string;
  readonly authoredPath?: string;
  readonly uci?: string;
  readonly role?: string;
  readonly trainability?: string;
}

/** Every `DecisionTrainability` member (typed so a removed member fails compilation here). */
const TRAINABILITY_VALUES: readonly DecisionTrainability[] = [
  'required', 'optional-practice', 'reference-only', 'untrainable',
];

function asBranchRole(value: string | undefined): BranchRole {
  return value !== undefined && (BRANCH_ROLES as readonly string[]).includes(value)
    ? (value as BranchRole)
    : 'needs-classification';
}

function asTrainability(value: string | undefined): DecisionTrainability {
  return value !== undefined && (TRAINABILITY_VALUES as readonly string[]).includes(value)
    ? (value as DecisionTrainability)
    : 'untrainable';
}















export function previousFromDecisionRows(
  rows: readonly PersistedDecisionRowLike[],
  learnerSide: 'white' | 'black',
): readonly LessonDecision[] {
  const previous: LessonDecision[] = [];
  for (const row of rows) {
    if (!row.authoredPath || !row.uci) continue;
    previous.push({
      identity: {
        decisionId: row.decisionId,
        lessonId: row.lessonId,
        ...(row.chapterId !== undefined ? { chapterId: row.chapterId } : {}),
        authoredPath: row.authoredPath,
        ...(row.sourceLineageId !== undefined ? { sourceLineageId: row.sourceLineageId } : {}),
      },
      role: asBranchRole(row.role),
      trainability: asTrainability(row.trainability),
      learnerSide,
      evidence: { fen: '', uci: row.uci, san: '', ply: 0 },
    });
  }
  return previous;
}

export function extractLessonModel(input: ExtractLessonModelInput): LessonModel {
  const { root, learnerSide } = input;

  const derived = deriveLessonDecisions(root, {
    lessonId: input.lessonId,
    sourceKind: input.sourceKind,
    learnerSide,
    ...(input.chapterId !== undefined ? { chapterId: input.chapterId } : {}),
    ...(input.sourceLineageId !== undefined ? { sourceLineageId: input.sourceLineageId } : {}),
    ...(input.sourceRevision !== undefined ? { sourceRevision: input.sourceRevision } : {}),
    ...(input.mintId !== undefined ? { mintId: input.mintId } : {}),
    previous: input.previous,
  });

  const overlay = input.decisionOverlay;
  const decisions: readonly LessonDecision[] = overlay
    ? derived.decisions.map(d => overlay(d))
    : derived.decisions;

  const line: readonly LessonDecision[] = decisions.filter(
    d => moverSideOf(d.evidence.ply) === learnerSide,
  );

  // Sibling groups keyed by the lead-in AUTHORED PATH (never FEN — transpositions stay distinct).
  const siblingGroups = new Map<TreePath, LessonDecision[]>();
  for (const decision of line) {
    const leadIn = leadInPathOf(decision.identity.authoredPath);
    const group = siblingGroups.get(leadIn);
    if (group) group.push(decision);
    else siblingGroups.set(leadIn, [decision]);
  }

  // Authored opponent replies: the FIRST authored child after a learner decision node is the reply
  // the lesson plays back (authored only — never engine-selected).
  const replies = new Map<string, LearnReply>();
  for (const decision of line) {
    const node = getNodeAtPath(root, decision.identity.authoredPath);
    const child = node?.children[0];
    if (!child?.uci || !child.san) continue;
    const comment = replyCommentOf(child);
    const atRoot = leadInPathOf(decision.identity.authoredPath) === '';
    replies.set(decision.identity.decisionId, {
      uci: child.uci,
      san: child.san,
      ...(comment !== undefined ? { comment } : {}),
      ...(atRoot ? { atRoot } : {}),
    });
  }

  return {
    decisions,
    archived: derived.archived,
    line,
    siblingsAt: (leadInPath: TreePath) => siblingGroups.get(leadInPath) ?? [],
    replies,
    content: input.content,
    leadInFenFor: decision =>
      getNodeAtPath(root, leadInPathOf(decision.identity.authoredPath))?.fen ?? root.fen,
    shapesFor: decision => getNodeAtPath(root, decision.identity.authoredPath)?.shapes ?? [],
    rootFen: root.fen,
  };
}
