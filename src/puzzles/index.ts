import { h, type VNode } from 'snabbdom';
import {
  flip,
  playUciMove,
  renderBoard,
  renderPlayerStrips,
  renderPromotionDialog,
} from '../board/index';
import { syncArrow } from '../engine/ctrl';
import {
  loadAnalysisFromIdb,
  loadPuzzleSessionFromIdb,
  savePuzzleSessionToIdb,
  savedPuzzles,
} from '../idb/index';
import type { ImportedGame } from '../import/types';
import type { Route } from '../router';
import { makePuzzleCtrl } from './ctrl';
import {
  defaultImportedPuzzleQuery,
  findImportedPuzzleRoundByRouteId,
  importedPuzzleLibraryState,
  initImportedPuzzles,
  isImportedPuzzleRouteId,
  requestImportedPuzzleLibrary,
} from './imported';
import { buildPuzzleRound, buildStandalonePuzzleRoot, findSavedPuzzleByRouteId, puzzleRouteHref } from './round';
import { setActivePuzzleCtrl, getActivePuzzleCtrl } from './runtime';
import {
  applyPuzzleSnapshot,
  currentPuzzleIsActive,
  currentPuzzleSnapshot,
  emptyPuzzleSession,
  recentPuzzleResult,
} from './session';
import type {
  PuzzleLibrarySource,
  PuzzleRound,
  SavedPuzzleRound,
  StoredPuzzleSession,
} from './types';
import { renderPuzzleLibrary, renderPuzzleRound } from './view';

let _getImportedGames: () => ImportedGame[] = () => [];
let _getRoute: () => Route = () => ({ name: 'home', params: {} });
let _getCtrlPath: () => string = () => '';
let _loadGameById: (gameId: string) => boolean = () => false;
let _navigate: (path: string) => void = () => {};
let _clearRetro: () => void = () => {};
let _redraw: () => void = () => {};
let _openStandalonePuzzle: (fen: string) => void = () => {};
let _restoreStandalonePuzzleBackground: () => void = () => {};
let _hasStandalonePuzzleBackground: () => boolean = () => false;

type PuzzleRouteState =
  | { status: 'idle' | 'library' }
  | { status: 'loading'; routeId: string }
  | { status: 'missing'; routeId: string; message: string }
  | { status: 'ready'; routeId: string };

let routeState: PuzzleRouteState = { status: 'idle' };
let puzzleSession: StoredPuzzleSession = emptyPuzzleSession();
let librarySource: PuzzleLibrarySource = 'saved';
let importedQuery = defaultImportedPuzzleQuery();

function saveSessionSnapshot(): void {
  const active = getActivePuzzleCtrl();
  if (!active) return;
  puzzleSession = applyPuzzleSnapshot(puzzleSession, active.snapshot());
  void savePuzzleSessionToIdb(puzzleSession);
}

function clearActivePuzzleRoute(): void {
  setActivePuzzleCtrl(undefined);
  syncArrow();
}

function savedPuzzleRounds(): SavedPuzzleRound[] {
  const games = _getImportedGames();
  return savedPuzzles.map(candidate =>
    buildPuzzleRound(candidate, {
      sourceGame: candidate.gameId ? (games.find(game => game.id === candidate.gameId) ?? null) : null,
    }),
  );
}

function setLibrarySource(source: PuzzleLibrarySource): void {
  if (librarySource === source) return;
  librarySource = source;
  if (source === 'lichess') requestImportedPuzzleLibrary(importedQuery);
  _redraw();
}

function updateImportedFilters(patch: Partial<typeof importedQuery.filters>): void {
  importedQuery = {
    ...importedQuery,
    page: 0,
    filters: {
      ...importedQuery.filters,
      ...patch,
    },
  };
  requestImportedPuzzleLibrary(importedQuery);
}

function stepImportedPage(delta: -1 | 1): void {
  const nextPage = Math.max(0, importedQuery.page + delta);
  if (nextPage === importedQuery.page) return;
  importedQuery = {
    ...importedQuery,
    page: nextPage,
  };
  requestImportedPuzzleLibrary(importedQuery);
}

function nextPuzzleHref(round: PuzzleRound): string {
  if (round.sourceKind === 'saved') {
    const rounds = savedPuzzleRounds();
    const idx = rounds.findIndex(candidate => candidate.key === round.key);
    const next = idx >= 0 ? rounds[idx + 1] : null;
    return next ? `#/puzzles/${next.routeId}` : '#/puzzles';
  }
  const importedState = importedPuzzleLibraryState();
  const idx = importedState.items.findIndex(item => item.key === round.key);
  const next = idx >= 0 ? importedState.items[idx + 1] : null;
  return next ? `#/puzzles/${next.routeId}` : '#/puzzles';
}

function openSourceGame(round: PuzzleRound): void {
  if (round.sourceKind !== 'saved' || !round.source.gameId) return;
  if (!_loadGameById(round.source.gameId)) return;
  _clearRetro();
  _navigate(round.parentPath);
  window.location.hash = `#/analysis/${round.source.gameId}`;
}

function restoreRoundBoard(round: PuzzleRound, progressPly: number): void {
  if (round.sourceKind === 'imported') {
    _openStandalonePuzzle(round.startFen);
    for (let i = 0; i < progressPly; i++) {
      const move = round.solution[i];
      if (!move) break;
      playUciMove(move);
    }
    return;
  }

  if (round.source.gameId) _loadGameById(round.source.gameId);
  _clearRetro();
  _navigate(round.parentPath);
  for (let i = 0; i < progressPly; i++) {
    const move = round.solution[i];
    if (!move) break;
    playUciMove(move);
  }
}

export function initPuzzles(deps: {
  getImportedGames: () => ImportedGame[];
  getRoute: () => Route;
  getCtrlPath: () => string;
  loadGameById: (gameId: string) => boolean;
  navigate: (path: string) => void;
  clearRetro: () => void;
  redraw: () => void;
  openStandalonePuzzle: (fen: string) => void;
  restoreStandalonePuzzleBackground: () => void;
  hasStandalonePuzzleBackground: () => boolean;
}): void {
  _getImportedGames = deps.getImportedGames;
  _getRoute = deps.getRoute;
  _getCtrlPath = deps.getCtrlPath;
  _loadGameById = deps.loadGameById;
  _navigate = deps.navigate;
  _clearRetro = deps.clearRetro;
  _redraw = deps.redraw;
  _openStandalonePuzzle = deps.openStandalonePuzzle;
  _restoreStandalonePuzzleBackground = deps.restoreStandalonePuzzleBackground;
  _hasStandalonePuzzleBackground = deps.hasStandalonePuzzleBackground;

  initImportedPuzzles({ redraw: deps.redraw });

  void loadPuzzleSessionFromIdb().then(session => {
    puzzleSession = session ?? emptyPuzzleSession();
    _redraw();
    void syncPuzzleRoute(_getRoute());
  });
}

export async function syncPuzzleRoute(route: Route): Promise<void> {
  if (route.name !== 'puzzle-round') {
    if (route.name === 'puzzles') {
      routeState = { status: 'library' };
    } else {
      routeState = { status: 'idle' };
      if (_hasStandalonePuzzleBackground()) {
        _restoreStandalonePuzzleBackground();
      }
    }
    if (getActivePuzzleCtrl()) {
      saveSessionSnapshot();
      clearActivePuzzleRoute();
    }
    _redraw();
    return;
  }

  const routeId = route.params['id'] ?? '';
  const active = getActivePuzzleCtrl();
  const activeSnapshot = active ? currentPuzzleSnapshot(puzzleSession, active.round().key) : null;
  if (
    active?.round().routeId === routeId &&
    routeState.status === 'ready' &&
    (!activeSnapshot || active.progressPly() === activeSnapshot.progressPly)
  ) return;

  routeState = { status: 'loading', routeId };
  clearActivePuzzleRoute();
  _redraw();

  const importedRoute = isImportedPuzzleRouteId(routeId);
  if (importedRoute) {
    librarySource = 'lichess';
  } else {
    librarySource = 'saved';
    if (_hasStandalonePuzzleBackground()) {
      _restoreStandalonePuzzleBackground();
    }
  }

  let round: PuzzleRound | null = null;

  if (importedRoute) {
    round = await findImportedPuzzleRoundByRouteId(routeId);
    if (!round) {
      routeState = { status: 'missing', routeId, message: 'This imported puzzle could not be loaded from the generated Lichess shards.' };
      _redraw();
      return;
    }
  } else {
    const candidate = findSavedPuzzleByRouteId(savedPuzzles, routeId);
    if (!candidate) {
      routeState = { status: 'missing', routeId, message: 'This saved puzzle was not found.' };
      _redraw();
      return;
    }
    if (!candidate.gameId) {
      routeState = { status: 'missing', routeId, message: 'This puzzle has no saved source game to load.' };
      _redraw();
      return;
    }

    const sourceGame = _getImportedGames().find(game => game.id === candidate.gameId) ?? null;
    if (!sourceGame) {
      routeState = { status: 'missing', routeId, message: 'The source game for this puzzle is no longer in the local library.' };
      _redraw();
      return;
    }

    const storedAnalysis = await loadAnalysisFromIdb(candidate.gameId);
    round = buildPuzzleRound(candidate, {
      sourceGame,
      ...(storedAnalysis !== undefined ? { storedAnalysis } : {}),
    });
  }

  const ctrl = makePuzzleCtrl(round, snapshot => {
    puzzleSession = applyPuzzleSnapshot(puzzleSession, snapshot);
    void savePuzzleSessionToIdb(puzzleSession);
    _redraw();
  });

  setActivePuzzleCtrl(ctrl);
  syncArrow();

  const snapshot = currentPuzzleSnapshot(puzzleSession, round.key);
  const progressPly = snapshot?.progressPly ?? 0;
  restoreRoundBoard(round, progressPly);
  if (snapshot) ctrl.restore(snapshot);
  ctrl.setCurrentPath(_getCtrlPath());

  routeState = { status: 'ready', routeId };
  _redraw();
}

export function renderPuzzlesRoute(route: Route): VNode {
  if (route.name === 'puzzles') {
    if (librarySource === 'lichess') requestImportedPuzzleLibrary(importedQuery);
    const rounds = savedPuzzleRounds();
    return renderPuzzleLibrary({
      source: librarySource,
      onSourceChange: setLibrarySource,
      savedRounds: rounds,
      importedState: importedPuzzleLibraryState(),
      session: puzzleSession,
      currentPuzzleKey: getActivePuzzleCtrl()?.round().key ?? null,
      recentResultForKey: key => recentPuzzleResult(puzzleSession, key),
      isResumeKey: key => currentPuzzleIsActive(puzzleSession, key),
      onImportedRatingMin: value => updateImportedFilters({ ratingMin: value }),
      onImportedRatingMax: value => updateImportedFilters({ ratingMax: value }),
      onImportedTheme: value => updateImportedFilters({ theme: value }),
      onImportedOpening: value => updateImportedFilters({ opening: value }),
      onImportedPrevPage: () => stepImportedPage(-1),
      onImportedNextPage: () => stepImportedPage(1),
    });
  }

  if (route.name !== 'puzzle-round') {
    return h('div');
  }

  if (routeState.status === 'loading') {
    return h('div.puzzle-library puzzle-library--empty', [
      h('h2', 'Puzzles'),
      h('p', 'Loading puzzle…'),
    ]);
  }

  if (routeState.status === 'missing') {
    return h('div.puzzle-library puzzle-library--empty', [
      h('h2', 'Puzzles'),
      h('p', routeState.message),
      h('a', { attrs: { href: '#/puzzles' } }, 'Back to puzzle library'),
    ]);
  }

  const ctrl = getActivePuzzleCtrl();
  if (!ctrl) {
    return h('div.puzzle-library puzzle-library--empty', [
      h('h2', 'Puzzles'),
      h('p', 'Loading puzzle…'),
    ]);
  }

  const [topStrip, bottomStrip] = renderPlayerStrips();
  return renderPuzzleRound({
    ctrl,
    onBack: () => { window.location.hash = '#/puzzles'; },
    onFlip: () => { flip(); _redraw(); },
    onRetry: () => {
      ctrl.retry();
      restoreRoundBoard(ctrl.round(), 0);
      ctrl.setCurrentPath(_getCtrlPath());
      syncArrow();
      _redraw();
    },
    onViewSolution: () => {
      ctrl.viewSolution();
      restoreRoundBoard(ctrl.round(), ctrl.round().solution.length);
      ctrl.setCurrentPath(_getCtrlPath());
      syncArrow();
      _redraw();
    },
    onNext: () => { window.location.hash = nextPuzzleHref(ctrl.round()); },
    onOpenSourceGame: () => openSourceGame(ctrl.round()),
    board: renderBoard(),
    promotionDialog: renderPromotionDialog(),
    topStrip,
    bottomStrip,
  });
}

export function puzzleHrefForCandidate(gameId: string | null, path: string): string {
  return puzzleRouteHref({ gameId, path });
}

export function importedPuzzleRootFromFen(fen: string) {
  return buildStandalonePuzzleRoot(fen);
}
