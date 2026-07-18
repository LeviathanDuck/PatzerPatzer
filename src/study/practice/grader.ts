




























import type { LessonDecision } from './material';
import type { AuthoredLessonContent } from './lessonAuthoring';
import type { SrsAssistanceType, SrsFirstAttemptResult } from './srsTypes';

// --- Outcome vocabulary -----------------------------------------------------

/**
 * The role-aware grading category emitted for one played move (§2 table). Closed set:
 *   - `correct`                  — played the cued mainline-correct / trainable-accepted-Required target.
 *   - `accepted-optional`        — played a trainable Optional-practice accepted branch (schedule-neutral).
 *   - `reference-acknowledged`   — played a Reference-only accepted branch (acknowledged, no penalty).
 *   - `wrong-refuted`            — played an authored Wrong/refutation branch (target failed, into repair).
 *   - `deviation`                — legal move that is not an authored child (off-book; target failed).
 *   - `needs-classification-skip`— the played/target branch is unresolved; NOT graded or scored.
 */
export type GradeCategory =
  | 'correct'
  | 'accepted-optional'
  | 'reference-acknowledged'
  | 'wrong-refuted'
  | 'deviation'
  | 'needs-classification-skip';

/**
 * What the controller should do with the board/traversal next. The grader only NAMES the directive;
 * the controller (drillCtrl.ts) owns the actual traversal/board dispatch (board work is D8).
 */
export type GradeContinuation =
  | 'advance-played-branch'  // continue down the played authored branch (correct / accepted)
  | 'return-to-trained-path' // reference-only: return to the trained path without penalty
  | 'repair'                 // wrong / deviation: walk back to the lead-in, enter same-session repair
  | 'none';                  // needs-classification: not graded

/** A played move in the neutral uci/san shape (legality is the board's job — the grader is pure). */
export interface PlayedMove {
  readonly uci: string;
  readonly san: string;
}

/**
 * Grader input — ALL data, no IDB/DOM/engine. The caller supplies the cued target decision, its
 * authored siblings at the same learner position (so the PLAYED branch can be classified by its own
 * role), the played move, the authored content map (for branch-specific vs generic explanations), the
 * assistance used on THIS decision, and whether this is a non-due lead-in context move.
 */
export interface GradeInput {
  /** The cued decision the learner was asked to recall (the scored Required target, when scored). */
  readonly target: LessonDecision;
  /** Authored sibling decisions at the same learner position (never inferred — authored only). */
  readonly siblings: readonly LessonDecision[];
  readonly played: PlayedMove;
  /** Authored content keyed by `decisionId` (missing entries treated as empty). */
  readonly content: ReadonlyMap<string, AuthoredLessonContent>;
  /** Assistance categories used on this decision (hint / show-move). Presence forces `failed`. */
  readonly assistance: readonly SrsAssistanceType[];
  /** True when this is a non-due lead-in context move: diagnostic only, NEVER a scored due target
   *  (P2-ORP due behavior; Do-not-preserve :877). */
  readonly isContext?: boolean;
}

/**
 * The emitted grading outcome. `decisionId` keys the outcome to the target the outcome pertains to:
 * for a scored FAILURE (wrong-refuted / deviation) it is the cued Required target that was missed; for a
 * correct / accepted / reference play it is the decision actually played. `scored` marks whether this
 * outcome contributes a first-attempt scoring signal for a Required target at all — accepted-optional,
 * reference-only, needs-classification, and every context move are schedule-neutral (`scored:false`,
 * `firstAttemptResult:null`), which is exactly what guards Do-not-preserve :877/:878.
 *
 * These are RAW SIGNALS ONLY. The grader neither constructs an `SrsAttemptRecord` nor applies a
 * transition; D9 maps a completed scored outcome into the kernel and schedules it.
 */
export interface GradeOutcome {
  readonly category: GradeCategory;
  /** The decision this outcome pertains to (see the interface doc). */
  readonly decisionId: string;
  /** The authored child actually played, or null when the played move is off-book (no authored child). */
  readonly playedDecisionId: string | null;
  readonly continuation: GradeContinuation;
  /** True only for a scored Required-target signal (never for accepted-optional/reference/context). */
  readonly scored: boolean;
  /** The neutral first-attempt signal for a scored outcome; null when not scored. Assistance forces
   *  `'failed'` on a scored outcome (P2-ORP-10). */
  readonly firstAttemptResult: SrsFirstAttemptResult | null;
  /** Assistance categories echoed from the input (controller-tracked; the grader never reads UI). */
  readonly assistanceTypes: readonly SrsAssistanceType[];
  /** Diagnostic keys of the moves that failed (the played uci for wrong/deviation; empty otherwise). */
  readonly failedMoveKeys: readonly string[];
  /** The explanation text to surface: the played branch's `wrongRefutationExplanation` for a refuted
   *  branch, the target's `genericDeviation` for an off-book move, else null. */
  readonly explanation: string | null;
}

// --- Helpers ----------------------------------------------------------------

function contentFor(
  content: ReadonlyMap<string, AuthoredLessonContent>,
  decisionId: string,
): AuthoredLessonContent | undefined {
  return content.get(decisionId);
}

/** The authored child whose expected move matches the played uci, or undefined (off-book). Matching is
 *  on authored move EVIDENCE (uci), never on FEN identity (P2-ORP-17). */
function matchAuthoredChild(
  target: LessonDecision,
  siblings: readonly LessonDecision[],
  playedUci: string,
): LessonDecision | undefined {
  if (target.evidence.uci === playedUci) return target;
  return siblings.find((s) => s.evidence.uci === playedUci);
}

/** Whether a decision is a scored Required target (mainline-correct or a Required trainable accepted). A
 *  Reference-only or Optional-practice accepted move is NOT a scored Required target (P2-ORP-8). */
function isScoredRequired(decision: LessonDecision): boolean {
  if (decision.trainability === 'required') {
    return decision.role === 'mainline-correct' || decision.role === 'accepted-alternate';
  }
  return false;
}

// --- The pure grader (emit only) --------------------------------------------

/**
 * Grade one played move against the cued target decision and its authored siblings, honoring the five
 * branch roles (P2-ORP-8) and the assistance-fail rule (P2-ORP-10). Pure and side-effect-free: it
 * returns the domain outcome plus neutral raw signals and does not touch the scheduler, construct an
 * attempt record, or read the board/UI.
 */
export function gradeDecision(input: GradeInput): GradeOutcome {
  const { target, siblings, played, content, assistance, isContext } = input;
  const assistanceTypes = assistance.slice();
  const played_ = matchAuthoredChild(target, siblings, played.uci);

  // Off-book: a legal move that is no authored child. Never inferred as accepted (Do-not-preserve :874).
  if (!played_) {
    const explanation = contentFor(content, target.identity.decisionId)?.genericDeviation ?? null;
    return {
      category: 'deviation',
      decisionId: target.identity.decisionId,
      playedDecisionId: null,
      continuation: 'repair',
      // A missed CONTEXT move is diagnostic only, never a scored due target (Do-not-preserve :877).
      scored: !isContext,
      firstAttemptResult: isContext ? null : 'failed',
      assistanceTypes,
      failedMoveKeys: [played.uci],
      explanation,
    };
  }

  // The played move landed on an authored child — classify by THAT child's role/trainability.
  switch (played_.role) {
    case 'needs-classification':
      // Unresolved branch: do not grade or score; route to authoring (P2-ORP-8; guards :874).
      return {
        category: 'needs-classification-skip',
        decisionId: played_.identity.decisionId,
        playedDecisionId: played_.identity.decisionId,
        continuation: 'none',
        scored: false,
        firstAttemptResult: null,
        assistanceTypes,
        failedMoveKeys: [],
        explanation: null,
      };

    case 'wrong-refutation': {
      // The learner played an authored wrong branch → the cued Required target was missed.
      const explanation =
        contentFor(content, played_.identity.decisionId)?.wrongRefutationExplanation ??
        contentFor(content, target.identity.decisionId)?.genericDeviation ??
        null;
      return {
        category: 'wrong-refuted',
        decisionId: target.identity.decisionId,
        playedDecisionId: played_.identity.decisionId,
        continuation: 'repair',
        scored: !isContext,
        firstAttemptResult: isContext ? null : 'failed',
        assistanceTypes,
        failedMoveKeys: [played.uci],
        explanation,
      };
    }

    case 'reference-only':
      // Acknowledged; returns to the trained path without penalty (P2-ORP-8 :978-979). Schedule-neutral.
      return {
        category: 'reference-acknowledged',
        decisionId: played_.identity.decisionId,
        playedDecisionId: played_.identity.decisionId,
        continuation: 'return-to-trained-path',
        scored: false,
        firstAttemptResult: null,
        assistanceTypes,
        failedMoveKeys: [],
        explanation: null,
      };

    case 'mainline-correct':
    case 'accepted-alternate': {
      if (played_.trainability === 'reference-only') {
        // A reference-only-trainable accepted branch: acknowledged, no penalty (schedule-neutral).
        return {
          category: 'reference-acknowledged',
          decisionId: played_.identity.decisionId,
          playedDecisionId: played_.identity.decisionId,
          continuation: 'return-to-trained-path',
          scored: false,
          firstAttemptResult: null,
          assistanceTypes,
          failedMoveKeys: [],
          explanation: null,
        };
      }
      if (played_.trainability === 'optional-practice') {
        // Optional practice: full continuation down the played branch, but schedule-neutral — it must
        // NOT emit a clean scored outcome for the cued Required target (guards :878).
        return {
          category: 'accepted-optional',
          decisionId: played_.identity.decisionId,
          playedDecisionId: played_.identity.decisionId,
          continuation: 'advance-played-branch',
          scored: false,
          firstAttemptResult: null,
          assistanceTypes,
          failedMoveKeys: [],
          explanation: null,
        };
      }
      // Required (or untrainable-but-authored mainline): full correctness credit, continue. Scored only
      // when it is a scored Required target and not a context move; assistance forces `failed`.
      const scored = !isContext && isScoredRequired(played_);
      const firstAttemptResult: SrsFirstAttemptResult | null = scored
        ? assistanceTypes.length > 0
          ? 'failed'
          : 'clean'
        : null;
      return {
        category: 'correct',
        decisionId: played_.identity.decisionId,
        playedDecisionId: played_.identity.decisionId,
        continuation: 'advance-played-branch',
        scored,
        firstAttemptResult,
        assistanceTypes,
        failedMoveKeys: [],
        explanation: null,
      };
    }
  }
}
