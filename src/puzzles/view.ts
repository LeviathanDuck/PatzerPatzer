import { h, type VNode } from 'snabbdom';
import { uciToSan } from '../board/index';
import type { PuzzleCtrl } from './ctrl';
import type {
  ImportedPuzzleFilters,
  ImportedPuzzleLibraryState,
  ImportedPuzzleRecord,
  PuzzleLibrarySource,
  PuzzleRound,
  PuzzleSessionRecent,
  SavedPuzzleRound,
  StoredPuzzleSession,
} from './types';

// --- Theme taxonomy ---
// Adapted from lichess-org/lila: ui/puzzle/src/interfaces.ts ThemeKey + PuzzleTheme.scala categories.
// Only themes present in the manifest will be rendered.

interface ThemeDef { key: string; name: string; }
interface ThemeCategory { label: string; themes: ThemeDef[]; }

const PUZZLE_THEME_CATEGORIES: ThemeCategory[] = [
  {
    label: 'Game Phase',
    themes: [
      { key: 'opening',          name: 'Opening' },
      { key: 'middlegame',       name: 'Middlegame' },
      { key: 'endgame',          name: 'Endgame' },
      { key: 'rookEndgame',      name: 'Rook Endgame' },
      { key: 'bishopEndgame',    name: 'Bishop Endgame' },
      { key: 'pawnEndgame',      name: 'Pawn Endgame' },
      { key: 'knightEndgame',    name: 'Knight Endgame' },
      { key: 'queenEndgame',     name: 'Queen Endgame' },
      { key: 'queenRookEndgame', name: 'Queen & Rook Endgame' },
    ],
  },
  {
    label: 'Tactics',
    themes: [
      { key: 'fork',              name: 'Fork' },
      { key: 'pin',               name: 'Pin' },
      { key: 'skewer',            name: 'Skewer' },
      { key: 'discoveredAttack',  name: 'Discovered Attack' },
      { key: 'discoveredCheck',   name: 'Discovered Check' },
      { key: 'doubleCheck',       name: 'Double Check' },
      { key: 'xRayAttack',        name: 'X-Ray Attack' },
      { key: 'hangingPiece',      name: 'Hanging Piece' },
      { key: 'capturingDefender', name: 'Capture the Defender' },
      { key: 'trappedPiece',      name: 'Trapped Piece' },
      { key: 'sacrifice',         name: 'Sacrifice' },
      { key: 'clearance',         name: 'Clearance' },
      { key: 'attraction',        name: 'Attraction' },
      { key: 'deflection',        name: 'Deflection' },
      { key: 'advancedPawn',      name: 'Advanced Pawn' },
      { key: 'attackingF2F7',     name: 'Attack on f2/f7' },
      { key: 'exposedKing',       name: 'Exposed King' },
      { key: 'kingsideAttack',    name: 'Kingside Attack' },
      { key: 'queensideAttack',   name: 'Queenside Attack' },
      { key: 'promotion',         name: 'Promotion' },
      { key: 'underPromotion',    name: 'Underpromotion' },
      { key: 'crushing',          name: 'Crushing' },
      { key: 'advantage',         name: 'Advantage' },
    ],
  },
  {
    label: 'Advanced Concepts',
    themes: [
      { key: 'defensiveMove',  name: 'Defensive Move' },
      { key: 'interference',   name: 'Interference' },
      { key: 'intermezzo',     name: 'Intermezzo' },
      { key: 'quietMove',      name: 'Quiet Move' },
      { key: 'zugzwang',       name: 'Zugzwang' },
      { key: 'equality',       name: 'Equality' },
      { key: 'collinear',      name: 'Collinear' },
      { key: 'collinearMove',  name: 'Collinear Move' },
    ],
  },
  {
    label: 'Checkmate Patterns',
    themes: [
      { key: 'mate',             name: 'Checkmate' },
      { key: 'mateIn1',          name: 'Mate in 1' },
      { key: 'mateIn2',          name: 'Mate in 2' },
      { key: 'mateIn3',          name: 'Mate in 3' },
      { key: 'mateIn4',          name: 'Mate in 4' },
      { key: 'mateIn5',          name: 'Mate in 5+' },
      { key: 'anastasiaMate',    name: "Anastasia's Mate" },
      { key: 'arabianMate',      name: 'Arabian Mate' },
      { key: 'backRankMate',     name: 'Back Rank Mate' },
      { key: 'balestraMate',     name: 'Balestra Mate' },
      { key: 'blindSwineMate',   name: 'Blind Swine Mate' },
      { key: 'bodenMate',        name: "Boden's Mate" },
      { key: 'cornerMate',       name: 'Corner Mate' },
      { key: 'doubleBishopMate', name: 'Double Bishop Mate' },
      { key: 'dovetailMate',     name: 'Dovetail Mate' },
      { key: 'epauletteMate',    name: 'Épaulette Mate' },
      { key: 'hookMate',         name: 'Hook Mate' },
      { key: 'killBoxMate',      name: 'Kill Box Mate' },
      { key: 'morphysMate',      name: "Morphy's Mate" },
      { key: 'operaMate',        name: 'Opera Mate' },
      { key: 'pillsburysMate',   name: "Pillsbury's Mate" },
      { key: 'smotheredMate',    name: 'Smothered Mate' },
      { key: 'swallowstailMate', name: 'Swallowtail Mate' },
      { key: 'triangleMate',     name: 'Triangle Mate' },
      { key: 'vukovicMate',      name: 'Vukovic Mate' },
    ],
  },
  {
    label: 'Length',
    themes: [
      { key: 'oneMove',  name: 'One Move' },
      { key: 'short',    name: 'Short (2–3)' },
      { key: 'long',     name: 'Long (4–5)' },
      { key: 'veryLong', name: 'Very Long (6+)' },
    ],
  },
  {
    label: 'Other',
    themes: [
      { key: 'castling',        name: 'Castling' },
      { key: 'enPassant',       name: 'En Passant' },
      { key: 'master',          name: 'Master Game' },
      { key: 'masterVsMaster',  name: 'Master vs Master' },
      { key: 'superGM',         name: 'Super GM' },
    ],
  },
];

// --- Difficulty presets ---
// Maps named levels to fixed puzzle rating bands.
// Mirrors lichess-org/lila: ui/puzzle/src/ctrl.ts difficulty settings,
// adapted to absolute rating ranges (PatzerPatzer has no user puzzle rating).
const DIFFICULTY_PRESETS = [
  { key: 'easiest', label: 'Easiest', ratingMin: '',     ratingMax: '1200' },
  { key: 'easier',  label: 'Easier',  ratingMin: '1200', ratingMax: '1500' },
  { key: 'normal',  label: 'Normal',  ratingMin: '1500', ratingMax: '1800' },
  { key: 'harder',  label: 'Harder',  ratingMin: '1800', ratingMax: '2100' },
  { key: 'hardest', label: 'Hardest', ratingMin: '2100', ratingMax: ''     },
] as const;

function currentDifficulty(filters: ImportedPuzzleFilters): string {
  for (const p of DIFFICULTY_PRESETS) {
    if (filters.ratingMin === p.ratingMin && filters.ratingMax === p.ratingMax) return p.key;
  }
  return '';
}

function formatOpeningName(key: string): string {
  // "Sicilian_Defense_Dragon_Variation" → "Sicilian Defense: Dragon Variation"
  const parts = key.split('_');
  if (parts.length <= 2) return parts.join(' ');
  const family = parts.slice(0, 2).join(' ');
  const variation = parts.slice(2).join(' ');
  return `${family}: ${variation}`;
}

function formatLoss(loss: number): string {
  return `−${Math.round(loss * 100)}%`;
}

function formatSavedMove(round: SavedPuzzleRound): string {
  const moveNum = Math.ceil(round.source.ply / 2);
  const prefix = round.source.ply % 2 === 1 ? `${moveNum}.` : `${moveNum}…`;
  return `${prefix} ${round.source.san}`;
}

function formatImportedOpening(record: ImportedPuzzleRecord): string {
  return record.openingTags[0] ?? 'No opening tag';
}

function renderSourceSwitch(current: PuzzleLibrarySource, onChange: (source: PuzzleLibrarySource) => void): VNode {
  return h('div.puzzle-library__sources', [
    h('button', {
      class: { active: current === 'saved' },
      on: { click: () => onChange('saved') },
    }, 'Saved Puzzles'),
    h('button', {
      class: { active: current === 'lichess' },
      on: { click: () => onChange('lichess') },
    }, 'Imported Lichess'),
  ]);
}

function renderSavedPuzzleLibrary(deps: {
  rounds: SavedPuzzleRound[];
  currentPuzzleKey: string | null;
  recentResultForKey: (key: string) => string | null;
  isResumeKey: (key: string) => boolean;
}): VNode {
  const { rounds, currentPuzzleKey, recentResultForKey, isResumeKey } = deps;
  if (rounds.length === 0) {
    return h('div.puzzle-library__empty-body', [
      h('p', 'No saved puzzles yet.'),
      h('p', 'Review games, save missed tactics, and they will appear here as local training rounds.'),
      h('a', { attrs: { href: '#/games' } }, 'Go to My Games'),
    ]);
  }

  return h('ul.puzzle-library__list', rounds.map(round => {
    const result = recentResultForKey(round.key);
    const resume = isResumeKey(round.key) || currentPuzzleKey === round.key;
    const source = round.sourceGame
      ? `${round.sourceGame.white ?? 'White'} vs ${round.sourceGame.black ?? 'Black'}`
      : 'Source game unavailable';
    return h('li.puzzle-library__item', [
      h('div.puzzle-library__main', [
        h('div.puzzle-library__move', formatSavedMove(round)),
        h('div.puzzle-library__meta', [
          h('span', formatLoss(round.source.loss)),
          h('span', `Best: ${uciToSan(round.startFen, round.source.bestMove)}`),
          h('span', source),
        ]),
      ]),
      h('div.puzzle-library__actions', [
        result ? h('span.puzzle-library__badge', result) : null,
        round.sourceGame
          ? h('a.button', { attrs: { href: `#/puzzles/${round.routeId}` } }, resume ? 'Resume' : 'Solve')
          : h('span.puzzle-library__badge', 'Unavailable'),
      ]),
    ]);
  }));
}

// --- Active filter summary chips ---
// Shows one dismissible chip per active filter; "Clear all" appears when ≥2 are active.
function renderActiveFilterSummary(
  filters: ImportedPuzzleFilters,
  onRatingMin: (v: string) => void,
  onRatingMax: (v: string) => void,
  onThemes: (v: string[]) => void,
  onOpening: (v: string) => void,
): VNode | null {
  const chips: VNode[] = [];

  if (filters.ratingMin || filters.ratingMax) {
    const min = filters.ratingMin.trim();
    const max = filters.ratingMax.trim();
    const label = min && max ? `${min}–${max}` : min ? `>${min}` : `<${max}`;
    chips.push(h('span.puzzle-filter__chip', [
      h('span', label),
      h('button.puzzle-filter__chip-clear', {
        attrs: { title: 'Clear rating filter' },
        on: { click: () => { onRatingMin(''); onRatingMax(''); } },
      }, '×'),
    ]));
  }

  if (filters.themes.length > 0) {
    const label = filters.themes.length === 1 ? filters.themes[0]! : `${filters.themes.length} themes`;
    chips.push(h('span.puzzle-filter__chip', [
      h('span', label),
      h('button.puzzle-filter__chip-clear', {
        attrs: { title: 'Clear theme filter' },
        on: { click: () => onThemes([]) },
      }, '×'),
    ]));
  }

  if (filters.opening) {
    const shortName = filters.opening.split('_').slice(0, 2).join(' ');
    chips.push(h('span.puzzle-filter__chip', [
      h('span', shortName),
      h('button.puzzle-filter__chip-clear', {
        attrs: { title: 'Clear opening filter' },
        on: { click: () => onOpening('') },
      }, '×'),
    ]));
  }

  if (chips.length === 0) return null;

  return h('div.puzzle-filter__active-summary', [
    ...chips,
    chips.length >= 2
      ? h('button.puzzle-filter__clear-all', {
          on: { click: () => { onRatingMin(''); onRatingMax(''); onThemes([]); onOpening(''); } },
        }, 'Clear all')
      : null,
  ]);
}

// --- Difficulty preset pills ---
// Replaces the <select> with pill buttons showing a live numeric range label.
// Adapted from lichess-org/lila: ui/puzzle/src/view/side.ts renderDifficultyForm intent;
// diverges to expose numeric bands directly rather than relative offset labels.
function renderDifficultyStrip(
  filters: ImportedPuzzleFilters,
  onRatingMin: (v: string) => void,
  onRatingMax: (v: string) => void,
): VNode {
  const active = currentDifficulty(filters);
  const min = filters.ratingMin.trim();
  const max = filters.ratingMax.trim();
  const rangeLabel = !min && !max ? 'All ratings'
    : min && max ? `${min}–${max}`
    : min ? `>${min}`
    : `<${max}`;

  return h('div.puzzle-filter__difficulty', [
    h('span.puzzle-filter__label', 'Difficulty'),
    h('div.puzzle-filter__preset-row', [
      ...DIFFICULTY_PRESETS.map(p =>
        h('button.puzzle-filter__preset-pill', {
          class: { active: active === p.key },
          on: { click: () => { onRatingMin(p.ratingMin); onRatingMax(p.ratingMax); } },
          attrs: { title: `${p.ratingMin || '0'}–${p.ratingMax || '3500'}` },
        }, p.label),
      ),
    ]),
    h('div.puzzle-filter__rating-inputs', [
      h('input.puzzle-filter__rating-input', {
        attrs: { type: 'number', placeholder: 'Min', min: '0', max: '3500', step: '50' },
        props: { value: filters.ratingMin },
        on: { change: (e: Event) => onRatingMin((e.target as HTMLInputElement).value.trim()) },
      }),
      h('span.puzzle-filter__rating-sep', '–'),
      h('input.puzzle-filter__rating-input', {
        attrs: { type: 'number', placeholder: 'Max', min: '0', max: '3500', step: '50' },
        props: { value: filters.ratingMax },
        on: { change: (e: Event) => onRatingMax((e.target as HTMLInputElement).value.trim()) },
      }),
    ]),
    h('span.puzzle-filter__range-display', rangeLabel),
  ]);
}

// --- Opening selector ---
// Adapted from lichess-org/lila: ui/puzzle/src/view/side.ts renderColorForm (select pattern).
function renderOpeningSelect(
  openings: readonly string[],
  currentOpening: string,
  onOpening: (v: string) => void,
): VNode {
  return h('div.puzzle-filter__select', [
    h('label.puzzle-filter__label', { attrs: { for: 'puzzle-opening-sel' } }, 'Opening'),
    h('select.puzzle-opening__selector', {
      attrs: { id: 'puzzle-opening-sel' },
      on: { change: (e: Event) => onOpening((e.target as HTMLSelectElement).value) },
    }, [
      h('option', { attrs: { value: '' }, props: { selected: currentOpening === '' } }, 'All openings'),
      ...openings.map(opening =>
        h('option', {
          attrs: { value: opening },
          props: { selected: currentOpening === opening },
        }, formatOpeningName(opening)),
      ),
    ]),
  ]);
}

// --- Theme grid ---
// Adapted from lichess-org/lila: ui/puzzle/css/_themes.scss and view/theme.ts.
// Cards use the .puzzle-themes__link layout (flex row, prominent h3) from Lichess's
// /training/themes page. No SVG illustrations — name-only cards for the local dataset.
// Multi-select theme grid — each tile toggles its key in/out of the selected set.
// OR semantics: puzzles matching any selected theme are returned.
// Adapted from lichess-org/lila: ui/puzzle/src/view/side.ts renderThemes multi-pick pattern.

// Category collapse state: tracks which category labels are currently folded.
// "Checkmate Patterns" starts collapsed (long list, users often want Tactics only).
const collapsedCategories = new Set<string>(['Checkmate Patterns']);

function renderThemeGrid(
  availableThemes: readonly string[],
  selectedThemes: string[],
  onThemes: (keys: string[]) => void,
  redraw: () => void,
): VNode {
  const themeSet = new Set(availableThemes);
  const selectedSet = new Set(selectedThemes);
  const categories = PUZZLE_THEME_CATEGORIES
    .map(cat => {
      const catThemes = cat.themes.filter(t => themeSet.has(t.key));
      if (catThemes.length === 0) return null;
      const isCollapsed = collapsedCategories.has(cat.label);
      return h('div.puzzle-themes__category', { class: { collapsed: isCollapsed } }, [
        h('button.puzzle-themes__category-label', {
          on: {
            click: () => {
              if (isCollapsed) collapsedCategories.delete(cat.label);
              else collapsedCategories.add(cat.label);
              redraw();
            },
          },
        }, [
          h('span', cat.label),
          h('span.puzzle-themes__collapse-icon', isCollapsed ? '▶' : '▼'),
        ]),
        isCollapsed ? null : h('div.puzzle-themes__list',
          catThemes.map(theme => {
            const isActive = selectedSet.has(theme.key);
            return h('button.puzzle-themes__link', {
              class: { active: isActive },
              on: {
                click: () => {
                  const next = isActive
                    ? selectedThemes.filter(k => k !== theme.key)
                    : [...selectedThemes, theme.key];
                  onThemes(next);
                },
              },
            }, [
              h('span', h('h3', theme.name)),
            ]);
          }),
        ),
      ]);
    })
    .filter((n): n is VNode => n !== null);

  return h('div.puzzle-themes', categories);
}

function renderImportedPuzzleLibrary(deps: {
  state: ImportedPuzzleLibraryState;
  onRatingMin: (value: string) => void;
  onRatingMax: (value: string) => void;
  onThemes: (values: string[]) => void;
  onOpening: (value: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onStartTraining: () => void;
  redraw: () => void;
}): VNode {
  const { state } = deps;

  if (state.status === 'missing') {
    return h('div.puzzle-library__empty-body', [
      h('p', 'No generated Lichess puzzle dataset was found in `public/generated/lichess-puzzles/`.'),
      h('p', 'Run the local download and shard scripts first, then reload this page.'),
    ]);
  }

  if (state.status === 'error') {
    return h('div.puzzle-library__empty-body', [
      h('p', 'The imported puzzle dataset could not be loaded.'),
      state.error ? h('p', state.error) : null,
    ]);
  }

  const manifest = state.manifest;
  const filters = state.query.filters;

  // Settings bar: compact horizontal row of <select> controls, like Lichess's
  // puzzle__side__config section. Theme grid is the primary content below.
  // Adapted from lichess-org/lila: ui/puzzle/src/view/side.ts config() layout.
  const filterPanel = h('div.puzzle-library__filter-panel', [
    h('div.puzzle-filter__settings', [
      renderDifficultyStrip(filters, deps.onRatingMin, deps.onRatingMax),
      manifest?.openings
        ? renderOpeningSelect(manifest.openings, filters.opening, deps.onOpening)
        : null,
    ]),
    renderActiveFilterSummary(filters, deps.onRatingMin, deps.onRatingMax, deps.onThemes, deps.onOpening),
    manifest?.themes
      ? renderThemeGrid(manifest.themes, filters.themes, deps.onThemes, deps.redraw)
      : h('div.puzzle-library__empty-body', 'Loading puzzle catalog…'),
  ]);

  if (state.status === 'loading') {
    return h('div.puzzle-library__imported', [
      filterPanel,
      h('div.puzzle-library__status', 'Searching puzzles…'),
    ]);
  }

  // Ready — show count, CTA, and browse list.
  const pageLabel = `Page ${state.query.page + 1}`;
  const countLabel = state.items.length === 0
    ? 'No puzzles match the current filters.'
    : `${state.items.length}${state.hasNext ? '+' : ''} puzzles`;

  const ctaBar = h('div.puzzle-library__cta-bar', [
    h('span.puzzle-library__count', countLabel),
    state.items.length > 0
      ? h('button.puzzle-library__train-btn', { on: { click: deps.onStartTraining } }, 'Start Training →')
      : null,
  ]);

  return h('div.puzzle-library__imported', [
    filterPanel,
    ctaBar,
    state.items.length === 0
      ? null
      : h('ul.puzzle-library__list', state.items.map(item => {
          const themeLabel = item.themes.slice(0, 3).join(', ') || 'No themes';
          return h('li.puzzle-library__item', [
            h('div.puzzle-library__main', [
              h('div.puzzle-library__move', `Lichess #${item.id}`),
              h('div.puzzle-library__meta', [
                h('span', `Rating ${item.rating}`),
                item.plays !== undefined ? h('span', `${item.plays.toLocaleString()} plays`) : null,
                h('span', formatImportedOpening(item)),
                h('span', themeLabel),
              ]),
            ]),
            h('div.puzzle-library__actions', [
              h('a.button', { attrs: { href: `#/puzzles/${item.routeId}` } }, 'Solve'),
            ]),
          ]);
        })),
    state.items.length > 0
      ? h('div.puzzle-library__paging', [
          h('div.puzzle-library__paging-actions', [
            h('button', { attrs: { disabled: !state.hasPrev }, on: { click: deps.onPrevPage } }, '← Prev'),
            h('span', pageLabel),
            h('button', { attrs: { disabled: !state.hasNext }, on: { click: deps.onNextPage } }, 'Next →'),
          ]),
        ])
      : null,
  ]);
}

export function renderPuzzleLibrary(deps: {
  source: PuzzleLibrarySource;
  onSourceChange: (source: PuzzleLibrarySource) => void;
  savedRounds: SavedPuzzleRound[];
  importedState: ImportedPuzzleLibraryState;
  session: StoredPuzzleSession;
  currentPuzzleKey: string | null;
  recentResultForKey: (key: string) => string | null;
  isResumeKey: (key: string) => boolean;
  onImportedRatingMin: (value: string) => void;
  onImportedRatingMax: (value: string) => void;
  onImportedThemes: (values: string[]) => void;
  onImportedOpening: (value: string) => void;
  onImportedPrevPage: () => void;
  onImportedNextPage: () => void;
  onStartTraining: () => void;
  redraw: () => void;
}): VNode {
  const resumeKey = deps.currentPuzzleKey ?? deps.session.current?.key ?? null;
  const title = deps.source === 'saved'
    ? `Saved Puzzles (${deps.savedRounds.length})`
    : `Imported Lichess Puzzles (${deps.importedState.manifest?.totalCount ?? '…'})`;
  const subtitle = deps.source === 'saved'
    ? 'Local tactics extracted from your reviewed games.'
    : 'Official Lichess puzzle export, preprocessed into local browser-ready shards.';

  return h('div.puzzle-library', [
    h('div.puzzle-library__header', [
      h('div', [
        h('h2', title),
        h('p', subtitle),
      ]),
      resumeKey
        ? h('a.button', { attrs: { href: `#/puzzles/${encodeURIComponent(resumeKey)}` } }, 'Resume Current Puzzle')
        : null,
    ]),
    renderSourceSwitch(deps.source, deps.onSourceChange),
    deps.source === 'saved'
      ? renderSavedPuzzleLibrary({
          rounds: deps.savedRounds,
          currentPuzzleKey: deps.currentPuzzleKey,
          recentResultForKey: deps.recentResultForKey,
          isResumeKey: deps.isResumeKey,
        })
      : renderImportedPuzzleLibrary({
          state: deps.importedState,
          onRatingMin: deps.onImportedRatingMin,
          onRatingMax: deps.onImportedRatingMax,
          onThemes: deps.onImportedThemes,
          onOpening: deps.onImportedOpening,
          onPrevPage: deps.onImportedPrevPage,
          onNextPage: deps.onImportedNextPage,
          onStartTraining: deps.onStartTraining,
          redraw: deps.redraw,
        }),
  ]);
}

export function renderPuzzleRound(deps: {
  ctrl: PuzzleCtrl;
  onBack: () => void;
  onFlip: () => void;
  onRetry: () => void;
  onViewSolution: () => void;
  onNext: () => void;
  onOpenSourceGame: () => void;
  onNavFirst: () => void;
  onNavPrev: () => void;
  onNavNext: () => void;
  onNavLast: () => void;
  recent: PuzzleSessionRecent[];
  trainingContext: { themes: string[]; opening: string; ratingMin: string; ratingMax: string } | null;
  board: VNode;
  promotionDialog: VNode | null;
  topStrip: VNode;
  bottomStrip: VNode;
}): VNode {
  const round = deps.ctrl.round();
  const [done, total] = deps.ctrl.progress();
  const feedback = deps.ctrl.feedback();
  const result = deps.ctrl.result();

  let label = `Find the best move for ${round.toMove === 'white' ? 'White' : 'Black'}`;
  if (feedback === 'good') label = 'Correct. Keep going.';
  else if (feedback === 'fail') label = 'Not the move. Try again or reveal the line.';
  else if (feedback === 'win') label = 'Solved.';
  else if (feedback === 'view') label = 'Solution shown.';

  const metaRows: VNode[] = [];

  if (round.sourceKind === 'saved') {
    const sourceGame = round.sourceGame;
    const sourceLabel = sourceGame
      ? `${sourceGame.white ?? 'White'} vs ${sourceGame.black ?? 'Black'}`
      : 'Source game unavailable';
    metaRows.push(
      h('dt', 'Source game'),
      h('dd', sourceLabel),
      h('dt', 'Mistake'),
      h('dd', formatSavedMove(round)),
      h('dt', 'Loss'),
      h('dd', formatLoss(round.source.loss)),
      h('dt', 'Best move'),
      h('dd', uciToSan(round.startFen, round.source.bestMove)),
    );
    if (sourceGame?.opening || sourceGame?.eco) {
      metaRows.push(h('dt', 'Opening'), h('dd', sourceGame.opening ?? sourceGame.eco ?? ''));
    }
    if (sourceGame?.date) {
      metaRows.push(h('dt', 'Date'), h('dd', sourceGame.date));
    }
    if (sourceGame?.timeClass) {
      metaRows.push(h('dt', 'Time control'), h('dd', sourceGame.timeClass));
    }
  } else {
    const imported = round.imported;
    metaRows.push(
      h('dt', 'Source'),
      h('dd', 'Imported Lichess puzzle'),
      h('dt', 'Puzzle ID'),
      h('dd', imported.id),
      h('dt', 'Rating'),
      h('dd', String(imported.rating)),
      h('dt', 'Themes'),
      h('dd', imported.themes.join(', ') || 'None'),
      h('dt', 'Opening'),
      h('dd', formatImportedOpening(imported)),
    );
    if (imported.plays !== undefined) {
      metaRows.push(h('dt', 'Plays'), h('dd', imported.plays.toLocaleString()));
    }
    if (imported.popularity !== undefined) {
      metaRows.push(h('dt', 'Popularity'), h('dd', String(imported.popularity)));
    }
  }

  const isTerminal = result === 'solved' || result === 'viewed';

  return h('div.puzzle-round', [
    h('div.analyse__board.main-board.puzzle-round__board-shell', [
      deps.topStrip,
      h('div.analyse__board-inner', [deps.board, deps.promotionDialog]),
      deps.bottomStrip,
      isTerminal
        ? h('div.puzzle-round__nav', [
            h('button', { on: { click: deps.onNavFirst }, attrs: { title: 'First' } }, '|◀'),
            h('button', { on: { click: deps.onNavPrev }, attrs: { title: 'Previous' } }, '◀'),
            h('button', { on: { click: deps.onNavNext }, attrs: { title: 'Next' } }, '▶'),
            h('button', { on: { click: deps.onNavLast }, attrs: { title: 'Last' } }, '▶|'),
          ])
        : null,
    ]),
    h('aside.puzzle-round__side', [
      deps.trainingContext
        ? (() => {
            const ctx = deps.trainingContext;
            const parts: string[] = [];
            if (ctx.themes.length > 0) parts.push(ctx.themes.join(', '));
            if (ctx.opening) parts.push(ctx.opening);
            const ratingMin = ctx.ratingMin.trim();
            const ratingMax = ctx.ratingMax.trim();
            if (ratingMin || ratingMax) {
              parts.push(ratingMin && ratingMax ? `${ratingMin}–${ratingMax}` : ratingMin || ratingMax);
            }
            return parts.length > 0
              ? h('div.puzzle-round__training-context', `Training: ${parts.join(' · ')}`)
              : null;
          })()
        : null,
      h(`section.puzzle-round__feedback.${feedback}`, [
        (result === 'solved' || result === 'viewed')
          ? h('div.puzzle-round__after', [
              h('div.puzzle-round__complete',
                result === 'solved' ? 'Puzzle solved!' : 'Puzzle complete.',
              ),
              h('button.puzzle-round__next', { on: { click: deps.onNext } }, 'Continue training →'),
            ])
          : [
              (feedback === 'good' || feedback === 'win')
                ? h('div.puzzle-round__feedback-icon', '✓')
                : feedback === 'fail'
                  ? h('div.puzzle-round__feedback-icon', '✗')
                  : null,
              h('div.puzzle-round__status', label),
              h('div.puzzle-round__progress', `${done} / ${total}`),
            ],
      ]),
      h('section.puzzle-round__controls', [
        h('button', { on: { click: deps.onBack } }, 'Back to library'),
        h('button', { on: { click: deps.onFlip } }, 'Flip'),
        (result !== 'solved' && result !== 'viewed' && feedback === 'fail')
          ? h('button', { on: { click: deps.onRetry } }, 'Retry')
          : null,
        (result !== 'solved' && result !== 'viewed' && (feedback === 'find' || feedback === 'good' || feedback === 'fail'))
          ? h('button', { on: { click: deps.onViewSolution } }, 'View solution')
          : null,
        deps.recent.length > 0
          ? h('div.puzzle-round__session',
              // Most-recent-first: index 0 is the most recent outcome
              deps.recent.map(r => h(`span.result-dot.result-dot--${r.result}`))
            )
          : null,
      ]),
      h('section.puzzle-round__meta', [
        h('h3', 'Puzzle context'),
        h('dl', metaRows),
        round.sourceKind === 'saved' && round.sourceGame
          ? h('button', { on: { click: deps.onOpenSourceGame } }, 'Open source game')
          : null,
        round.sourceKind === 'imported' && round.imported.gameUrl
          ? h('a.button', {
              attrs: {
                href: round.imported.gameUrl,
                target: '_blank',
                rel: 'noreferrer',
              },
            }, 'Open source on Lichess')
          : null,
      ]),
    ]),
  ]);
}
