





























// --- Answer record types ---

/**
 * Which option pool (win or loss) a completed questionnaire's Game story/Decider answers came
 * from. For a drawn game this is the user's chosen "pathway", not the PGN Result tag.
 */
export type QuestionnaireBranch = 'win' | 'loss';

/** The game's outcome from the STUDYING USER's own perspective (not White's/Black's). */
export type QuestionnaireResult = QuestionnaireBranch | 'draw';

/**
 * Opening Eval's own branch — independent of win/loss (the owner can be "Approved" of a line
 * they lost with, or "Needs Work" on a line they won with).
 */
export type QuestionnaireVerdict = 'approved' | 'needswork';

/** Repetition Practice action-wire sub-answer (P2-ANL-6 / P2-ORP-2): source of the flagged line. */
export type QuestionnaireRepPracticeSource = 'game' | 'exploration';

/**
 * The 7 semantic hue families organizing every option (v2 lookbook §01's "four chess-skill
 * pillars": Knowledge = openings, Skill = planning/tactics/endgame, Event = time/material,
 * Style = character). PROPOSED per the lookbook's own decision record, not re-litigated here.
 */
export type QuestionnaireFamily =
  | 'openings' | 'planning' | 'tactics' | 'endgame' | 'time' | 'material' | 'character';

export interface QuestionnaireOption {
  /** Stable id, minted here (the lookbook has no id field, only labels). Persisted in PGN tags,
   *  so once shipped this must not change even if the label text is later wordsmithed. */
  id: string;
  /** Verbatim option text from the v2 lookbook. */
  label: string;

  family: QuestionnaireFamily;


  icon: string;
}

/**
 * A completed questionnaire's answers. Companion runtime truth lives on
 * `ImportedGame.questionnaire` (src/import/types.ts); the game's annotated PGN carries the
 * portable copy via this module's serialize/parse functions (T1 contract §3).
 */
export interface QuestionnaireAnswers {
  /** Game outcome from the studying user's perspective. */
  result: QuestionnaireResult;
  /** Set only when result === 'draw': which pathway the user routed the draw into. Determines
   *  which branch of Game story / Decider / Opening Eval applies, exactly as an ordinary
   *  win/loss would. */
  drawPathway?: QuestionnaireBranch;
  /** Game story — single-select, primary. An id from STORY_OPTIONS[branch]. */
  story: string;
  /** Decider — ranked multi-select, 1-3 ids from DECIDER_OPTIONS[branch], in click/tap order.
   *  deciders[0] is the PRIMARY decider (drives the P2-QST-7 games-list story chip); the rest
   *  are contributing factors (left-column-only per the v2 lookbook §03). */
  deciders: string[];
  /** Opening Eval — optional single-select, its own verdict branch. */
  openingEval?: { verdict: QuestionnaireVerdict; option: string };
  /** Action wire 1 (P2-ANL-6 / P2-ORP-2): flag lines from this game for repetition practice. */
  repetitionPractice: { flagged: boolean; source?: QuestionnaireRepPracticeSource };
  /** Action wire 2 (P2-LIB-9): "needs study material" search facet. */
  needsStudyMaterial: boolean;
  /** ISO date (YYYY-MM-DD) the questionnaire was completed. Persisted verbatim as the
   *  PatzerStudied tag value (T1 contract §3's own worked example uses this exact format). */
  completedAt: string;
}

/** Branch a completed (or in-progress) answer set resolves to, for option-pool lookups. */
export function questionnaireBranch(
  answers: Pick<QuestionnaireAnswers, 'result' | 'drawPathway'>,
): QuestionnaireBranch {
  return answers.result === 'draw' ? (answers.drawPathway ?? 'win') : answers.result;
}

/** Look up an option by id within a given pool (e.g. STORY_OPTIONS[branch]). */
export function findQuestionnaireOption(
  pool: QuestionnaireOption[],
  id: string,
): QuestionnaireOption | undefined {
  return pool.find(option => option.id === id);
}

// --- Option slate (v2 lookbook: ids minted here, labels/icons/families verbatim) ---

export const QUESTIONNAIRE_FAMILIES: Record<QuestionnaireFamily, { name: string; pillar: string }> = {
  openings:  { name: 'Openings & Theory',                pillar: 'Knowledge' },
  planning:  { name: 'Middlegame Planning & Position',   pillar: 'Skill' },
  tactics:   { name: 'Tactics & Calculation',            pillar: 'Skill' },
  endgame:   { name: 'Endgame & Conversion',             pillar: 'Skill' },
  time:      { name: 'Time, Clock & Flagging',           pillar: 'Event' },
  material:  { name: 'Material & Blunders',              pillar: 'Event' },
  character: { name: 'Game Character & Narrative',       pillar: 'Style' },
};

/** Game story — single-select, primary (v2 lookbook §02). */
export const STORY_OPTIONS: Record<QuestionnaireBranch, QuestionnaireOption[]> = {
  win: [
    { id: 'clean-win',      label: 'Clean Win',      family: 'character', icon: 'check-circle-2' },
    { id: 'messy-win',      label: 'Messy Win',      family: 'character', icon: 'shuffle' },
    { id: 'flag-to-win',    label: 'Flag to Win',    family: 'time',      icon: 'flag' },
    { id: 'opening-theory', label: 'Opening Theory', family: 'openings',  icon: 'book-open' },
  ],
  loss: [
    { id: 'time-management',   label: 'Time Management',   family: 'time',     icon: 'clock' },
    { id: 'failed-to-convert', label: 'Failed to Convert', family: 'endgame',  icon: 'trending-down' },
    { id: 'big-blunder',       label: 'Big Blunder',       family: 'material', icon: 'alert-triangle' },
    { id: 'opening-theory',    label: 'Opening Theory',    family: 'openings', icon: 'book-open' },
    { id: 'endgame',           label: 'Endgame',           family: 'endgame',  icon: 'crown' },
  ],
};

/** Decider — ranked multi-select, capped at 3 (v2 lookbook §03). */
export const DECIDER_OPTIONS: Record<QuestionnaireBranch, QuestionnaireOption[]> = {
  win: [
    { id: 'found-winning-tactic',         label: 'Found Winning Tactic',         family: 'tactics',  icon: 'zap' },
    { id: 'had-better-theory',            label: 'Had Better Theory',            family: 'openings', icon: 'book-open' },
    { id: 'endgame-technique',            label: 'Endgame Technique',            family: 'endgame',  icon: 'crown' },
    { id: 'opponent-blundered-material',  label: 'Opponent Blundered Material',  family: 'material', icon: 'piece-drop' },
    { id: 'clock-pressure-won',           label: 'Clock Pressure Won',           family: 'time',     icon: 'hourglass' },
    { id: 'flagged-from-losing-position', label: 'Flagged from Losing Position', family: 'time',     icon: 'flag' },
    { id: 'endgame-swindle',              label: 'Endgame Swindle',              family: 'endgame',  icon: 'trending-up' },
  ],
  loss: [
    { id: 'no-clear-plans',               label: 'No Clear Plans',                family: 'planning', icon: 'compass' },
    { id: 'opening-theory',               label: 'Opening Theory',                family: 'openings', icon: 'book-open' },
    { id: 'endgame-failure',              label: 'Endgame Failure',               family: 'endgame',  icon: 'crown' },
    { id: 'did-not-spot-tactic',          label: 'Did Not Spot Tactic',           family: 'tactics',  icon: 'eye-off' },
    { id: 'blundered-material',           label: 'Blundered Material',            family: 'material', icon: 'piece-drop' },
    { id: 'blundered-mating-sequence',    label: 'Blundered Mating Sequence',     family: 'material', icon: 'skull' },
    { id: 'opening-trap',                 label: 'Opening Trap',                  family: 'openings', icon: 'alert-triangle' },
    { id: 'outside-of-learned-repertoire',label: 'Outside of Learned Repertoire', family: 'openings', icon: 'map' },
    { id: 'flagged-in-equal-scramble',    label: 'Flagged in Equal Scramble',     family: 'time',     icon: 'flag' },
    { id: 'flagged-from-time-management', label: 'Flagged from Time Management', family: 'time',     icon: 'flag' },
  ],
};

/** Opening Eval — optional single-select, its own verdict branch (v2 lookbook §04). */
export const OPENING_EVAL_OPTIONS: Record<QuestionnaireVerdict, QuestionnaireOption[]> = {
  approved: [
    { id: 'like-my-line-even-though-i-lost', label: 'I like my line even though I lost',               family: 'openings',  icon: 'heart' },
    { id: 'instructive-game',                label: 'Instructive game',                                 family: 'character', icon: 'lightbulb' },
    { id: 'good-line-needs-improvement',     label: 'Good Line, Needs Improvement in Middlegame Plans', family: 'planning',  icon: 'compass' },
    { id: 'left-book-outplayed-them',        label: 'Left Book, Outplayed Them',                        family: 'openings',  icon: 'log-out' },
    { id: 'punished-a-gambit',               label: 'Punished a Gambit',                                family: 'openings',  icon: 'shield-check' },
    { id: 'opening-was-good-but-flagged',    label: 'Opening Was Good, but I Flagged',                  family: 'time',      icon: 'flag' },
  ],
  needswork: [
    { id: 'dont-know-theory',             label: "Don't Know Theory",                              family: 'openings', icon: 'circle-help' },
    { id: 'bad-line-positional-squeeze',  label: 'Bad Line, into Bad Positional Squeeze',           family: 'planning', icon: 'shrink' },
    { id: 'forgot-my-studied-line',       label: 'Forgot My Studied Line',                          family: 'openings', icon: 'history' },
    { id: 'misapplied-theory-wrong-spot', label: 'Misapplied Theory in Wrong Spot',                 family: 'openings', icon: 'circle-slash' },
    { id: 'fell-for-a-trap',              label: 'Fell for a Trap',                                 family: 'openings', icon: 'alert-triangle' },
    { id: 'fell-for-a-trap-again',        label: "Fell for a Trap I Know I've Fallen for Before",   family: 'openings', icon: 'repeat' },
    { id: 'unfamiliar-need-prep',         label: 'I Am Unfamiliar Here and Need Prep',              family: 'openings', icon: 'search' },
  ],
};

// --- Patzer PGN namespace: serialize (T1 contract §3) ---

function structuredValue(fields: Array<[string, string]>): string {
  return fields.map(([k, v]) => `${k}=${v}`).join(';');
}

/**
 * Build this questionnaire's Patzer-namespace header tags, in the order this module always
 * emits them (contract §2 item 5: "Patzer namespace tags last" — pgnExport.ts appends these
 * after every other header). Structured single-tag values use the contract's own
 * `key=val;key=val` convention (§3) so branch/verdict context travels with each answer without
 * minting a tag per field.
 */
export function serializeQuestionnaireTags(answers: QuestionnaireAnswers): [string, string][] {
  const branch = questionnaireBranch(answers);
  const deciders = answers.deciders.slice(0, 3);
  const tags: [string, string][] = [
    ['PatzerStudied', answers.completedAt],
    ['PatzerStory', structuredValue([['branch', branch], ['option', answers.story]])],
    ['PatzerDecider', structuredValue([['branch', branch], ['options', deciders.join(',')]])],
  ];
  if (answers.openingEval) {
    tags.push(['PatzerOpeningEval', structuredValue([
      ['verdict', answers.openingEval.verdict],
      ['option', answers.openingEval.option],
    ])]);
  }
  if (answers.needsStudyMaterial) tags.push(['PatzerNeedsMaterial', 'true']);
  if (answers.repetitionPractice.flagged) {
    tags.push(['PatzerRepPractice', answers.repetitionPractice.source ?? 'game']);
  }
  return tags;
}

/**
 * Build the human-readable `{ Patzer: ... }` summary comment (T1 contract §3's "dual-home"
 * copy) — emitted immediately before move 1 by pgnExport.ts. This is the survives-everywhere
 * copy of the same facts; it is NOT reparsed (parseQuestionnaireFromPgn below reads the header
 * tags only), so its wording can evolve freely without breaking round-trips.
 */
export function buildQuestionnaireSummaryComment(answers: QuestionnaireAnswers): string {
  const branch = questionnaireBranch(answers);
  const storyOption = findQuestionnaireOption(STORY_OPTIONS[branch], answers.story);
  const deciderLabels = answers.deciders
    .map(id => findQuestionnaireOption(DECIDER_OPTIONS[branch], id)?.label)
    .filter((label): label is string => label !== undefined);

  const parts: string[] = [
    answers.result === 'draw' ? `Draw (felt like a ${branch})` : (branch === 'win' ? 'Win' : 'Loss'),
  ];
  if (storyOption) parts.push(storyOption.label);
  if (deciderLabels.length > 0) parts.push(`Decider: ${deciderLabels.join(' > ')}`);
  if (answers.openingEval) {
    const evalOption = findQuestionnaireOption(
      OPENING_EVAL_OPTIONS[answers.openingEval.verdict],
      answers.openingEval.option,
    );
    if (evalOption) parts.push(`Opening: ${evalOption.label}`);
  }
  if (answers.repetitionPractice.flagged) parts.push('Flagged for Repetition Practice');
  if (answers.needsStudyMaterial) parts.push('Needs study material');
  return `{ Patzer: ${parts.join(' · ')} }`;
}

// --- Patzer PGN namespace: parse ---

// Mirrors src/import/types.ts parsePgnHeader's regex exactly, duplicated locally (rather than
// imported) so this module stays import-free — see the file header note on why that matters for
// the Node-bundled test harness.
function readHeaderTag(pgn: string, tag: string): string | undefined {
  return pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`))?.[1];
}

function parseStructuredValue(value: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const pair of value.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    fields[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return fields;
}

/**
 * Parse a questionnaire back out of a game's PGN text (header tags only — the summary comment
 * is a human-readable copy, not a parse source). Returns undefined when `PatzerStudied` is
 * absent, which is the "no questionnaire" case for every legacy game and every game that has not
 * been studied yet — a clean, non-throwing default, not an error.
 */
export function parseQuestionnaireFromPgn(pgn: string): QuestionnaireAnswers | undefined {
  const completedAt = readHeaderTag(pgn, 'PatzerStudied');
  if (!completedAt) return undefined;

  const storyFields = parseStructuredValue(readHeaderTag(pgn, 'PatzerStory') ?? '');
  const branch: QuestionnaireBranch = storyFields.branch === 'loss' ? 'loss' : 'win';

  const deciderFields = parseStructuredValue(readHeaderTag(pgn, 'PatzerDecider') ?? '');
  const deciders = (deciderFields.options ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
    .slice(0, 3);

  // A draw is knowable purely from the standard Result tag (always present, contract §2's
  // seven-tag roster) regardless of which color the studying user played — no separate
  // PatzerResult tag is needed. Everything else (branch/story/decider/eval) is symmetric to an
  // ordinary win/loss questionnaire once the draw's chosen pathway is known.
  const isDraw = readHeaderTag(pgn, 'Result') === '1/2-1/2';

  let openingEval: QuestionnaireAnswers['openingEval'];
  const openingEvalTag = readHeaderTag(pgn, 'PatzerOpeningEval');
  if (openingEvalTag) {
    const fields = parseStructuredValue(openingEvalTag);
    if (fields.option) {
      openingEval = {
        verdict: fields.verdict === 'needswork' ? 'needswork' : 'approved',
        option: fields.option,
      };
    }
  }

  const repPracticeTag = readHeaderTag(pgn, 'PatzerRepPractice');

  return {
    result: isDraw ? 'draw' : branch,
    ...(isDraw ? { drawPathway: branch } : {}),
    story: storyFields.option ?? '',
    deciders,
    ...(openingEval ? { openingEval } : {}),
    repetitionPractice: repPracticeTag
      ? { flagged: true as const, source: (repPracticeTag === 'exploration' ? 'exploration' : 'game') as QuestionnaireRepPracticeSource }
      : { flagged: false as const },
    needsStudyMaterial: readHeaderTag(pgn, 'PatzerNeedsMaterial') === 'true',
    completedAt,
  };
}
