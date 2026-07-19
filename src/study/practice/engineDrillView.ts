














import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs } from '../../ui/controlExplainer';
import type { DrillDifficulty, DrillGoal, EngineDrillState } from './engineDrillCtrl';

// --- Setup ------------------------------------------------------------------------------------------

/** The §12.3 goal choices the setup offers (host translates a choice into a DrillGoal). */
export type DrillGoalChoice =
  | 'outcome-win' | 'outcome-draw' | 'survive' | 'mate' | 'mate-in' | 'promote' | 'eval-threshold' | 'max-critical';

export interface DrillSetupProps {
  readonly startLabel: string; // e.g. "Drill from here" (the §12.1 default)
  readonly goal: DrillGoalChoice;
  readonly goalMoves: number;        // survive-N / mate-in-N parameter

  readonly evalThresholdCp: number;
  readonly evalHoldCount: number;
  readonly maxCriticalMistakes: number;
  readonly difficulty: DrillDifficulty;
  readonly learnerIsWhite: boolean;
  readonly moveLimit: number | null;
  readonly timeLimitMinutes: number | null;
  readonly onGoalChange: (goal: DrillGoalChoice) => void;
  readonly onGoalMovesChange: (moves: number) => void;
  readonly onEvalThresholdChange: (cp: number) => void;
  readonly onEvalHoldChange: (holdCount: number) => void;
  readonly onMaxCriticalChange: (max: number) => void;
  readonly onMoveLimitChange: (moves: number | null) => void;
  readonly onTimeLimitChange: (minutes: number | null) => void;
  readonly onDifficultyChange: (difficulty: DrillDifficulty) => void;
  readonly onSideChange: (learnerIsWhite: boolean) => void;
  readonly onStart: () => void;
}

const GOAL_LABELS: Record<DrillGoalChoice, string> = {
  'outcome-win': 'Win the game',
  'outcome-draw': 'Hold a draw',
  'survive': 'Survive N moves',
  'mate': 'Deliver checkmate',
  'mate-in': 'Mate in N',
  'promote': 'Promote a pawn',
  'eval-threshold': 'Reach and hold an advantage',
  'max-critical': 'Limit critical mistakes',
};


function numberField(
  label: string,
  value: number | null,
  opts: { readonly min: number; readonly max: number; readonly placeholder?: string; readonly clearable?: boolean },
  onChange: (value: number | null) => void,
): VNode {
  return h('div.drill-setup__field', [
    h('span.drill-setup__label', label),
    h('input.drill-setup__number', {
      attrs: {
        type: 'number', min: String(opts.min), max: String(opts.max),
        value: value === null ? '' : String(value),
        placeholder: opts.placeholder ?? '',
        'aria-label': label,
      },
      on: {
        change: (e: Event) => {
          const raw = (e.target as HTMLInputElement).value.trim();
          if (raw === '' && opts.clearable) { onChange(null); return; }
          const v = Number(raw);
          if (Number.isInteger(v) && v >= opts.min && v <= opts.max) onChange(v);
        },
      },
    }),
  ]);
}

export function renderDrillSetup(props: DrillSetupProps): VNode {
  return h('div.drill-setup', [
    h('div.drill-setup__title', props.startLabel),
    h('div.drill-setup__field', [
      h('span.drill-setup__label', 'Goal'),
      h('div.drill-setup__choices',
        (Object.keys(GOAL_LABELS) as DrillGoalChoice[]).map(choice =>
          h('button.drill-setup__choice', {
            key: choice,
            class: { 'drill-setup__choice--active': props.goal === choice },
            attrs: {
              type: 'button', 'aria-pressed': String(props.goal === choice),
              ...controlExplainerAttrs({
                label: GOAL_LABELS[choice],
                description: 'Sets what this drill counts as success.',
                tier: 'essential',
              }),
            },
            on: { click: () => props.onGoalChange(choice) },
          }, GOAL_LABELS[choice]),
        )),
    ]),
    props.goal === 'survive' || props.goal === 'mate-in'
      ? numberField(props.goal === 'survive' ? 'Moves to survive' : 'Mate within (moves)',
          props.goalMoves, { min: 1, max: 99 }, v => { if (v !== null) props.onGoalMovesChange(v); })
      : null,
    props.goal === 'eval-threshold'
      ? h('div.drill-setup__param-row', [
          numberField('Advantage to reach (centipawns)', props.evalThresholdCp,
            { min: 50, max: 2000 }, v => { if (v !== null) props.onEvalThresholdChange(v); }),
          numberField('Hold for (consecutive verdicts)', props.evalHoldCount,
            { min: 1, max: 10 }, v => { if (v !== null) props.onEvalHoldChange(v); }),
        ])
      : null,
    props.goal === 'max-critical'
      ? numberField('Critical mistakes allowed', props.maxCriticalMistakes,
          { min: 0, max: 10 }, v => { if (v !== null) props.onMaxCriticalChange(v); })
      : null,
    // Optional limits (§12.3: normal endings unless a goal makes them failures) — LIVE (Sol B4:
    // moveLimit was previously an inert prop and no time-limit control existed).
    h('div.drill-setup__param-row', [
      numberField('Move limit (optional)', props.moveLimit,
        { min: 1, max: 200, clearable: true, placeholder: 'none' }, props.onMoveLimitChange),
      numberField('Time limit, minutes (optional)', props.timeLimitMinutes,
        { min: 1, max: 180, clearable: true, placeholder: 'none' }, props.onTimeLimitChange),
    ]),
    h('div.drill-setup__field', [
      h('span.drill-setup__label', 'Difficulty'),
      (['casual', 'mastery'] as DrillDifficulty[]).map(d =>
        h('button.drill-setup__choice', {
          key: d,
          class: { 'drill-setup__choice--active': props.difficulty === d },
          attrs: {
            type: 'button', 'aria-pressed': String(props.difficulty === d),
            ...controlExplainerAttrs({
              label: d === 'casual' ? 'Casual — depth 18' : 'Mastery — up to 60 seconds',
              description: d === 'casual'
                ? 'The engine replies at a bounded search depth.'
                : 'The engine thinks up to a minute per reply.',
              tier: 'essential',
            }),
          },
          on: { click: () => props.onDifficultyChange(d) },
        }, d === 'casual' ? 'Casual' : 'Mastery'),
      ),
    ]),
    h('div.drill-setup__field', [
      h('span.drill-setup__label', 'Play as'),
      (['white', 'black'] as const).map(side =>
        h('button.drill-setup__choice', {
          key: side,
          class: { 'drill-setup__choice--active': props.learnerIsWhite === (side === 'white') },
          attrs: {
            type: 'button', 'aria-pressed': String(props.learnerIsWhite === (side === 'white')),
            ...controlExplainerAttrs({
              label: side === 'white' ? 'Play as White' : 'Play as Black',
              description: 'Chooses your side for this drill.',
            }),
          },
          on: { click: () => props.onSideChange(side === 'white') },
        }, side === 'white' ? 'White' : 'Black'),
      ),
    ]),
    h('button.drill-setup__start', {
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({
          label: 'Start drill',
          description: 'Begins open-ended practice against Stockfish from this position. Your review schedule is unaffected.',
          tier: 'essential',
        }),
      },
      on: { click: props.onStart },
    }, 'Start drill'),
  ]);
}

// --- Live readout (the Screen 5 rail sibling) -------------------------------------------------------

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function goalSummary(goal: DrillGoal): string {
  switch (goal.kind) {
    case 'outcome': return goal.want === 'win' ? 'Goal: win the game' : 'Goal: hold a draw';
    case 'survive': return `Goal: survive to move ${goal.moves}`;
    case 'mate': return 'Goal: deliver checkmate';
    case 'mate-in': return `Goal: mate in ${goal.moves}`;
    case 'promote': return 'Goal: promote a pawn';
    case 'eval-threshold': return `Goal: reach and hold +${(goal.cp / 100).toFixed(1)}`;
    case 'max-critical-mistakes': return `Goal: at most ${goal.max} critical mistake${goal.max === 1 ? '' : 's'}`;
  }
}

export interface DrillReadoutProps {
  readonly state: EngineDrillState;
  readonly goals: readonly DrillGoal[];
  /** Remaining time when a time limit runs (host-computed; the view reads no clock). */
  readonly remainingMs?: number;
}

/** The clock+goal readout appended as a SIBLING inside the real `.practice-rail` (Screen 5). */
export function renderDrillReadout(props: DrillReadoutProps): VNode {
  const { state } = props;
  return h('div.drill-readout', [
    props.remainingMs !== undefined
      ? h('span.drill-readout__clock', formatClock(props.remainingMs))
      : null,
    ...props.goals.map(goal => h('span.drill-readout__goal', goalSummary(goal))),
    h('span.drill-readout__difficulty', [
      state.difficulty === 'casual' ? 'Casual' : 'Mastery',
      state.substituted
        ? h('span.drill-readout__substituted', ' (substituted — original kept in history)')
        : null,
    ]),
  ]);
}

// --- Result (§12.4 minimal scorecard) ---------------------------------------------------------------

export interface DrillResultActions {
  readonly onAnalyze: () => void;
  readonly onNextDrill: () => void;
  readonly onRetry: () => void;
  readonly onOpenInAnalysis: () => void;
  readonly onPromote: () => void;
}

export interface DrillAutoNextProps {
  /** OFF by default; remembered only for the current session (the HOST owns the flag). */
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  /** Countdown seconds remaining when enabled and counting (host-driven). */
  readonly countdownSeconds?: number;
  readonly onCancelCountdown: () => void;
  readonly onStartNow: () => void;
}

function resultHeadline(state: EngineDrillState): string {
  const t = state.terminal;
  if (t?.kind === 'checkmate') return t.winnerIsLearner ? 'Checkmate — you won' : 'Checkmate — you lost';
  if (t?.kind === 'stalemate') return 'Stalemate';
  if (t?.kind === 'draw') return 'Draw';
  if (t?.kind === 'resignation') return t.byLearner ? 'You resigned' : 'The engine resigned';
  if (state.endReason === 'move-limit') return 'Move limit reached';
  if (state.endReason === 'time-limit') return 'Time limit reached';
  return 'Drill finished';
}

export function renderDrillResult(
  state: EngineDrillState,
  actions: DrillResultActions,
  autoNext: DrillAutoNextProps,
  secondaryOpen: boolean,
  onToggleSecondary: (open: boolean) => void,
): VNode {
  const score = state.score;
  const goalsMet = state.goalResults?.filter(r => r.met === true).length ?? 0;
  const goalsTotal = state.goalResults?.length ?? 0;
  return h('div.drill-result', [
    h('div.drill-result__headline', resultHeadline(state)),
    goalsTotal > 0
      ? h('div.drill-result__goals', `${goalsMet} of ${goalsTotal} goal${goalsTotal === 1 ? '' : 's'} met`)
      : null,
    h('div.drill-result__score', [
      h('span.drill-result__quality',
        score?.moveQualityPct !== null && score !== null
          ? `Move quality ${Math.round(score.moveQualityPct)}%`
          : 'Move quality —'),
      h('span.drill-result__critical',
        `Critical mistakes ${score?.criticalMistakes ?? 0}`),
    ]),
    // Screen 5's schedule-neutrality line, made visible (P2-ORP-14).
    h('div.drill-result__neutral', 'SRS unaffected — Drill mode default'),
    h('div.drill-result__primary', [
      h('button.drill-result__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Next drill', description: 'Starts another drill with the same setup.', tier: 'essential',
        }) },
        on: { click: actions.onNextDrill },
      }, 'Next drill'),
      h('button.drill-result__action', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Analyze', description: 'Runs engine analysis over this drill game.', tier: 'essential',
        }) },
        on: { click: actions.onAnalyze },
      }, 'Analyze'),
      h('button.drill-result__more', {
        attrs: {
          type: 'button', 'aria-expanded': String(secondaryOpen),
          ...controlExplainerAttrs({
            label: secondaryOpen ? 'Hide more actions' : 'More actions',
            description: 'Retry, Open in Analysis, and Promote to Study.',
          }),
        },
        on: { click: () => onToggleSecondary(!secondaryOpen) },
      }, secondaryOpen ? 'Less' : 'More'),
    ]),
    secondaryOpen
      ? h('div.drill-result__secondary', [
          h('button.drill-result__action', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Retry drill', description: 'Replays this drill from its starting position as a linked attempt.',
            }) },
            on: { click: actions.onRetry },
          }, 'Retry'),
          h('button.drill-result__action', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Open in Analysis', description: 'Opens the drill game on the analysis board.',
            }) },
            on: { click: actions.onOpenInAnalysis },
          }, 'Open in Analysis'),
          h('button.drill-result__action', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Promote to Study',
              description: 'Starts the previewed promotion of drill material into a Study. Never automatic.',
              tier: 'essential',
            }) },
            on: { click: actions.onPromote },
          }, 'Promote to Study'),
        ])
      : null,
    h('div.drill-result__autonext', [
      h('label.drill-result__autonext-toggle', [
        h('input', {
          attrs: {
            type: 'checkbox', checked: autoNext.enabled,
            ...controlExplainerAttrs({
              label: 'Auto-start next drill',
              description: 'Starts the next drill automatically after a short countdown. Off by default; remembered for this session only.',
              tier: 'essential',
            }),
          },
          on: { change: (e: Event) => autoNext.onToggle((e.target as HTMLInputElement).checked) },
        }),
        'Auto-start next drill',
      ]),
      autoNext.enabled && autoNext.countdownSeconds !== undefined
        ? h('span.drill-result__countdown', [
            `Next drill in ${autoNext.countdownSeconds}s `,
            h('button.drill-result__countdown-btn', {
              attrs: { type: 'button', ...controlExplainerAttrs({
                label: 'Cancel auto-start', description: 'Stops the countdown; this result stays open.', tier: 'essential',
              }) },
              on: { click: autoNext.onCancelCountdown },
            }, 'Cancel'),
            h('button.drill-result__countdown-btn', {
              attrs: { type: 'button', ...controlExplainerAttrs({
                label: 'Start now', description: 'Skips the countdown and starts the next drill immediately.',
              }) },
              on: { click: autoNext.onStartNow },
            }, 'Start now'),
          ])
        : null,
    ]),
  ]);
}
