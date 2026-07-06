






















import {
  buildQuestionnaireSummaryComment,
  serializeQuestionnaireTags,
  STORY_OPTIONS,
  DECIDER_OPTIONS,
  OPENING_EVAL_OPTIONS,
  type QuestionnaireAnswers,
  type QuestionnaireBranch,
  type QuestionnaireOption,
  type QuestionnaireRepPracticeSource,
  type QuestionnaireResult,
  type QuestionnaireVerdict,
} from './model';

export type Redraw = () => void;

/** Sequential stage identifiers — the v1 wizard's Step-X-of-N shape, with an extra leading
 *  stage inserted only when the game's result is a draw (v2 §06 pre-question). */
export type QuestionnaireStage =
  | 'draw-pathway'
  | 'story'
  | 'decider'
  | 'opening-eval'
  | 'rep-practice'
  | 'study-material'
  | 'summary';

/** Auto-advance delay after a single-select pick (Game story / Opening Eval tiles, action-wire
 *  Yes/No answers) — a brief "flash the picked state" beat before moving on, ported from the v1
 *  wizard demo (which used assorted per-step values between 200-350ms). One constant is used here
 *  for simplicity; the exact figure is cosmetic polish, not a spec requirement. */
export const QUESTIONNAIRE_AUTO_ADVANCE_MS = 280;

export interface QuestionnaireContext {
  /** Shown only on the draw pre-question (v2 §06), e.g.
   *  "vs CaroKannCarl · Caro-Kann Defense · rapid 10+0". */
  line: string;
}





export interface QuestionnaireCompletion {
  answers: QuestionnaireAnswers;
  tags: [string, string][];
  summaryComment: string;
}

export interface QuestionnaireConfig {
  /** The game's outcome from the studying user's perspective — normally auto-detected by the
   *  caller from the game record before this component is mounted (mirrors the v1 lookbook's
   *  "Branch is normally auto-picked from the game's actual result"). */
  result: QuestionnaireResult;
  context: QuestionnaireContext;
  onComplete: (completion: QuestionnaireCompletion) => void;
  /** Called when "Edit answers" is clicked from the satisfied state. Left-column answer editing
   *  is Phase 2 scope (out of bounds here) — the caller decides what that means; optional. */
  onEditRequested?: () => void;
}

const REP_PRACTICE_SOURCES: Array<{ label: string; source: QuestionnaireRepPracticeSource }> = [
  { label: 'Line from the game', source: 'game' },
  { label: 'A variation I explored', source: 'exploration' },
];

const DECIDER_CAP = 3;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default class QuestionnaireCtrl {
  stage: QuestionnaireStage;

  drawPathway: QuestionnaireBranch | null = null;

  story: string | null = null;

  deciders: string[] = [];

  openingEvalVerdict: QuestionnaireVerdict | null = null;
  openingEvalOption: string | null = null;

  repFlagged: boolean | null = null;
  repAskingSource = false;
  repSource: QuestionnaireRepPracticeSource | null = null;

  needsStudyMaterial: boolean | null = null;

  completion: QuestionnaireCompletion | null = null;

  constructor(
    readonly cfg: QuestionnaireConfig,
    readonly redraw: Redraw,
  ) {
    this.stage = cfg.result === 'draw' ? 'draw-pathway' : 'story';
  }

  /** Win/loss branch driving Game story / Decider option pools. Null only while a draw's
   *  pathway pre-question is still unanswered. */
  get branch(): QuestionnaireBranch | null {
    if (this.cfg.result !== 'draw') return this.cfg.result;
    return this.drawPathway;
  }

  get storyOptions(): QuestionnaireOption[] {
    return this.branch ? STORY_OPTIONS[this.branch] : [];
  }

  get deciderOptions(): QuestionnaireOption[] {
    return this.branch ? DECIDER_OPTIONS[this.branch] : [];
  }

  get openingEvalOptions(): QuestionnaireOption[] {
    return this.openingEvalVerdict ? OPENING_EVAL_OPTIONS[this.openingEvalVerdict] : [];
  }

  get deciderFull(): boolean {
    return this.deciders.length >= DECIDER_CAP;
  }

  get canContinueDecider(): boolean {
    return this.deciders.length > 0;
  }

  get deciderStatusText(): string {
    if (this.deciders.length === 0) return 'No picks yet — tap up to 3, in order of importance.';
    if (this.deciderFull) return '3 of 3 selected — tap a picked answer to remove it and free a slot.';
    return `${this.deciders.length} of 3 selected.`;
  }

  get repPracticeSources(): Array<{ label: string; source: QuestionnaireRepPracticeSource }> {
    return REP_PRACTICE_SOURCES;
  }

  private stageSequence(): QuestionnaireStage[] {
    const rest: QuestionnaireStage[] = ['story', 'decider', 'opening-eval', 'rep-practice', 'study-material', 'summary'];
    return this.cfg.result === 'draw' ? ['draw-pathway', ...rest] : rest;
  }

  get stepNumber(): number {
    return this.stageSequence().indexOf(this.stage) + 1;
  }

  get stepCount(): number {
    return this.stageSequence().length;
  }

  get canGoBack(): boolean {
    return this.stepNumber > 1;
  }

  private goTo(stage: QuestionnaireStage): void {
    this.stage = stage;
    this.redraw();
  }

  private advanceFrom(stage: QuestionnaireStage): void {
    const seq = this.stageSequence();
    const next = seq[seq.indexOf(stage) + 1];
    if (!next) return;
    if (next === 'summary') this.finish();
    else this.goTo(next);
  }

  /** Step back one stage. Opening Eval always discards any in-progress verdict pick on Back,
   *  mirroring the v1 wizard exactly. */
  back(): void {
    const seq = this.stageSequence();
    const prev = seq[seq.indexOf(this.stage) - 1];
    if (!prev) return;
    if (this.stage === 'opening-eval') {
      this.openingEvalVerdict = null;
      this.openingEvalOption = null;
    }
    this.goTo(prev);
  }

  restart(): void {
    this.drawPathway = null;
    this.story = null;
    this.deciders = [];
    this.openingEvalVerdict = null;
    this.openingEvalOption = null;
    this.repFlagged = null;
    this.repAskingSource = false;
    this.repSource = null;
    this.needsStudyMaterial = null;
    this.completion = null;
    this.stage = this.cfg.result === 'draw' ? 'draw-pathway' : 'story';
    this.redraw();
  }

  // ---- §06 draw pre-question: routes straight into the ordinary Win/Loss screens below ----
  pickDrawPathway(pathway: QuestionnaireBranch): void {
    this.drawPathway = pathway;
    this.redraw();
    this.advanceFrom('draw-pathway');
  }

  // ---- §02 Game story: single-select, auto-advances ----
  pickStory(id: string): void {
    this.story = id;
    this.redraw();
    setTimeout(() => this.advanceFrom('story'), QUESTIONNAIRE_AUTO_ADVANCE_MS);
  }

  // ---- §03 Decider: ranked multi-select, cap 3, click order = rank, re-tap deselects ----
  toggleDecider(id: string): void {
    const idx = this.deciders.indexOf(id);
    if (idx > -1) {
      this.deciders.splice(idx, 1);
    } else if (!this.deciderFull) {
      this.deciders.push(id);
    } else {
      // Capped at 3 (approved behavior): a 4th tap on an unpicked tile is a no-op until a
      // deselect frees a slot — the view also renders/disables this tile so it never dispatches
      // a click in the first place; this guard is defense in depth.
      return;
    }
    this.redraw();
  }

  continueFromDecider(): void {
    if (!this.canContinueDecider) return;
    this.advanceFrom('decider');
  }

  // ---- §04 Opening Eval: optional, verdict then single-select tile, auto-advances ----
  pickOpeningVerdict(verdict: QuestionnaireVerdict): void {
    this.openingEvalVerdict = verdict;
    this.redraw();
  }

  pickOpeningOption(id: string): void {
    this.openingEvalOption = id;
    this.redraw();
    setTimeout(() => this.advanceFrom('opening-eval'), QUESTIONNAIRE_AUTO_ADVANCE_MS);
  }

  skipOpeningEval(): void {
    this.openingEvalVerdict = null;
    this.openingEvalOption = null;
    this.advanceFrom('opening-eval');
  }

  // ---- §05 action wire 1: Repetition Practice ----
  pickRepFlag(flagged: boolean): void {
    if (!flagged) {
      this.repFlagged = false;
      this.redraw();
      setTimeout(() => this.advanceFrom('rep-practice'), QUESTIONNAIRE_AUTO_ADVANCE_MS);
      return;
    }
    this.repAskingSource = true;
    this.redraw();
  }

  pickRepSource(source: QuestionnaireRepPracticeSource): void {
    this.repSource = source;
    this.repFlagged = true;
    this.redraw();
    setTimeout(() => this.advanceFrom('rep-practice'), QUESTIONNAIRE_AUTO_ADVANCE_MS);
  }

  // ---- §05 action wire 2: Study material ----
  pickNeedsStudyMaterial(needed: boolean): void {
    this.needsStudyMaterial = needed;
    this.redraw();
    setTimeout(() => this.advanceFrom('study-material'), QUESTIONNAIRE_AUTO_ADVANCE_MS);
  }

  editRequested(): void {
    this.cfg.onEditRequested?.();
  }


  private finish(): void {
    const answers: QuestionnaireAnswers = {
      result: this.cfg.result,
      ...(this.cfg.result === 'draw' && this.drawPathway ? { drawPathway: this.drawPathway } : {}),
      story: this.story ?? '',
      deciders: this.deciders.slice(0, DECIDER_CAP),
      ...(this.openingEvalVerdict && this.openingEvalOption
        ? { openingEval: { verdict: this.openingEvalVerdict, option: this.openingEvalOption } }
        : {}),
      repetitionPractice: this.repFlagged
        ? { flagged: true as const, source: this.repSource ?? 'game' }
        : { flagged: false as const },
      needsStudyMaterial: this.needsStudyMaterial === true,
      completedAt: todayIso(),
    };

    const tags = serializeQuestionnaireTags(answers);
    const summaryComment = buildQuestionnaireSummaryComment(answers);
    const completion: QuestionnaireCompletion = { answers, tags, summaryComment };

    this.completion = completion;
    this.stage = 'summary';
    this.redraw();
    this.cfg.onComplete(completion);
  }
}
