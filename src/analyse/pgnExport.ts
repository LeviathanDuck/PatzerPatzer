// PGN export and analysis review controls.
// Adapted from lichess-org/lila: ui/analyse/src/pgnExport.ts,
// ui/analyse/src/view/controls.ts (review button logic)

import { h, type VNode } from 'snabbdom';
import type { AnalyseCtrl } from '../analyse/ctrl';
import {
  evalCache,
  incrementPendingStopCount, stopProtocol, setEngineSearchActive,
  clearEvalCache, resetCurrentEval, syncArrow,
} from '../engine/ctrl';
import {
  batchQueue, batchDone, batchAnalyzing, setBatchAnalyzing,
  analysisComplete, setBatchState, setAnalysisRunning,
  reviewDepth, resetBatchState, startBatchWhenReady,
} from '../engine/batch';
import { buildAnalysisNodes, saveAnalysisToIdb } from '../idb/index';
import { clearPuzzleCandidates } from '../puzzles/extract';
import type { ImportedGame } from '../import/types';

// --- Injected deps ---

let _getCtrl:           () => AnalyseCtrl                        = () => { throw new Error('pgnExport not initialised'); };
let _getImportedGames:  () => ImportedGame[]                     = () => [];
let _getSelectedGameId: () => string | null                      = () => null;
let _clearGameAnalysis: (gameId: string) => void                 = () => {};
let _redraw:            () => void                               = () => {};

export function initPgnExport(deps: {
  getCtrl:            () => AnalyseCtrl;
  getImportedGames:   () => ImportedGame[];
  getSelectedGameId:  () => string | null;
  clearGameAnalysis:  (gameId: string) => void;
  redraw:             () => void;
}): void {
  _getCtrl           = deps.getCtrl;
  _getImportedGames  = deps.getImportedGames;
  _getSelectedGameId = deps.getSelectedGameId;
  _clearGameAnalysis = deps.clearGameAnalysis;
  _redraw            = deps.redraw;
}

// --- PGN building ---

/**
 * Build a PGN string from the current move tree.
 * annotated=true adds { [%eval X.XX] [%clk h:mm:ss] } comments after each
 * move — exact same format Lichess uses in exported PGNs.
 * Adapted from lichess-org/lila: modules/analyse/src/main/Annotator.scala
 * and modules/tree/src/main/Info.scala pgnComment
 */
export function buildPgn(annotated: boolean): string {
  const ctrl           = _getCtrl();
  const importedGames  = _getImportedGames();
  const selectedGameId = _getSelectedGameId();
  const game           = importedGames.find(g => g.id === selectedGameId);

  const headers: [string, string][] = [
    ['Event',  '?'],
    ['Site',   'PatzerPro'],
    ['Date',   game?.date ?? '????.??.??'],
    ['White',  game?.white ?? '?'],
    ['Black',  game?.black ?? '?'],
    ['Result', game?.result ?? '*'],
  ];
  if (annotated) headers.push(['Annotator', 'PatzerPro']);
  const headerStr = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');

  const nodes = ctrl.mainline.slice(1); // skip root (no move)
  const parts: string[] = [];
  let needsMoveNum = true;
  let pgnPath = ''; // accumulated path for evalCache lookups

  for (const node of nodes) {
    pgnPath += node.id;
    const isWhite = node.ply % 2 === 1;
    const moveNum = Math.ceil(node.ply / 2);

    if (isWhite || needsMoveNum) {
      parts.push(isWhite ? `${moveNum}.` : `${moveNum}...`);
    }

    parts.push(node.san ?? '?');

    if (annotated) {
      const commentParts: string[] = [];
      const ev = evalCache.get(pgnPath);
      if (ev) {
        if (ev.mate !== undefined) {
          commentParts.push(`[%eval #${ev.mate}]`);
        } else if (ev.cp !== undefined) {
          const pawns = (ev.cp / 100).toFixed(2);
          commentParts.push(`[%eval ${pawns}]`);
        }
      }
      if (node.clock !== undefined) {
        const total = Math.round(node.clock / 100);
        const hrs = Math.floor(total / 3600);
        const m   = Math.floor((total % 3600) / 60);
        const s   = total % 60;
        commentParts.push(`[%clk ${hrs}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`);
      }
      if (commentParts.length > 0) {
        parts.push(`{ ${commentParts.join(' ')} }`);
        needsMoveNum = isWhite; // black move after white comment needs "N..."
      } else {
        needsMoveNum = false;
      }
    } else {
      needsMoveNum = false;
    }
  }

  parts.push(game?.result ?? '*');
  return `${headerStr}\n\n${parts.join(' ')}\n`;
}

export function downloadPgn(annotated: boolean): void {
  const pgn            = buildPgn(annotated);
  const importedGames  = _getImportedGames();
  const selectedGameId = _getSelectedGameId();
  const game           = importedGames.find(g => g.id === selectedGameId);
  const w              = (game?.white ?? 'White').replace(/\s+/g, '_');
  const b              = (game?.black ?? 'Black').replace(/\s+/g, '_');
  const suffix         = annotated ? '_annotated' : '';
  const filename       = `${w}_vs_${b}${suffix}.pgn`;

  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  _redraw();
}

export function renderAnalysisControls(extraButtons?: VNode[]): VNode {
  const ctrl           = _getCtrl();
  const selectedGameId = _getSelectedGameId();
  const hasGame        = ctrl.mainline.length > 1;

  // Review button label and behavior change based on state.
  // Mirrors the single-action pattern in Lichess analysis controls.
  let reviewLabel: string;
  let reviewTitle: string;
  if (batchAnalyzing) {
    const pct = batchQueue.length > 0
      ? Math.round((batchDone / batchQueue.length) * 100)
      : 0;
    reviewLabel = `${pct}%`;
    reviewTitle = 'Analysis in progress — click to stop';
  } else if (analysisComplete) {
    reviewLabel = 'Re-analyze';
    reviewTitle = 'Clear previous analysis and run again';
  } else {
    reviewLabel = 'Review';
    reviewTitle = 'Analyze this game to detect mistakes and blunders';
  }

  const reviewClick = () => {
    if (batchAnalyzing) {
      // Stop in-progress review cleanly — preserve partial evalCache.
      incrementPendingStopCount();
      stopProtocol();
      setEngineSearchActive(false);
      setBatchAnalyzing(false);
      setBatchState('idle');
      setAnalysisRunning(false);
      if (selectedGameId) void saveAnalysisToIdb('partial', selectedGameId, buildAnalysisNodes(_getCtrl().mainline, p => evalCache.get(p)), reviewDepth);
      _redraw();
      return;
    }
    if (analysisComplete) {
      // Re-analyze: clear old data and start fresh.
      if (selectedGameId) _clearGameAnalysis(selectedGameId);
      clearEvalCache();
      resetCurrentEval();
      clearPuzzleCandidates();
      resetBatchState();
      syncArrow();
    }
    startBatchWhenReady();
  };

  // Status line: shown only while analysis is running so the user understands
  // what the percentage in the button refers to and how many moves remain.
  // Mirrors the inline completion indicator in Lichess retro mode controls.
  const statusLine = batchAnalyzing && batchQueue.length > 0
    ? h('div.pgn-import__status', `Analyzing… ${batchDone} of ${batchQueue.length} moves`)
    : null;

  return h('div.pgn-import', [
    h('div.pgn-import__row', [
      h('button.btn-review', {
        class: { 'btn-review--complete': analysisComplete },
        attrs: { disabled: !hasGame, title: reviewTitle },
        on: { click: reviewClick },
      }, reviewLabel),
      ...(extraButtons ?? []),
    ]),
    statusLine,
  ]);
}
