// Severity-modulated feedback module.
// Provides graduated reason language, colors, and glyphs for move quality
// feedback across the app. No Lichess analog — Patzer-specific addition.

import type { LearnableReasonCode } from '../tree/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeverityTier =
  | 'best'
  | 'excellent'
  | 'good'
  | 'playable'
  | 'inaccuracy'
  | 'mistake'
  | 'serious'
  | 'blunder'
  | 'catastrophic';

export type FeedbackTone = 'standard' | 'harsh';

export interface TierMeta {
  id: SeverityTier;
  label: string;
  color: string;
  glyph: string | null;
  /** Lower bound of loss range (inclusive). 0 for best. */
  lossFloor: number;
  /** Upper bound of loss range (exclusive). Infinity for catastrophic. */
  lossCeiling: number;
}

export interface SeverityFeedback {
  tier: TierMeta;
  /** Tier-appropriate label for this reason + severity. */
  label: string;
  /** Severity-modulated summary text. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Special classification overlays
// ---------------------------------------------------------------------------

export type SpecialClassification = 'book' | 'forced' | 'missed-mate-override';

export interface SpecialFeedback {
  id: SpecialClassification;
  label: string;
  color: string;
  summary: string;
}

export const SPECIAL_CLASSIFICATIONS: Readonly<Record<SpecialClassification, SpecialFeedback>> = {
  'book': {
    id: 'book',
    label: 'Book move',
    color: '#9a8c98',
    summary: 'Opening book move.',
  },
  'forced': {
    id: 'forced',
    label: 'Forced',
    color: '#888888',
    summary: 'Only legal move.',
  },
  'missed-mate-override': {
    id: 'missed-mate-override',
    label: 'Missed checkmate',
    color: '#8b1a1a',
    summary: 'Checkmate was available.',
  },
};

// ---------------------------------------------------------------------------
// Tier metadata — ordered best to catastrophic
// ---------------------------------------------------------------------------

export const SEVERITY_TIERS: readonly TierMeta[] = [
  { id: 'best',         label: 'Best Move',             color: '#26a641', glyph: '!',  lossFloor: 0,    lossCeiling: 0     },
  { id: 'excellent',    label: 'Excellent',              color: '#57ab5a', glyph: '!',  lossFloor: 0,    lossCeiling: 0.02  },
  { id: 'good',         label: 'Good',                   color: '#7bc67e', glyph: null, lossFloor: 0.02, lossCeiling: 0.04  },
  { id: 'playable',     label: 'Playable',               color: '#8bb8a8', glyph: null, lossFloor: 0.04, lossCeiling: 0.05  },
  { id: 'inaccuracy',   label: 'Inaccuracy',             color: '#56b4e9', glyph: '?!', lossFloor: 0.05, lossCeiling: 0.10  },
  { id: 'mistake',      label: 'Mistake',                color: '#e69d00', glyph: '?',  lossFloor: 0.10, lossCeiling: 0.15  },
  { id: 'serious',      label: 'Serious Mistake',        color: '#e06c4e', glyph: '?',  lossFloor: 0.15, lossCeiling: 0.20  },
  { id: 'blunder',      label: 'Blunder',                color: '#db3031', glyph: '??', lossFloor: 0.20, lossCeiling: 0.30  },
  { id: 'catastrophic', label: 'Catastrophic Blunder',   color: '#8b1a1a', glyph: '??', lossFloor: 0.30, lossCeiling: Infinity },
] as const;

const _tierMetaMap: Record<SeverityTier, TierMeta> = Object.create(null);
for (const t of SEVERITY_TIERS) _tierMetaMap[t.id] = t;

export function getTierMeta(tier: SeverityTier): TierMeta {
  return _tierMetaMap[tier];
}

// ---------------------------------------------------------------------------
// classifySeverity
// ---------------------------------------------------------------------------

export function classifySeverity(loss: number, isExactBest: boolean): SeverityTier {
  if (isExactBest && loss === 0) return 'best';
  if (loss <= 0.02) return 'excellent';
  if (loss <= 0.04) return 'good';
  if (loss <= 0.05) return 'playable';
  if (loss <= 0.10) return 'inaccuracy';
  if (loss <= 0.15) return 'mistake';
  if (loss <= 0.20) return 'serious';
  if (loss <= 0.30) return 'blunder';
  return 'catastrophic';
}

// ---------------------------------------------------------------------------
// Positive tiers — same for all reason codes
// ---------------------------------------------------------------------------

const POSITIVE_TIERS: readonly SeverityTier[] = ['best', 'excellent', 'good', 'playable'];
const NEGATIVE_TIERS: readonly SeverityTier[] = ['inaccuracy', 'mistake', 'serious', 'blunder', 'catastrophic'];

interface FeedbackText { label: string; summary: string }

// ---------------------------------------------------------------------------
// Standard tone
// ---------------------------------------------------------------------------

const standardPositive: Record<string, FeedbackText> = {
  best:      { label: 'Best move!',       summary: 'This is the engine\'s top choice.' },
  excellent: { label: 'Excellent move.',   summary: 'Virtually indistinguishable from the engine\'s top pick.' },
  good:      { label: 'Good move.',        summary: 'A small edge was left on the table, but this is a perfectly reasonable choice.' },
  playable:  { label: 'Reasonable move.',  summary: 'Not the strongest continuation, but a playable choice.' },
};

const standardNegative: Record<LearnableReasonCode, Record<string, FeedbackText>> = {
  'swing': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'A slightly stronger continuation was available.' },
    mistake:      { label: 'Mistake.',                 summary: 'The move played gave up a meaningful part of your advantage.' },
    serious:      { label: 'Serious mistake.',         summary: 'A much stronger move was available \u2014 this significantly weakened your position.' },
    blunder:      { label: 'Blunder.',                 summary: 'This move threw away a major advantage. The position has fundamentally changed.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'The position went from clearly favorable to lost in a single move.' },
  },
  'missed-mate': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'A forced checkmate sequence was available but a slower path was chosen.' },
    mistake:      { label: 'Mistake.',                 summary: 'A forced checkmate was available. The chosen move lets the opponent fight on.' },
    serious:      { label: 'Serious mistake.',         summary: 'A forced checkmate was on the board and was missed entirely.' },
    blunder:      { label: 'Blunder.',                 summary: 'Checkmate was right there. This move lets the opponent escape.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'Checkmate in one was available and was not played.' },
  },
  'collapse': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'A clearly winning position was slightly weakened.' },
    mistake:      { label: 'Mistake.',                 summary: 'A clearly winning position was damaged \u2014 the advantage has shrunk significantly.' },
    serious:      { label: 'Serious mistake.',         summary: 'A won game was thrown into doubt. The opponent is back in it.' },
    blunder:      { label: 'Blunder.',                 summary: 'A completely winning position was squandered.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'A completely won position was thrown away. The game may now be lost.' },
  },
  'defensive': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'A slightly more resilient defensive move was available.' },
    mistake:      { label: 'Mistake.',                 summary: 'A defensive resource was available that would have kept the game alive.' },
    serious:      { label: 'Serious mistake.',         summary: 'A critical saving move was missed. The position is now much harder to hold.' },
    blunder:      { label: 'Blunder.',                 summary: 'A saving move existed that could have turned the game around \u2014 it was missed.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'The one move that could have saved the game was not played.' },
  },
  'punish': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'The opponent\'s error went partially unpunished \u2014 a stronger reply was available.' },
    mistake:      { label: 'Mistake.',                 summary: 'The opponent made a clear error and it was not fully exploited.' },
    serious:      { label: 'Serious mistake.',         summary: 'The opponent handed you a significant advantage and it was not seized.' },
    blunder:      { label: 'Blunder.',                 summary: 'The opponent\'s blunder went completely unpunished.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'The opponent handed you a decisive advantage and it slipped through your fingers.' },
  },
};

// ---------------------------------------------------------------------------
// Harsh tone
// ---------------------------------------------------------------------------

const harshPositive: Record<string, FeedbackText> = {
  best:      { label: 'Best move.',  summary: 'Even a broken clock is right twice a day.' },
  excellent: { label: 'Fine.',       summary: 'Not the best, but close enough that I\'ll let it slide.' },
  good:      { label: 'Adequate.',   summary: 'You left a little on the table. The engine noticed.' },
  playable:  { label: 'Passable.',   summary: 'The engine would not have played this.' },
};

const harshNegative: Record<LearnableReasonCode, Record<string, FeedbackText>> = {
  'swing': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'There was a better move. You did not find it.' },
    mistake:      { label: 'Mistake.',                 summary: 'You had something good and you let it go.' },
    serious:      { label: 'Serious mistake.',         summary: 'The engine is embarrassed on your behalf.' },
    blunder:      { label: 'Blunder.',                 summary: 'You just donated material to charity.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'This move should come with a trigger warning.' },
  },
  'missed-mate': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'You found a checkmate. Just not the fastest one.' },
    mistake:      { label: 'Mistake.',                 summary: 'Checkmate was right there. You looked the other way.' },
    serious:      { label: 'Serious mistake.',         summary: 'The checkmate was gift-wrapped and you returned it.' },
    blunder:      { label: 'Blunder.',                 summary: 'Mate was on the board. You chose suffering instead.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'Mate in one. You missed mate in one.' },
  },
  'collapse': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'You were winning. Emphasis on \u201cwere.\u201d' },
    mistake:      { label: 'Mistake.',                 summary: 'Your advantage just filed for divorce.' },
    serious:      { label: 'Serious mistake.',         summary: 'Congratulations, you\'ve made this a game again.' },
    blunder:      { label: 'Blunder.',                 summary: 'You snatched defeat from the jaws of victory.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'The engine would like to speak with your manager.' },
  },
  'defensive': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'There was a tougher defense. You chose the easy way out.' },
    mistake:      { label: 'Mistake.',                 summary: 'You could have made your opponent work for it. You didn\'t.' },
    serious:      { label: 'Serious mistake.',         summary: 'The life raft was right there. You swam past it.' },
    blunder:      { label: 'Blunder.',                 summary: 'There was one way to survive. This was not it.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'You resigned three moves early \u2014 you just don\'t know it yet.' },
  },
  'punish': {
    inaccuracy:   { label: 'Inaccuracy.',             summary: 'Your opponent blundered and you barely noticed.' },
    mistake:      { label: 'Mistake.',                 summary: 'Free material was on the table. You left it there.' },
    serious:      { label: 'Serious mistake.',         summary: 'Your opponent handed you the game and you handed it back.' },
    blunder:      { label: 'Blunder.',                 summary: 'Your opponent played the worst move on the board and you matched them.' },
    catastrophic: { label: 'Catastrophic blunder.',    summary: 'They blundered. You blundered harder. Impressive.' },
  },
};

// ---------------------------------------------------------------------------
// ALL_FEEDBACK — complete matrix for dashboard/lookbook consumers
// ---------------------------------------------------------------------------

type FeedbackMatrix = Record<LearnableReasonCode, Record<SeverityTier, FeedbackText>>;

function buildMatrix(
  positive: Record<string, FeedbackText>,
  negative: Record<LearnableReasonCode, Record<string, FeedbackText>>,
): FeedbackMatrix {
  const reasonCodes: LearnableReasonCode[] = ['swing', 'missed-mate', 'collapse', 'defensive', 'punish'];
  const result = {} as FeedbackMatrix;
  for (const rc of reasonCodes) {
    const entries = {} as Record<SeverityTier, FeedbackText>;
    for (const tier of POSITIVE_TIERS) {
      entries[tier] = positive[tier]!;
    }
    for (const tier of NEGATIVE_TIERS) {
      entries[tier] = negative[rc][tier]!;
    }
    result[rc] = entries;
  }
  return result;
}

export const ALL_FEEDBACK: Readonly<Record<FeedbackTone, FeedbackMatrix>> = {
  standard: buildMatrix(standardPositive, standardNegative),
  harsh:    buildMatrix(harshPositive, harshNegative),
};

// ---------------------------------------------------------------------------
// getSeverityFeedback — primary consumer API
// ---------------------------------------------------------------------------

export function getSeverityFeedback(
  reasonCode: LearnableReasonCode,
  loss: number,
  isExactBest: boolean,
  tone: FeedbackTone = 'standard',
): SeverityFeedback {
  const tierId = classifySeverity(loss, isExactBest);
  const tier = getTierMeta(tierId);
  const text = ALL_FEEDBACK[tone][reasonCode][tierId];
  return { tier, label: text.label, summary: text.summary };
}

// ---------------------------------------------------------------------------
// Eval box grades — 10-grade system for LFYM dual eval boxes
// ---------------------------------------------------------------------------

export type EvalBoxGrade =
  | 'checkmate'
  | 'exact'
  | 'near-perfect'
  | 'close'
  | 'acceptable'
  | 'off-target'
  | 'wide-miss'
  | 'far-off'
  | 'way-off'
  | 'wrong';

export interface EvalBoxGradeMeta {
  id: EvalBoxGrade;
  label: string;
  color: string;
  /** Win-chance loss floor (inclusive). */
  lossFloor: number;
  /** Win-chance loss ceiling (exclusive). Infinity for the worst grade. */
  lossCeiling: number;
}

export const EVAL_BOX_GRADES: readonly EvalBoxGradeMeta[] = [
  { id: 'checkmate',    label: 'Checkmate!',       color: '#a855f7', lossFloor: 0,    lossCeiling: 0        },
  { id: 'exact',        label: 'Exact match',      color: '#26a641', lossFloor: 0,    lossCeiling: 0        },
  { id: 'near-perfect', label: 'Near perfect',     color: '#57ab5a', lossFloor: 0,    lossCeiling: 0.02     },
  { id: 'close',        label: 'Close',            color: '#7bc67e', lossFloor: 0.02, lossCeiling: 0.04     },
  { id: 'acceptable',   label: 'Acceptable',       color: '#8bb8a8', lossFloor: 0.04, lossCeiling: 0.05     },
  { id: 'off-target',   label: 'Off target',       color: '#56b4e9', lossFloor: 0.05, lossCeiling: 0.10     },
  { id: 'wide-miss',    label: 'Wide miss',        color: '#e69d00', lossFloor: 0.10, lossCeiling: 0.15     },
  { id: 'far-off',      label: 'Far off',          color: '#e06c4e', lossFloor: 0.15, lossCeiling: 0.20     },
  { id: 'way-off',      label: 'Way off',          color: '#db3031', lossFloor: 0.20, lossCeiling: 0.30     },
  { id: 'wrong',        label: 'Completely wrong',  color: '#8b1a1a', lossFloor: 0.30, lossCeiling: Infinity },
] as const;

const _evalGradeMap: Record<EvalBoxGrade, EvalBoxGradeMeta> = Object.create(null);
for (const g of EVAL_BOX_GRADES) _evalGradeMap[g.id] = g;

export function getEvalBoxGradeMeta(grade: EvalBoxGrade): EvalBoxGradeMeta {
  return _evalGradeMap[grade];
}

export function classifyEvalBoxGrade(loss: number, isExactBest: boolean, isMate: boolean): EvalBoxGrade {
  if (isMate && isExactBest) return 'checkmate';
  if (isExactBest && loss === 0) return 'exact';
  if (loss <= 0.02) return 'near-perfect';
  if (loss <= 0.04) return 'close';
  if (loss <= 0.05) return 'acceptable';
  if (loss <= 0.10) return 'off-target';
  if (loss <= 0.15) return 'wide-miss';
  if (loss <= 0.20) return 'far-off';
  if (loss <= 0.30) return 'way-off';
  return 'wrong';
}

// ---------------------------------------------------------------------------
// Detail line generator — data-grounded context for the "Chosen because:" section
// ---------------------------------------------------------------------------

export interface DetailLineInput {
  reasonCode: LearnableReasonCode;
  tier: SeverityTier;
  playedMoveSan: string;
  bestMoveSan: string;
  /** Formatted eval diff (e.g., "+2.4") from EvalDiff.formatted. Null if unavailable. */
  evalDiffFormatted: string | null;
  /** Mate distance from parent eval. Only set for missed-mate reason. */
  mateDistance: number | null;
}

export function buildDetailLine(input: DetailLineInput, tone: FeedbackTone = 'standard'): string {
  const { reasonCode, tier, playedMoveSan, bestMoveSan, evalDiffFormatted, mateDistance } = input;
  const played = playedMoveSan;
  const best = bestMoveSan;
  const diff = evalDiffFormatted;

  if (tone === 'harsh') return _buildDetailLineHarsh(played, best, diff, mateDistance, reasonCode, tier);

  switch (reasonCode) {
    case 'swing':
      if (tier === 'inaccuracy' || tier === 'playable')
        return 'The engine found a slightly stronger continuation.';
      if (diff)
        return `${played} was played instead of ${best}. The evaluation swung by roughly ${diff} pawns.`;
      return `${played} was played instead of ${best}.`;

    case 'missed-mate':
      if (mateDistance !== null)
        return `Forced checkmate in ${mateDistance} was available via ${best}. ${played} was played instead.`;
      return `A forced checkmate sequence was available via ${best}. ${played} was played instead.`;

    case 'collapse':
      if (tier === 'inaccuracy')
        return `A winning position was slightly weakened by ${played}. ${best} held the edge.`;
      if (diff)
        return `${played} cost roughly ${diff} pawns in a winning position. ${best} maintained the advantage.`;
      return `A winning position collapsed with ${played}. ${best} maintained the advantage.`;

    case 'defensive':
      if (tier === 'inaccuracy')
        return `${best} was a tougher defensive try than ${played}.`;
      return `${best} was a more resilient defense. ${played} was played instead.`;

    case 'punish':
      if (tier === 'inaccuracy')
        return `The opponent's previous move was slightly inaccurate. ${best} would have exploited it more precisely.`;
      return `The opponent's previous move was an error. ${best} would have exploited it. ${played} was played instead.`;

    default:
      return `${played} was played instead of ${best}.`;
  }
}

function _buildDetailLineHarsh(
  played: string, best: string, diff: string | null, mateDistance: number | null,
  reasonCode: LearnableReasonCode, tier: SeverityTier,
): string {
  switch (reasonCode) {
    case 'swing':
      if (tier === 'inaccuracy' || tier === 'playable')
        return 'There was a better move. You didn\'t find it.';
      if (diff)
        return `${played} instead of ${best}. That cost you roughly ${diff} pawns.`;
      return `${played} instead of ${best}.`;

    case 'missed-mate':
      if (mateDistance !== null)
        return `Mate in ${mateDistance} via ${best}. You played ${played}.`;
      return `Mate was available via ${best}. You played ${played}.`;

    case 'collapse':
      if (diff)
        return `${played} threw away a won game. ${best} was right there. Cost: ${diff} pawns.`;
      return `${played} threw away a won game. ${best} was right there.`;

    case 'defensive':
      return `${best} would have saved you. ${played} didn't.`;

    case 'punish':
      return `Your opponent blundered. ${best} would have punished it. You played ${played}.`;

    default:
      return `${played} instead of ${best}.`;
  }
}

// ---------------------------------------------------------------------------
// LFYM state messages — all user-facing text in the retro panel
// ---------------------------------------------------------------------------

export interface LfymStateMessages {
  winExact: string;
  winNearBest: string;
  failBetter: string;
  failWorse: string;
  failDefault: string;
  findPrompt: string;
  findPlayed: string;
  viewSolution: string;
  viewBestWas: string;
  offTrackMessage: string;
  offTrackResume: string;
  viewTheSolution: string;
  skipThisMove: string;
  tryAnotherMove: string;
  saveToLibrary: string;
  doItAgain: string;
  sessionTitle: string;
  vindicated: string;
}

export const LFYM_MESSAGES: Readonly<Record<FeedbackTone, LfymStateMessages>> = {
  standard: {
    winExact:         'Good move!',
    winNearBest:      'Good enough!',
    failBetter:       'Better, but not the best move available.',
    failWorse:        'That move is even worse.',
    failDefault:      'You can do better.',
    findPrompt:       'Find a better move for {color}',
    findPlayed:       '{move} was played',
    viewSolution:     'Solution',
    viewBestWas:      'Best was',
    offTrackMessage:  'You browsed away',
    offTrackResume:   'Resume learning',
    viewTheSolution:  'View the solution',
    skipThisMove:     'Skip this move',
    tryAnotherMove:   'Try another move',
    saveToLibrary:    'Save to Library',
    doItAgain:        'Do it again',
    sessionTitle:     'Learn from your mistakes',
    vindicated:       'Actually upon deeper review, you did play the best move during the game.',
  },
  harsh: {
    winExact:         'Well, you got one right.',
    winNearBest:      'Close enough. I\'ll allow it.',
    failBetter:       'Getting warmer. Still wrong.',
    failWorse:        'Somehow you made it worse.',
    failDefault:      'Try harder.',
    findPrompt:       'Find a better move for {color}. It\'s not hard.',
    findPlayed:       '{move} was played. Let\'s fix that.',
    viewSolution:     'Here\'s what you should have played.',
    viewBestWas:      'The answer was',
    offTrackMessage:  'Focus.',
    offTrackResume:   'Get back to work.',
    viewTheSolution:  'Just show me the answer',
    skipThisMove:     'Give up on this one',
    tryAnotherMove:   'Try again.',
    saveToLibrary:    'Save this embarrassment',
    doItAgain:        'Suffer through it again',
    sessionTitle:     'Learn from your mistakes',
    vindicated:       'Fine. You were right this time. Don\'t let it go to your head.',
  },
};

// ---------------------------------------------------------------------------
// Mistake count gradient — session-level messaging based on total moments found
// ---------------------------------------------------------------------------

export type MistakeCountTier =
  | 'clean'
  | 'minor'
  | 'notable'
  | 'concerning'
  | 'rough'
  | 'brutal'
  | 'disaster';

export interface MistakeCountFeedback {
  tier: MistakeCountTier;
  color: string;
  sessionTitle: string;
  sessionIntro: string;
  sessionEnd: string;
  sessionTitleHarsh: string;
  sessionIntroHarsh: string;
  sessionEndHarsh: string;
  countFloor: number;
  countCeiling: number;
}

export const MISTAKE_COUNT_TIERS: readonly MistakeCountFeedback[] = [
  {
    tier: 'clean', color: '#26a641', countFloor: 0, countCeiling: 0,
    sessionTitle: 'Learn from your mistakes',
    sessionIntro: '',
    sessionEnd: 'No mistakes found. Well played.',
    sessionTitleHarsh: 'Learn from your mistakes',
    sessionIntroHarsh: '',
    sessionEndHarsh: 'No mistakes found. Suspiciously clean.',
  },
  {
    tier: 'minor', color: '#57ab5a', countFloor: 1, countCeiling: 2,
    sessionTitle: 'Learn from your mistakes',
    sessionIntro: 'A couple of moments to revisit.',
    sessionEnd: 'Done. Only a few things to tighten up.',
    sessionTitleHarsh: 'Learn from your mistakes',
    sessionIntroHarsh: 'Two moments. You\'ll survive.',
    sessionEndHarsh: 'That wasn\'t too painful.',
  },
  {
    tier: 'notable', color: '#56b4e9', countFloor: 3, countCeiling: 4,
    sessionTitle: 'Learn from your mistakes',
    sessionIntro: 'A few key moments to work through.',
    sessionEnd: 'Done reviewing. Some clear areas to improve.',
    sessionTitleHarsh: 'Learn from your mistakes',
    sessionIntroHarsh: 'A few things went wrong. Let\'s see how wrong.',
    sessionEndHarsh: 'Done. You\'ve got homework.',
  },
  {
    tier: 'concerning', color: '#e69d00', countFloor: 5, countCeiling: 7,
    sessionTitle: 'Learn from your mistakes',
    sessionIntro: 'Several moments need your attention.',
    sessionEnd: 'Done. There were quite a few missed opportunities here.',
    sessionTitleHarsh: 'Learn from your mistakes',
    sessionIntroHarsh: 'This is going to take a while.',
    sessionEndHarsh: 'Done. The engine would like a word.',
  },
  {
    tier: 'rough', color: '#e06c4e', countFloor: 8, countCeiling: 10,
    sessionTitle: 'Learn from your mistakes',
    sessionIntro: 'This game had a lot of room for improvement.',
    sessionEnd: 'Done reviewing. This was a tough game \u2014 lots to learn from.',
    sessionTitleHarsh: 'Learn from your mistakes',
    sessionIntroHarsh: 'This game was not your finest work.',
    sessionEndHarsh: 'Done. That was hard to watch.',
  },
  {
    tier: 'brutal', color: '#db3031', countFloor: 11, countCeiling: 15,
    sessionTitle: 'Learn from your mistakes',
    sessionIntro: 'This game needs serious work. Let\'s go.',
    sessionEnd: 'Done. That was a difficult watch. Plenty of material to drill.',
    sessionTitleHarsh: 'Learn from your mistakes',
    sessionIntroHarsh: 'I hope you\'re sitting down.',
    sessionEndHarsh: 'Done. We don\'t need to talk about it.',
  },
  {
    tier: 'disaster', color: '#8b1a1a', countFloor: 16, countCeiling: Infinity,
    sessionTitle: 'Learn from your mistakes',
    sessionIntro: 'There\'s a lot to unpack here. Buckle up.',
    sessionEnd: 'Done. That was rough \u2014 but every one of these is a chance to improve.',
    sessionTitleHarsh: 'Learn from your mistakes',
    sessionIntroHarsh: 'What happened here?',
    sessionEndHarsh: 'Done. Let\'s never speak of this game again.',
  },
] as const;

export function classifyMistakeCount(count: number): MistakeCountFeedback {
  for (const tier of MISTAKE_COUNT_TIERS) {
    if (count >= tier.countFloor && count <= tier.countCeiling) return tier;
  }
  return MISTAKE_COUNT_TIERS[MISTAKE_COUNT_TIERS.length - 1]!;
}
