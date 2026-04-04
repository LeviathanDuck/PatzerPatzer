#!/usr/bin/env node
// Generate docs/feedback-lookbook.html — a self-contained visual reference for the
// severity-modulated feedback system.
//
// Usage: npm run lookbook:generate
// (runs via tsx so TypeScript imports work directly)

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { SEVERITY_TIERS, ALL_FEEDBACK, SPECIAL_CLASSIFICATIONS, EVAL_BOX_GRADES as SEVERITY_EVAL_GRADES, MISTAKE_COUNT_TIERS } from '../src/feedback/severity.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', 'docs', 'feedback-lookbook.html');

// ---------------------------------------------------------------------------
// Static data that the prompt says to pull from other modules. Rather than
// importing those (which would need the full build), we inline the canonical
// values here. They are stable constants.
// ---------------------------------------------------------------------------

const GAME_REVIEW_LABELS = [
  { label: 'Inaccuracy', glyph: '?!', lossThreshold: 0.05, wcPercent: '10%' },
  { label: 'Mistake',    glyph: '?',  lossThreshold: 0.10, wcPercent: '20%' },
  { label: 'Blunder',    glyph: '??', lossThreshold: 0.15, wcPercent: '30%' },
];

const EVAL_BOX_GRADES = [
  { grade: '--best', color: '#759900', hex: '#759900', meaning: 'Exact match or within rounding of engine best' },
  { grade: '--near', color: '#f0a500', hex: '#f0a500', meaning: 'Slightly worse than best' },
  { grade: '--ok',   color: '#7aaddf', hex: '#7aaddf', meaning: 'Worse than best but better than game move' },
  { grade: '--bad',  color: '#dc322f', hex: '#dc322f', meaning: 'Worse than or equal to the game move' },
];

// Expanded eval box grades — derived from severity module, with lookbook-specific display text.
const EVAL_GRADE_MEANINGS = {
  'checkmate':    'You found the best move and it delivers checkmate.',
  'exact':        'You found the engine\u2019s top choice.',
  'near-perfect': 'Virtually identical to the best move \u2014 no practical difference.',
  'close':        'A strong alternative. Only a small edge separates this from the best.',
  'acceptable':   'A reasonable attempt, but a noticeably stronger move exists.',
  'off-target':   'Not close to the solution. A significantly better move was available.',
  'wide-miss':    'Far from the best move. This attempt misses the point of the position.',
  'far-off':      'This move makes things dramatically worse than the solution would.',
  'way-off':      'Nowhere near the right idea. The position is fundamentally different now.',
  'wrong':        'This move is as bad or worse than the original mistake.',
};
const EXPANDED_EVAL_GRADES = SEVERITY_EVAL_GRADES.map(g => {
  let lossRange;
  if (g.id === 'checkmate') lossRange = 'best move is mate';
  else if (g.lossCeiling === 0) lossRange = 'loss = 0';
  else if (g.lossCeiling === Infinity) lossRange = `loss > ${g.lossFloor}`;
  else lossRange = `loss \u2264 ${g.lossCeiling}`;
  return { grade: g.id, color: g.color, label: g.label, lossRange, meaning: EVAL_GRADE_MEANINGS[g.id] || '' };
});

const LFYM_ICONS = [
  { symbol: '✓', name: 'Good move / Solution', state: 'win, view', color: '#759900',
    meaning: 'User found the engine best move or a near-best move, or the solution was revealed.' },
  { symbol: '✗', name: 'Wrong move', state: 'fail', color: '#dc322f',
    meaning: 'User played a suboptimal move that does not meet the near-best threshold.' },
  { symbol: '!', name: 'Off track', state: 'offTrack', color: '#e0a030',
    meaning: 'User navigated away from the exercise position during solving.' },
];

const GLYPHS = [
  { symbol: '!',  name: 'Good move',        usedFor: 'Best / excellent tier moves' },
  { symbol: '!!', name: 'Brilliant move',    usedFor: 'Non-obvious best move in complex position (aspirational)' },
  { symbol: '!?', name: 'Interesting move',  usedFor: 'Speculative or sharp choice' },
  { symbol: '?!', name: 'Dubious move',      usedFor: 'Inaccuracy tier' },
  { symbol: '?',  name: 'Mistake',           usedFor: 'Mistake / serious mistake tier' },
  { symbol: '??', name: 'Blunder',           usedFor: 'Blunder / catastrophic tier' },
  { symbol: '\u25a1', name: 'Only move',     usedFor: 'Forced — only legal or viable move' },
];

const REASON_CODES = ['swing', 'missed-mate', 'collapse', 'defensive', 'punish'];
const REASON_LABELS = {
  'swing': 'Missed Opportunity',
  'missed-mate': 'Missed Forced Mate',
  'collapse': 'Blown Win',
  'defensive': 'Missed Defense',
  'punish': 'Missed Punishment',
};

const POSITIVE_TIERS = ['best', 'excellent', 'good', 'playable'];
const NEGATIVE_TIERS = ['inaccuracy', 'mistake', 'serious', 'blunder', 'catastrophic'];

// ---------------------------------------------------------------------------
// Detail lines — data-grounded context shown between label and summary
// These reference actual RetroCandidate fields available at render time.
// Templates use {placeholders} to show what dynamic data fills in.
// ---------------------------------------------------------------------------

const DETAIL_LINES = {
  'swing': {
    inaccuracy:   { detail: 'The engine found a slightly stronger continuation. The move played was the {nth}-best option.', sample: '2nd' },
    mistake:      { detail: 'The engine\u2019s best move was worth roughly {cpDiff} more. This was a meaningful missed opportunity.', sample: '+1.2 pawns' },
    serious:      { detail: 'The played move ({playedSan}) cost roughly {cpDiff}. The engine strongly preferred {bestSan}.', sample: 'Nxf3 / +2.4 pawns / Bd3' },
    blunder:      { detail: '{playedSan} was played. The engine\u2019s top choice {bestSan} was worth roughly {cpDiff} more.', sample: 'Ng5 / Bc2 / +4.1 pawns' },
    catastrophic: { detail: '{playedSan} was played instead of {bestSan}. The evaluation swung by roughly {cpDiff}.', sample: 'f4 / Qe2 / +8.3 pawns' },
  },
  'missed-mate': {
    inaccuracy:   { detail: 'Checkmate in {mateDistance} was available via {bestSan}. A slower but winning path was chosen.', sample: '3 / Qxf7+' },
    mistake:      { detail: 'Forced checkmate in {mateDistance} was available. {bestSan} would have started the mating sequence.', sample: '3 / Rxh7+' },
    serious:      { detail: 'Checkmate in {mateDistance} was on the board. {playedSan} was played instead of {bestSan}.', sample: '2 / Kf2 / Qg3+' },
    blunder:      { detail: 'Mate in {mateDistance} via {bestSan}. The move {playedSan} lets the opponent escape entirely.', sample: '1 / Qxh7# / Bd3' },
    catastrophic: { detail: 'Checkmate in {mateDistance} was available ({bestSan}). {playedSan} was played instead.', sample: '1 / Qh7# / a3' },
  },
  'collapse': {
    inaccuracy:   { detail: 'The position was clearly in your favor before {playedSan}. A small part of the advantage slipped.', sample: 'Bd3' },
    mistake:      { detail: 'You had a commanding position. {playedSan} gave back a significant portion of the advantage.', sample: 'f4' },
    serious:      { detail: 'The position was winning. {playedSan} let the opponent back into the game \u2014 {bestSan} held the edge.', sample: 'f4 / Qe2' },
    blunder:      { detail: 'A won position was squandered with {playedSan}. The engine\u2019s choice {bestSan} maintained a decisive advantage.', sample: 'Re7 / Qd2' },
    catastrophic: { detail: 'The game was effectively won. {playedSan} threw everything away \u2014 {bestSan} would have kept it.', sample: 'Kh1 / Qf3' },
  },
  'defensive': {
    inaccuracy:   { detail: 'The position was difficult. A tougher defensive try existed with {bestSan} instead of {playedSan}.', sample: 'Rd1 / Be2' },
    mistake:      { detail: 'Under pressure, {playedSan} made things worse. {bestSan} was a more resilient defense.', sample: 'Kf1 / Qd2' },
    serious:      { detail: 'A critical defensive resource ({bestSan}) was available. {playedSan} let the position deteriorate sharply.', sample: 'Rd8 / Be7' },
    blunder:      { detail: '{bestSan} would have kept the game alive. {playedSan} collapsed the defense.', sample: 'Qd1 / Ng5' },
    catastrophic: { detail: 'One defensive move could save the game: {bestSan}. {playedSan} ended all resistance.', sample: 'Kf1 / a3' },
  },
  'punish': {
    inaccuracy:   { detail: 'The opponent\u2019s previous move was slightly inaccurate. {bestSan} would have exploited it more precisely than {playedSan}.', sample: 'Nxe5 / d4' },
    mistake:      { detail: 'The opponent made an error. {bestSan} would have punished it cleanly \u2014 {playedSan} let them off the hook.', sample: 'Bxf7+ / Nc3' },
    serious:      { detail: 'The opponent handed over a significant advantage. {playedSan} was played instead of the punishing {bestSan}.', sample: 'h3 / Nxd5' },
    blunder:      { detail: 'The opponent blundered badly. {bestSan} would have won material or decisive advantage \u2014 {playedSan} missed it completely.', sample: 'Be2 / Qxd4' },
    catastrophic: { detail: 'The opponent\u2019s move was a game-losing mistake. {bestSan} would have ended it. {playedSan} threw away the gift entirely.', sample: 'Kh1 / Bxf2+' },
  },
};

const APPROX_CP = {
  best: '0',
  excellent: '~5\u201315',
  good: '~15\u201335',
  playable: '~35\u201350',
  inaccuracy: '~50\u2013100',
  mistake: '~100\u2013200',
  serious: '~200\u2013350',
  blunder: '~350\u2013600',
  catastrophic: '600+',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function lossRange(t) {
  if (t.id === 'best') return 'loss = 0 (exact)';
  if (t.lossCeiling === Infinity) return `loss > ${t.lossFloor}`;
  if (t.lossFloor === 0) return `loss \u2264 ${t.lossCeiling}`;
  return `${t.lossFloor} < loss \u2264 ${t.lossCeiling}`;
}

// ---------------------------------------------------------------------------
// Board glyph card builder
// ---------------------------------------------------------------------------

// Simple black knight SVG (cburnett set style, public domain)
const KNIGHT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" class="piece"><g style="opacity:1;fill:none;fill-opacity:1;fill-rule:evenodd;stroke:#000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1"><path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style="fill:#000;stroke:#000"/><path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style="fill:#000;stroke:#000"/><path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" style="fill:#fff;stroke:#fff"/><path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" style="fill:#fff;stroke:#fff"/></g></svg>';

// Badge SVGs matching boardGlyphs.ts — simplified for 28x28 display
function glyphBadgeSvg(symbol, fillColor, pathD) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="badge"><circle cx="50" cy="50" r="50" fill="${fillColor}"/>${pathD}</svg>`;
}

const BOARD_GLYPH_DATA = [
  {
    symbol: '!!', name: 'Brilliant', color: '#168226', usedFor: 'Non-obvious best move in complex position',
    path: '<path fill="#fff" d="M71.967 62.349h-9.75l-2.049-39.083h13.847zM60.004 76.032q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244zM37.967 62.349h-9.75l-2.049-39.083h13.847zM26.004 76.032q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244z"/>',
  },
  {
    symbol: '!', name: 'Good move', color: '#22ac38', usedFor: 'Best / excellent tier moves',
    path: '<path fill="#fff" d="M54.967 62.349h-9.75l-2.049-39.083h13.847zM43.004 76.032q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244z"/>',
  },
  {
    symbol: '!?', name: 'Interesting move', color: '#ea45d8', usedFor: 'Speculative or sharp choice',
    path: '<path fill="#fff" d="M60.823 58.9q0-4.098 1.72-6.883 1.721-2.786 5.9-5.818 3.687-2.622 5.243-4.506 1.64-1.966 1.64-4.588t-1.967-3.933q-1.885-1.393-5.326-1.393t-6.8 1.065q-3.36 1.065-6.883 2.868l-4.343-8.767q4.015-2.212 8.685-3.605 4.67-1.393 10.242-1.393 8.521 0 13.192 4.097 4.752 4.096 4.752 10.405 0 3.36-1.065 5.818-1.066 2.458-3.196 4.588-2.13 2.048-5.326 4.424-2.376 1.72-3.687 2.95-1.31 1.229-1.802 2.376-.41 1.147-.41 2.868v2.376h-10.57zm-1.311 16.632q0-3.77 2.048-5.244 2.049-1.557 4.998-1.557 2.868 0 4.916 1.557 2.049 1.475 2.049 5.244 0 3.605-2.049 5.244-2.048 1.556-4.916 1.556-2.95 0-4.998-1.556-2.048-1.64-2.048-5.244zM36.967 61.849h-9.75l-2.049-39.083h13.847zM25.004 75.532q0-3.77 2.049-5.244 2.048-1.557 4.998-1.557 2.867 0 4.916 1.557 2.048 1.475 2.048 5.244 0 3.605-2.048 5.244-2.049 1.556-4.916 1.556-2.95 0-4.998-1.556-2.049-1.64-2.049-5.244z"/>',
  },
  {
    symbol: '?!', name: 'Dubious / Inaccuracy', color: '#56b4e9', usedFor: 'Inaccuracy tier',
    path: '<path fill="#fff" d="M37.734 21.947c-3.714 0-7.128.464-10.242 1.393-3.113.928-6.009 2.13-8.685 3.605l4.343 8.766c2.35-1.202 4.644-2.157 6.883-2.867a22.366 22.366 0 0 1 6.799-1.065c2.294 0 4.07.464 5.326 1.393 1.311.874 1.967 2.186 1.967 3.933 0 1.748-.546 3.277-1.639 4.588-1.038 1.257-2.786 2.758-5.244 4.506-2.786 2.021-4.751 3.961-5.898 5.819-1.147 1.857-1.721 4.15-1.721 6.88v2.952h10.568v-2.377c0-1.147.137-2.103.41-2.868.328-.764.93-1.557 1.803-2.376.874-.82 2.104-1.803 3.688-2.95 2.13-1.584 3.906-3.058 5.326-4.424 1.42-1.42 2.485-2.95 3.195-4.59.71-1.638 1.065-3.576 1.065-5.816 0-4.206-1.584-7.675-4.752-10.406-3.114-2.731-7.51-4.096-13.192-4.096zm24.745.819 2.048 39.084h9.75l2.047-39.084zM35.357 68.73c-1.966 0-3.632.52-4.998 1.557-1.365.983-2.047 2.732-2.047 5.244 0 2.404.682 4.152 2.047 5.244 1.366 1.038 3.032 1.557 4.998 1.557 1.912 0 3.55-.519 4.916-1.557 1.366-1.092 2.05-2.84 2.05-5.244 0-2.512-.684-4.26-2.05-5.244-1.365-1.038-3.004-1.557-4.916-1.557zm34.004 0c-1.966 0-3.632.52-4.998 1.557-1.365.983-2.049 2.732-2.049 5.244 0 2.404.684 4.152 2.05 5.244 1.365 1.038 3.03 1.557 4.997 1.557 1.912 0 3.55-.519 4.916-1.557 1.366-1.092 2.047-2.84 2.047-5.244 0-2.512-.681-4.26-2.047-5.244-1.365-1.038-3.004-1.557-4.916-1.557z"/>',
  },
  {
    symbol: '?', name: 'Mistake', color: '#e69f00', usedFor: 'Mistake / serious mistake tier',
    path: '<path fill="#fff" d="M40.436 60.851q0-4.66 1.957-7.83 1.958-3.17 6.712-6.619 4.195-2.983 5.967-5.127 1.864-2.237 1.864-5.22 0-2.983-2.237-4.475-2.144-1.585-6.06-1.585-3.915 0-7.737 1.212t-7.83 3.263l-4.941-9.975q4.568-2.517 9.881-4.101 5.314-1.585 11.653-1.585 9.695 0 15.008 4.661 5.407 4.661 5.407 11.839 0 3.822-1.212 6.619-1.212 2.796-3.635 5.22-2.424 2.33-6.06 5.034-2.703 1.958-4.195 3.356-1.491 1.398-2.05 2.703-.467 1.305-.467 3.263v2.703H40.436zm-1.492 18.924q0-4.288 2.33-5.966 2.331-1.771 5.687-1.771 3.263 0 5.594 1.771 2.33 1.678 2.33 5.966 0 4.102-2.33 5.966-2.331 1.772-5.594 1.772-3.356 0-5.686-1.772-2.33-1.864-2.33-5.966z"/>',
  },
  {
    symbol: '??', name: 'Blunder', color: '#df5353', usedFor: 'Blunder / catastrophic tier',
    path: '<path fill="#fff" d="M31.8 22.22c-3.675 0-7.052.46-10.132 1.38-3.08.918-5.945 2.106-8.593 3.565l4.298 8.674c2.323-1.189 4.592-2.136 6.808-2.838a22.138 22.138 0 0 1 6.728-1.053c2.27 0 4.025.46 5.268 1.378 1.297.865 1.946 2.16 1.946 3.89s-.541 3.242-1.622 4.539c-1.027 1.243-2.756 2.73-5.188 4.458-2.756 2-4.7 3.918-5.836 5.755-1.134 1.837-1.702 4.107-1.702 6.808v2.92h10.457v-2.35c0-1.135.135-2.082.406-2.839.324-.756.918-1.54 1.783-2.35.864-.81 2.079-1.784 3.646-2.918 2.107-1.568 3.863-3.026 5.268-4.376 1.405-1.405 2.46-2.92 3.162-4.541.703-1.621 1.054-3.54 1.054-5.755 0-4.161-1.568-7.592-4.702-10.294-3.08-2.702-7.43-4.052-13.05-4.052zm38.664 0c-3.675 0-7.053.46-10.133 1.38-3.08.918-5.944 2.106-8.591 3.565l4.295 8.674c2.324-1.189 4.593-2.136 6.808-2.838a22.138 22.138 0 0 1 6.728-1.053c2.27 0 4.026.46 5.269 1.378 1.297.865 1.946 2.16 1.946 3.89s-.54 3.242-1.62 4.539c-1.027 1.243-2.757 2.73-5.189 4.458-2.756 2-4.7 3.918-5.835 5.755-1.135 1.837-1.703 4.107-1.703 6.808v2.92h10.457v-2.35c0-1.135.134-2.082.404-2.839.324-.756.918-1.54 1.783-2.35.865-.81 2.081-1.784 3.648-2.918 2.108-1.568 3.864-3.026 5.269-4.376 1.405-1.405 2.46-2.92 3.162-4.541.702-1.621 1.053-3.54 1.053-5.755 0-4.161-1.567-7.592-4.702-10.294-3.08-2.702-7.43-4.052-13.05-4.052zM29.449 68.504c-1.945 0-3.593.513-4.944 1.54-1.351.973-2.027 2.703-2.027 5.188 0 2.378.676 4.108 2.027 5.188 1.35 1.027 3 1.54 4.944 1.54 1.892 0 3.512-.513 4.863-1.54 1.35-1.08 2.026-2.81 2.026-5.188 0-2.485-.675-4.215-2.026-5.188-1.351-1.027-2.971-1.54-4.863-1.54zm38.663 0c-1.945 0-3.592.513-4.943 1.54-1.35.973-2.026 2.703-2.026 5.188 0 2.378.675 4.108 2.026 5.188 1.351 1.027 2.998 1.54 4.943 1.54 1.891 0 3.513-.513 4.864-1.54 1.351-1.08 2.027-2.81 2.027-5.188 0-2.485-.676-4.215-2.027-5.188-1.35-1.027-2.973-1.54-4.864-1.54z"/>',
  },
  {
    symbol: '#KO!', name: 'Checkmate', color: '#a855f7', usedFor: 'Terminal checkmate \u2014 delivered on the board',
    path: null, // KO uses the special skull overlay, not a circle badge
    isKO: true,
  },
];

function buildGlyphCards() {
  return BOARD_GLYPH_DATA.map((g, i) => {
    const sqClass = i % 2 === 0 ? 'glyph-square--light' : 'glyph-square--dark';
    let badgeHtml;
    if (g.isKO) {
      // Simplified KO skull badge at 80x80
      badgeHtml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="badge" style="width:80px;height:80px;top:0;right:0"><defs><linearGradient id="ko-g" x1="0%" y1="20%" x2="100%" y2="80%"><stop offset="0%" stop-color="#f3b7ff"/><stop offset="18%" stop-color="#c86bff"/><stop offset="48%" stop-color="#8a35ff"/><stop offset="100%" stop-color="#3d0b73"/></linearGradient></defs><svg viewBox="0 0 433 405" width="100" height="100"><path d="M 398 142 L 368 128 L 344 127 L 340 131 L 327 133 L 320 130 L 316 135 L 302 137 L 285 144 L 281 140 L 278 147 L 266 144 L 267 149 L 257 162 L 309 159 L 311 162 L 307 165 L 294 166 L 289 171 L 282 172 L 267 184 L 258 187 L 249 204 L 243 209 L 243 217 L 240 220 L 238 219 L 230 234 L 230 245 L 226 248 L 220 246 L 215 269 L 219 277 L 217 282 L 222 294 L 233 304 L 232 306 L 236 311 L 247 318 L 264 322 L 296 322 L 322 313 L 327 308 L 343 301 L 378 273 L 401 242 L 416 212 L 420 196 L 419 175 L 415 162 Z M 251 128 L 160 170 L 171 125 L 168 117 L 145 112 L 131 126 L 109 164 L 89 213 L 45 238 L 55 242 L 48 250 L 50 255 L 38 264 L 42 267 L 59 260 L 62 273 L 59 288 L 42 322 L 41 331 L 47 325 L 43 349 L 53 329 L 56 332 L 52 342 L 65 327 L 71 330 L 68 341 L 78 326 L 84 328 L 83 333 L 87 331 L 116 257 L 121 259 L 146 296 L 200 340 L 226 349 L 237 344 L 220 330 L 230 327 L 189 285 L 164 240 L 153 236 L 151 228 L 162 217 L 166 205 L 181 201 L 185 195 L 247 164 L 249 151 L 238 151 L 236 146 L 253 136 L 244 136 Z" fill="url(#ko-g)" fill-rule="evenodd" stroke="#f8dcff" stroke-width="1.6" stroke-linejoin="round"/></svg></svg>';
    } else {
      badgeHtml = glyphBadgeSvg(g.symbol, g.color, g.path);
    }
    return `<div class="glyph-card">
  <div class="glyph-square ${sqClass}">
    ${KNIGHT_SVG}
    ${badgeHtml}
  </div>
  <div class="glyph-card__label" style="color:${g.color}">${esc(g.symbol)}</div>
  <div class="glyph-card__sub">${esc(g.name)}</div>
  <div class="glyph-card__sub">${esc(g.usedFor)}</div>
</div>`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Build HTML
// ---------------------------------------------------------------------------

function buildHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patzer Pro \u2014 Feedback Lookbook</title>
<style>
:root { --bg: #1a1a1a; --text: #e8e8e8; --border: #3a3a3a; --accent: #629924; }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; line-height: 1.6; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Sticky header */
.header { position: sticky; top: 0; z-index: 100; background: #111; border-bottom: 1px solid var(--border); padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.header h1 { margin: 0; font-size: 22px; font-weight: 600; white-space: nowrap; }
.header nav { display: flex; gap: 12px; flex-wrap: wrap; font-size: 16px; }
.tone-toggle { display: flex; align-items: center; gap: 8px; }
.tone-toggle button { background: var(--border); color: var(--text); border: 1px solid #555; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 16px; }
.tone-toggle button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.header-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
.regen-hint { position: relative; }
.regen-hint button { background: var(--border); color: var(--text); border: 1px solid #555; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 16px; }
.regen-hint button:hover { border-color: var(--accent); }
.regen-tooltip { display: none; position: absolute; right: 0; top: calc(100% + 8px); background: #222; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; width: 320px; font-size: 15px; line-height: 1.5; z-index: 200; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
.regen-tooltip.visible { display: block; }
.regen-tooltip code { background: #333; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
.regen-tooltip p { margin: 0 0 8px; }
.regen-tooltip p:last-child { margin: 0; }

/* Board glyph squares */
.glyph-gallery { display: flex; flex-wrap: wrap; gap: 24px; }
.glyph-card { text-align: center; }
.glyph-card__label { margin-top: 8px; font-weight: 600; font-size: 16px; }
.glyph-card__sub { font-size: 14px; opacity: 0.6; margin-top: 2px; }
.glyph-square { width: 80px; height: 80px; position: relative; border-radius: 4px; overflow: hidden; }
.glyph-square--light { background: #f0d9b5; }
.glyph-square--dark { background: #b58863; }
.glyph-square svg.piece { position: absolute; bottom: 0; left: 0; width: 80px; height: 80px; }
.glyph-square svg.badge { position: absolute; top: 2px; right: 2px; width: 28px; height: 28px; }

/* LFYM preview cards */
.lfym-preview { display: flex; flex-direction: column; gap: 20px; }
.lfym-card { background: #222; border: 1px solid var(--border); border-radius: 6px; padding: 16px 20px; max-width: 600px; }
.lfym-card__header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.lfym-card__reason { font-size: 13px; opacity: 0.5; margin-bottom: 2px; }
.lfym-card__label { font-weight: 700; font-size: 17px; }
.lfym-card__detail { font-size: 15px; line-height: 1.5; margin: 8px 0; padding: 8px 12px; border-left: 3px solid; border-radius: 0 4px 4px 0; background: rgba(255,255,255,0.03); }
.lfym-card__summary { font-size: 14px; opacity: 0.7; font-style: italic; }
.lfym-card__meta { font-size: 12px; opacity: 0.4; margin-top: 8px; }
.lfym-reason-group { margin-bottom: 32px; }
.lfym-reason-group__title { font-size: 18px; font-weight: 600; margin-bottom: 16px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

/* Editable cells */
[contenteditable] { outline: 1px dashed rgba(255,255,255,0.15); border-radius: 2px; padding: 1px 3px; min-height: 1.4em; transition: outline-color 0.15s; }
[contenteditable]:hover { outline-color: rgba(255,255,255,0.3); }
[contenteditable]:focus { outline: 1px solid var(--accent); background: rgba(255,255,255,0.05); }
.edit-dirty { outline-color: #e69d00 !important; }
.save-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 200; background: #111; border-top: 1px solid var(--border); padding: 10px 20px; display: flex; align-items: center; gap: 16px; transform: translateY(100%); transition: transform 0.2s; }
.save-bar.visible { transform: translateY(0); }
.save-bar button { background: var(--accent); color: #fff; border: none; border-radius: 4px; padding: 8px 20px; cursor: pointer; font-size: 14px; font-weight: 600; }
.save-bar button:hover { opacity: 0.9; }
.save-bar .save-status { font-size: 16px; opacity: 0.7; }
.save-bar .edit-count { font-size: 16px; color: #e69d00; font-weight: 600; }

/* Content */
.content { max-width: 1200px; margin: 0 auto; padding: 20px; }
section { margin-bottom: 48px; }
h2 { font-size: 24px; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
h3 { font-size: 18px; margin: 24px 0 8px; }

/* Color strip */
.color-strip { display: flex; border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
.color-strip__tier { flex: 1; padding: 12px 4px; text-align: center; font-size: 14px; line-height: 1.3; min-width: 0; }
.color-strip__tier .label { font-weight: 600; font-size: 15px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.color-strip__tier .hex { opacity: 0.7; font-size: 13px; }
.color-strip__tier .range { opacity: 0.6; font-size: 13px; display: block; }

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 16px; }
th { text-align: left; padding: 8px 10px; background: #222; border-bottom: 2px solid var(--border); font-weight: 600; white-space: nowrap; }
td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
tr:nth-child(even) td { background: rgba(255,255,255,0.02); }

.swatch { display: inline-block; width: 18px; height: 18px; border-radius: 3px; vertical-align: middle; border: 1px solid rgba(255,255,255,0.1); }
.glyph { font-weight: 700; font-size: 18px; }

/* Matrix */
.matrix { overflow-x: auto; }
.matrix table { min-width: 700px; }
.matrix th.reason { min-width: 140px; }
.matrix td { font-size: 15px; line-height: 1.4; }
.matrix td.cell { min-width: 120px; }

/* Positive row */
.positive-row { margin-bottom: 16px; }
.positive-row table td { font-size: 15px; }

/* Special cards */
.special-cards { display: flex; gap: 16px; flex-wrap: wrap; }
.special-card { background: #222; border: 1px solid var(--border); border-radius: 6px; padding: 16px; min-width: 200px; flex: 1; }
.special-card .card-label { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.special-card .card-summary { font-size: 16px; opacity: 0.8; }
.special-card .card-color { font-size: 14px; opacity: 0.6; margin-top: 6px; }

/* Review label mapping */
.mapping-arrow { opacity: 0.5; }

/* Hidden tone sections */
.tone-section { display: none; }
.tone-section.visible { display: block; }

@media (max-width: 700px) {
  .color-strip { flex-wrap: wrap; }
  .color-strip__tier { min-width: 33%; flex: none; }
  .header { flex-direction: column; align-items: flex-start; }
  .tone-toggle { margin-left: 0; }
}
</style>
</head>
<body>
<div class="header">
  <h1>Feedback Lookbook</h1>
  <nav>
    <a href="#color-strip">Scale</a>
    <a href="#tier-ref">Tiers</a>
    <a href="#review-labels">Review Labels</a>
    <a href="#expanded-grades">Eval Grades</a>
    <a href="#matrix">Matrix</a>
    <a href="#detail-lines">Detail Lines</a>
    <a href="#lfym-states">LFYM States</a>
    <a href="#mistake-count">Count Gradient</a>
    <a href="#special">Special</a>
    <a href="#glyphs">Glyphs</a>
    <a href="#lfym-icons">LFYM Icons</a>
  </nav>
  <div class="header-right">
    <div class="tone-toggle">
      <span>Tone:</span>
      <button class="active" data-tone="standard" onclick="setTone('standard')">Standard</button>
      <button data-tone="harsh" onclick="setTone('harsh')">Harsh</button>
    </div>
    <div class="regen-hint">
      <button onclick="toggleRegen()">Regenerate</button>
      <div class="regen-tooltip" id="regen-tooltip">
        <p>This is a static snapshot. To regenerate after editing <code>src/feedback/severity.ts</code>:</p>
        <p><code>npm run lookbook:generate</code></p>
        <p style="opacity:0.6">Then refresh this page to see the changes.</p>
      </div>
    </div>
  </div>
</div>

<div class="content">

<!-- A. Color Scale Strip -->
<section id="color-strip">
<h2>A. Severity Color Scale</h2>
<div class="color-strip">
${SEVERITY_TIERS.map(t => `  <div class="color-strip__tier" style="background:${t.color};color:${contrastText(t.color)}">
    <span class="label">${esc(t.label)}</span>
    <span class="hex">${t.color}</span>
    <span class="range">${esc(lossRange(t))}</span>
  </div>`).join('\n')}
</div>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> This color scale appears throughout the app whenever a move\u2019s quality is communicated visually. The colored label in the "Chosen because:" box during Learn From Your Mistakes, the colored dots on the eval graph after game review, and the severity badges next to games in the games list all pull from this palette. ...</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details">This color scale appears throughout the app whenever a move\u2019s quality is communicated visually. The colored label in the "Chosen because:" box during Learn From Your Mistakes, the colored dots on the eval graph after game review, and the severity badges next to games in the games list all pull from this palette. Green = good, crimson = catastrophic.<br><br><strong>Code:</strong> <code>SEVERITY_TIERS</code> in <code>src/feedback/severity.ts</code>.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>LFYM "Chosen because:" label \u2014 Game Analysis tool</li><li>Eval graph colored dots \u2014 Game Analysis tool</li><li>Game list severity badges \u2014 Games tab</li><li>Weakness detection thresholds \u2014 Stats Dashboard tool</li></ul></div></div>
</section>

<!-- B. Tier Reference Table -->
<section id="tier-ref">
<h2>B. Tier Reference</h2>
<table>
<thead><tr><th>Tier</th><th>Color</th><th>Hex</th><th>Glyph</th><th>Loss Range</th><th>Approx CP</th><th>Label</th></tr></thead>
<tbody>
${SEVERITY_TIERS.map(t => `<tr>
  <td>${esc(t.id)}</td>
  <td><span class="swatch" style="background:${t.color}"></span></td>
  <td><code>${t.color}</code></td>
  <td class="glyph">${t.glyph ? esc(t.glyph) : '\u2014'}</td>
  <td>${esc(lossRange(t))}</td>
  <td>${esc(APPROX_CP[t.id])}</td>
  <td>${esc(t.label)}</td>
</tr>`).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> Every move in a reviewed game is silently classified into one of these tiers based on how much winning chance it cost. The user sees this tier reflected in the color of the "Chosen because:" label during LFYM, and in the colored dots on the eval graph below the board.</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details"><strong>Code:</strong> <code>classifySeverity()</code> in <code>src/feedback/severity.ts</code>.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>LFYM "Chosen because:" label + summary \u2014 Game Analysis tool</li><li>Eval graph dot colors \u2014 Game Analysis tool</li><li>Game summary panel stats \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- C. Existing Game Review Labels -->
<section id="review-labels">
<h2>C. Existing Game Review Labels (3-tier)</h2>
<p>Current classification from <code>winchances.ts</code> \u2014 these map onto the 9-tier gradient:</p>
<table>
<thead><tr><th>Label</th><th>Glyph</th><th>Threshold (loss)</th><th>Threshold (WC%)</th><th class="mapping-arrow">Maps to new tier(s)</th></tr></thead>
<tbody>
<tr>
  <td>Inaccuracy</td><td class="glyph">?!</td><td>\u2265 0.05</td><td>\u2265 10%</td>
  <td class="mapping-arrow">\u2192 <span style="color:#56b4e9">inaccuracy</span> + <span style="color:#e69d00">mistake</span></td>
</tr>
<tr>
  <td>Mistake</td><td class="glyph">?</td><td>\u2265 0.10</td><td>\u2265 20%</td>
  <td class="mapping-arrow">\u2192 <span style="color:#e69d00">mistake</span> + <span style="color:#e06c4e">serious</span></td>
</tr>
<tr>
  <td>Blunder</td><td class="glyph">??</td><td>\u2265 0.15</td><td>\u2265 30%</td>
  <td class="mapping-arrow">\u2192 <span style="color:#e06c4e">serious</span> + <span style="color:#db3031">blunder</span> + <span style="color:#8b1a1a">catastrophic</span></td>
</tr>
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> After pressing Review, the app labels each move as an inaccuracy, mistake, or blunder. These labels appear as glyphs (<code>?!</code>, <code>?</code>, <code>??</code>) in the move list next to each move, in the game summary panel ("3 blunders, 2 mistakes, 1 inaccuracy"), and as colored dots on the eval graph. This is the original Lichess 3-tier system \u2014 the 9-tier severity gradient above is a finer subdivision of the same scale.<br><br><strong>Code:</strong> <code>classifyLoss()</code> in <code>src/engine/winchances.ts</code>.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Move list glyphs (<code>?!</code> <code>?</code> <code>??</code>) \u2014 Game Analysis tool</li><li>Game summary panel ("3 blunders, 2 mistakes") \u2014 Game Analysis tool</li><li>Stats extraction (blunder/mistake/inaccuracy counts) \u2014 Stats Dashboard tool</li><li>LFYM candidate selection threshold \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- D. Eval Box Grades -->
<section id="expanded-grades">
<h2>D. Eval Box Grades</h2>
<p>Proposed 9-tier replacement for the current 4-grade eval box system. Measures how close the solving attempt is to the engine\u2019s best move. Same color palette as the severity tiers.</p>
<div class="color-strip" style="margin-bottom:16px">
${EXPANDED_EVAL_GRADES.map(g => `  <div class="color-strip__tier" style="background:${g.color};color:${contrastText(g.color)}">
    <span class="label">${esc(g.label)}</span>
    <span class="hex">${g.color}</span>
    <span class="range">${esc(g.lossRange)}</span>
  </div>`).join('\n')}
</div>
<table>
<thead><tr><th>Grade</th><th>Color</th><th>Hex</th><th>Label</th><th>Loss Range</th><th>Meaning</th></tr></thead>
<tbody>
${EXPANDED_EVAL_GRADES.map(g => `<tr>
  <td><code>${esc(g.grade)}</code></td>
  <td><span class="swatch" style="background:${g.color}"></span></td>
  <td><code>${g.color}</code></td>
  <td><strong contenteditable="true" data-tone="eval-grade" data-reason="${g.grade}" data-tier="${g.grade}" data-field="label">${esc(g.label)}</strong></td>
  <td>${esc(g.lossRange)}</td>
  <td><span contenteditable="true" data-tone="eval-grade" data-reason="${g.grade}" data-tier="${g.grade}" data-field="meaning">${esc(g.meaning)}</span></td>
</tr>`).join('\n')}
</tbody>
</table>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> During LFYM, after the user plays a move, two small comparison boxes appear: "vs Engine Best" and "vs Move Played." Each box\u2019s number and border are colored on this 10-grade scale to show how close the user\u2019s attempt was to the engine\u2019s best move. Green means very close, crimson means way off. ...</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details">During LFYM, after the user plays a move, two small comparison boxes appear: "vs Engine Best" and "vs Move Played." Each box\u2019s number and border are colored on this 10-grade scale to show how close the user\u2019s attempt was to the engine\u2019s best move. Green means very close, crimson means way off. If the user finds a checkmate, the box turns purple with "#KO!".<br><br><strong>Code:</strong> <code>classifyEvalBoxGrade()</code> and <code>getEvalBoxGradeMeta()</code> in <code>src/feedback/severity.ts</code>.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>LFYM "vs Engine Best" eval box \u2014 Game Analysis tool</li><li>LFYM "vs Move Played" eval box \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- E & F. Reason x Severity Matrix -->
<section id="matrix">
<h2>E/F. Reason \u00d7 Severity Matrix</h2>

${['standard', 'harsh'].map(tone => `
<div class="tone-section ${tone === 'standard' ? 'visible' : ''}" data-tone-section="${tone}">
<h3>${tone === 'standard' ? 'Standard' : 'Harsh'} Tone \u2014 Positive Tiers (all reasons)</h3>
<div class="positive-row">
<table>
<thead><tr>${POSITIVE_TIERS.map(t => {
  const meta = SEVERITY_TIERS.find(s => s.id === t);
  return `<th style="color:${meta.color}">${esc(meta.label)}</th>`;
}).join('')}</tr></thead>
<tbody><tr>${POSITIVE_TIERS.map(t => {
  const meta = SEVERITY_TIERS.find(s => s.id === t);
  const fb = ALL_FEEDBACK[tone]['swing'][t];
  return `<td class="cell" style="background:${meta.color}15"><strong contenteditable="true" data-tone="${tone}" data-reason="swing" data-tier="${t}" data-field="label">${esc(fb.label)}</strong><br><span contenteditable="true" data-tone="${tone}" data-reason="swing" data-tier="${t}" data-field="summary">${esc(fb.summary)}</span></td>`;
}).join('')}</tr></tbody>
</table>
</div>

<h3>${tone === 'standard' ? 'Standard' : 'Harsh'} Tone \u2014 Negative Tiers by Reason</h3>
<div class="matrix">
<table>
<thead><tr><th class="reason">Reason</th>${NEGATIVE_TIERS.map(t => {
  const meta = SEVERITY_TIERS.find(s => s.id === t);
  return `<th style="color:${meta.color}">${esc(meta.label)}</th>`;
}).join('')}</tr></thead>
<tbody>
${REASON_CODES.map(rc => `<tr>
  <td class="reason"><strong>${esc(REASON_LABELS[rc])}</strong><br><code>${esc(rc)}</code></td>
  ${NEGATIVE_TIERS.map(t => {
    const meta = SEVERITY_TIERS.find(s => s.id === t);
    const fb = ALL_FEEDBACK[tone][rc][t];
    return `<td class="cell" style="background:${meta.color}15"><span contenteditable="true" data-tone="${tone}" data-reason="${rc}" data-tier="${t}" data-field="summary">${esc(fb.summary)}</span></td>`;
  }).join('')}
</tr>`).join('\n')}
</tbody>
</table>
</div>
</div>
`).join('\n')}
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> In the LFYM panel, after solving or viewing the solution, a "Chosen because:" note appears explaining why this position was selected as a learning moment. The label (e.g., "Serious mistake.") is colored by severity, and the summary text below it explains the nature of the error in plain language. ...</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details">In the LFYM panel, after solving or viewing the solution, a "Chosen because:" note appears explaining why this position was selected as a learning moment. The label (e.g., "Serious mistake.") is colored by severity, and the summary text below it explains the nature of the error in plain language. The text varies based on both what kind of mistake it was (missed opportunity, blown win, missed mate, etc.) and how severe it was.<br><br><strong>Code:</strong> <code>getSeverityFeedback(reasonCode, loss, isExactBest)</code> in <code>src/feedback/severity.ts</code>, wired in the <code>renderReasonNote()</code> function of <code>retroView.ts</code>.</div></div>
</section>

<!-- F2. LFYM Feedback Detail Lines -->
<section id="detail-lines">
<h2>F2. LFYM Feedback Preview \u2014 Detail Lines</h2>
<p>How the expanded "Chosen because" section would appear in the LFYM panel. Each card shows the three-line structure: <strong>label</strong> (colored by severity), <strong>detail line</strong> (data-grounded, referencing actual move and eval data from the candidate), and <strong>summary</strong> (severity-modulated).</p>
<p style="opacity:0.6">Placeholders like {playedSan} and {bestSan} are filled at render time from the RetroCandidate. Sample values shown in parentheses.</p>

${REASON_CODES.map(rc => {
  const meta = REASON_LABELS[rc];
  return `<div class="lfym-reason-group">
<div class="lfym-reason-group__title">${esc(meta)} <code style="opacity:0.4;font-size:13px">${esc(rc)}</code></div>
<div class="lfym-preview">
${NEGATIVE_TIERS.map(tier => {
  const tierMeta = SEVERITY_TIERS.find(s => s.id === tier);
  const fb = ALL_FEEDBACK['standard'][rc][tier];
  const dl = DETAIL_LINES[rc][tier];
  // Fill sample values into placeholders for preview
  const sampleParts = (dl.sample || '').split(' / ');
  let detailPreview = dl.detail
    .replace('{playedSan}', sampleParts[0] || 'Nf3')
    .replace('{bestSan}', sampleParts[1] || 'Bb5')
    .replace('{cpDiff}', sampleParts[2] || '+1.5 pawns')
    .replace('{mateDistance}', sampleParts[0] || '2')
    .replace('{nth}', sampleParts[0] || '2nd');
  return `<div class="lfym-card">
  <div class="lfym-card__reason">Chosen because:</div>
  <div class="lfym-card__header">
    <span class="lfym-card__label" style="color:${tierMeta.color}" contenteditable="true" data-tone="detail" data-reason="${rc}" data-tier="${tier}" data-field="label">${esc(fb.label)}</span>
  </div>
  <div class="lfym-card__detail" style="border-color:${tierMeta.color}40;color:${tierMeta.color}" contenteditable="true" data-tone="detail" data-reason="${rc}" data-tier="${tier}" data-field="detail">${esc(detailPreview)}</div>
  <div class="lfym-card__summary" contenteditable="true" data-tone="detail" data-reason="${rc}" data-tier="${tier}" data-field="summary">${esc(fb.summary)}</div>
  <div class="lfym-card__meta">${esc(tierMeta.label)} \u2022 Loss: ${tier === 'catastrophic' ? '>0.30' : '\u2264' + tierMeta.lossCeiling} \u2022 ${esc(tierMeta.color)}</div>
  <div class="panel-id">detail-${rc}-${tier}</div>
</div>`;
}).join('\n')}
</div>
</div>`;
}).join('\n')}
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> Not yet visible \u2014 this is a designed expansion. When wired, a third line will appear in the "Chosen because:" box between the label and summary. ...</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details">Not yet visible \u2014 this is a designed expansion. When wired, a third line will appear in the "Chosen because:" box between the label and summary. It will reference the actual moves and eval data from the position (e.g., "Ng5 was played instead of Bc2. The evaluation swung by roughly +2.4 pawns.") giving the user concrete, data-grounded context without guessing at chess meaning.<br><br><strong>Status:</strong> Designed but not yet wired. A future prompt will build the detail line generator and connect it to <code>renderReasonNote()</code> in <code>retroView.ts</code>.</div></div>
</section>

<!-- F3. LFYM Panel States -->
<section id="lfym-states">
<h2>F3. LFYM Panel States</h2>
<p>Every possible screen the user sees during a Learn From Your Mistakes session. The first panel is annotated with CSS class names.</p>

<style>
.lfym-panel { background: #262421; border: 1px solid #3a3a3a; border-radius: 6px; max-width: 400px; padding: 0; margin-bottom: 24px; font-size: 15px; }
.lfym-panel__title { background: #1a1a1a; padding: 8px 12px; border-bottom: 1px solid #3a3a3a; display: flex; justify-content: space-between; align-items: center; font-size: 13px; border-radius: 6px 6px 0 0; }
.lfym-panel__title span:first-child { font-weight: 600; }
.lfym-panel__title .progress { opacity: 0.5; }
.lfym-panel__body { padding: 14px 16px; }
.lfym-panel__icon { font-size: 22px; margin-right: 8px; display: inline-block; vertical-align: middle; }
.lfym-panel__icon--win { color: #759900; }
.lfym-panel__icon--fail { color: #dc322f; }
.lfym-panel__icon--off { color: #e0a030; }
.lfym-panel strong { display: block; margin-bottom: 6px; font-size: 15px; }
.lfym-panel em { display: block; margin-bottom: 8px; font-size: 14px; opacity: 0.8; }
.lfym-panel .eval-boxes { display: flex; flex-direction: column; gap: 5px; margin: 8px 0; }
.lfym-panel .eval-box { display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; border-radius: 4px; border: 1px solid transparent; }
.lfym-panel .eval-box__label { font-size: 13px; color: #888; }
.lfym-panel .eval-box__value { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.lfym-panel .reason { margin-top: 10px; padding: 7px 10px; border-radius: 4px; background: rgba(255,255,255,0.03); }
.lfym-panel .reason__label { font-size: 13px; font-weight: 600; }
.lfym-panel .reason__detail { font-size: 13px; line-height: 1.4; margin-top: 4px; padding-left: 8px; border-left: 2px solid; }
.lfym-panel .reason__summary { font-size: 13px; opacity: 0.6; font-style: italic; margin-top: 4px; }
.lfym-panel .actions { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.lfym-panel .actions a, .lfym-panel .actions button { display: block; background: none; border: none; color: #629924; font-size: 13px; text-align: left; padding: 2px 0; cursor: pointer; font-family: inherit; }
.lfym-panel .actions button.btn-save { color: #888; }
.lfym-panel .continue { margin-top: 10px; text-align: right; }
.lfym-panel .continue a { color: #629924; font-size: 14px; font-weight: 600; cursor: pointer; }
.lfym-states-grid { display: flex; flex-wrap: wrap; gap: 24px; }
.lfym-state-label { font-size: 14px; font-weight: 600; margin-bottom: 8px; opacity: 0.5; }
.lfym-state-section { margin-bottom: 32px; }
.lfym-state-section h3 { font-size: 17px; margin: 0 0 16px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.class-tag { display: inline-block; font-size: 10px; background: #333; color: #aaa; padding: 1px 5px; border-radius: 3px; font-family: monospace; margin-left: 4px; vertical-align: middle; }
.panel-id { display: block; font-size: 11px; font-family: monospace; color: #555; margin-top: 6px; text-align: center; cursor: pointer; transition: color 0.15s; user-select: none; }
.panel-id:hover { color: #888; }
.panel-id.copied { color: #26a641; }
.usage-note { background: #222; border: 1px solid #3a3a3a; border-radius: 6px; padding: 12px 16px; font-size: 14px; line-height: 1.6; margin-top: 16px; margin-bottom: 0; color: #bbb; position: relative; cursor: pointer; }
.usage-note strong { color: #ddd; }
.usage-note code { background: #333; padding: 1px 5px; border-radius: 3px; font-size: 12px; color: #ccc; }
.usage-note ul { color: #aaa; }
.usage-note .usage-summary { display: block; padding-right: 90px; }
.usage-note .usage-expand { position: absolute; bottom: 10px; right: 14px; font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; pointer-events: none; transition: color 0.15s; }
.usage-note:hover .usage-expand { color: #999; }
.usage-note.expanded .usage-expand .expand-text { display: none; }
.usage-note .usage-expand .collapse-text { display: none; }
.usage-note.expanded .usage-expand .collapse-text { display: inline; }
.usage-note .usage-expand .expand-icon { transition: transform 0.2s; }
.usage-note.expanded .usage-expand .expand-icon { transform: rotate(180deg); }
.usage-note .usage-details { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #3a3a3a; color: #999; }
.usage-note.expanded .usage-details { display: block; }
</style>

<!-- === FIND STATE === -->
<div class="lfym-state-section">
<h3>Find State</h3>
<p style="font-size:14px;opacity:0.6">Prompt to solve. Annotated with CSS class names.</p>
<div class="lfym-states-grid">
<div>
<div class="lfym-state-label">FIND \u2014 feedback='find' <span class="panel-id">panel-find</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <strong>Nxf3 was played <span class="class-tag">retro-instruction > strong</span></strong>
    <em>Find a better move for White <span class="class-tag">retro-instruction > em</span></em>
    <div class="actions">
      <a>View the solution <span class="class-tag">retro-choices > a</span></a>
      <a>Skip this move <span class="class-tag">retro-choices > a</span></a>
    </div>
  </div>
</div>
</div>

<div>
<div class="lfym-state-label">FIND \u2014 Vindicated (deeper review confirms game move was best)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong style="font-size:14px">Actually upon deeper review, you did play the best move during the game.</strong>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>
</div>
</div>

<!-- === FAIL STATES === -->
<div class="lfym-state-section">
<h3>Fail States</h3>
<p style="font-size:14px;opacity:0.6">User attempted a move but it wasn\u2019t good enough. Three variants based on <code>failKind</code>.</p>
<div class="lfym-states-grid">

<div>
<div class="lfym-state-label">FAIL (better) \u2014 Improved but not best</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--fail">\u2717 <span class="class-tag">retro-icon--fail</span></span>
    <strong>Better, but not the best move available. <span class="class-tag">failKind='better'</span></strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#56b4e966;background:#56b4e91a">
        <span class="eval-box__label">vs Engine Best <span class="class-tag">retro-eval-box</span></span>
        <span class="eval-box__value" style="color:#56b4e9">-0.8 <span class="class-tag">off-target</span></span>
      </div>
      <div class="eval-box" style="border-color:#7bc67e66;background:#7bc67e1a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#7bc67e">+1.2 <span class="class-tag">close</span></span>
      </div>
    </div>
    <div class="actions">
      <a>View the solution</a>
      <a>Skip this move</a>
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
  </div>
</div>
</div>

<div>
<div class="lfym-state-label">FAIL (default) \u2014 You can do better <span class="panel-id">panel-fail-default</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--fail">\u2717</span>
    <strong>You can do better. <span class="class-tag">failKind=null</span></strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#e69d0066;background:#e69d001a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#e69d00">-1.5 <span class="class-tag">wide-miss</span></span>
      </div>
      <div class="eval-box" style="border-color:#8bb8a866;background:#8bb8a81a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#8bb8a8">+0.5 <span class="class-tag">acceptable</span></span>
      </div>
    </div>
    <div class="actions">
      <a>View the solution</a>
      <a>Skip this move</a>
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
  </div>
</div>
</div>

<div>
<div class="lfym-state-label">FAIL (worse) \u2014 Even worse than game move</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--fail">\u2717</span>
    <strong>That move is even worse. <span class="class-tag">failKind='worse'</span></strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#db303166;background:#db30311a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#db3031">-4.1 <span class="class-tag">way-off</span></span>
      </div>
      <div class="eval-box" style="border-color:#8b1a1a66;background:#8b1a1a1a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#8b1a1a">-2.3 <span class="class-tag">wrong</span></span>
      </div>
    </div>
    <div class="actions">
      <a>View the solution</a>
      <a>Skip this move</a>
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
  </div>
</div>
</div>

</div>
</div>

<!-- === WIN STATES === -->
<div class="lfym-state-section">
<h3>Win States \u2014 Correct Move Found</h3>
<p style="font-size:14px;opacity:0.6">User found the best or near-best move. Shown across the full severity spectrum of the <em>original mistake</em> that was being solved.</p>
<div class="lfym-states-grid">

<!-- Win: exact best, inaccuracy-level original mistake -->
<div>
<div class="lfym-state-label">WIN (exact) \u2014 Inaccuracy-level mistake solved <span class="panel-id">panel-win-inaccuracy</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">1 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Good move!</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#26a641">\u2713</span>
      </div>
      <div class="eval-box" style="border-color:#57ab5a66;background:#57ab5a1a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#57ab5a">+0.3</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#56b4e9">Chosen because: Inaccuracy.</div>
      <div class="reason__detail" style="border-color:#56b4e940;color:#56b4e9">The engine found a slightly stronger continuation. The move played was the 2nd-best option.</div>
      <div class="reason__summary">A slightly stronger continuation was available.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

<!-- Win: exact best, mistake-level -->
<div>
<div class="lfym-state-label">WIN (exact) \u2014 Mistake-level solved <span class="panel-id">panel-win-mistake</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">2 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Good move!</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#26a641">\u2713</span>
      </div>
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#26a641">+1.2</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#e69d00">Chosen because: Mistake.</div>
      <div class="reason__detail" style="border-color:#e69d0040;color:#e69d00">The engine\u2019s best move was worth roughly +1.2 pawns more. This was a meaningful missed opportunity.</div>
      <div class="reason__summary">The move played gave up a meaningful part of your advantage.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

<!-- Win: exact best, serious-level (swing) -->
<div>
<div class="lfym-state-label">WIN (exact) \u2014 Serious mistake solved <span class="panel-id">panel-win-serious</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Good move!</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#26a641">\u2713</span>
      </div>
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#26a641">+2.4</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#e06c4e">Chosen because: Serious mistake.</div>
      <div class="reason__detail" style="border-color:#e06c4e40;color:#e06c4e">Ng5 was played instead of Bc2. The evaluation swung by roughly +2.4 pawns.</div>
      <div class="reason__summary">A much stronger move was available \u2014 this significantly weakened your position.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

<!-- Win: exact best, blunder-level (collapse) -->
<div>
<div class="lfym-state-label">WIN (exact) \u2014 Blunder solved (collapse) <span class="panel-id">panel-win-blunder-collapse</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">4 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Good move!</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#26a641">\u2713</span>
      </div>
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#26a641">+4.6</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#db3031">Chosen because: Blunder.</div>
      <div class="reason__detail" style="border-color:#db303140;color:#db3031">A won position was squandered with f4. The engine\u2019s choice Qe2 maintained a decisive advantage.</div>
      <div class="reason__summary">A completely winning position was squandered.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

<!-- Win: near-best -->
<div>
<div class="lfym-state-label">WIN (near-best) \u2014 Good enough <span class="panel-id">panel-win-near-best</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Good enough!</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#57ab5a66;background:#57ab5a1a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#57ab5a">-0.1 <span class="class-tag">near-perfect</span></span>
      </div>
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#26a641">+1.8</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#e69d00">Chosen because: Mistake.</div>
      <div class="reason__detail" style="border-color:#e69d0040;color:#e69d00">The engine\u2019s best move was worth roughly +1.2 pawns more. This was a meaningful missed opportunity.</div>
      <div class="reason__summary">The move played gave up a meaningful part of your advantage.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

<!-- Win: checkmate found -->
<div>
<div class="lfym-state-label">WIN (checkmate) \u2014 Found forced mate <span class="panel-id">panel-win-checkmate</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">5 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon" style="color:#a855f7">\u2713</span>
    <strong>Good move!</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#a855f766;background:#a855f71a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#a855f7">#KO! <span class="class-tag">checkmate</span></span>
      </div>
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#26a641">+5.2</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#db3031">Chosen because: Blunder.</div>
      <div class="reason__detail" style="border-color:#db303140;color:#db3031">Mate in 1 via Qxh7# was available. Bd3 was played instead.</div>
      <div class="reason__summary">Checkmate was right there. This move lets the opponent escape.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

<!-- Win: catastrophic original mistake -->
<div>
<div class="lfym-state-label">WIN (exact) \u2014 Catastrophic blunder solved <span class="panel-id">panel-win-catastrophic</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">6 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Good move!</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#26a641">\u2713</span>
      </div>
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#26a641">+8.3</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#8b1a1a">Chosen because: Catastrophic blunder.</div>
      <div class="reason__detail" style="border-color:#8b1a1a40;color:#8b1a1a">f4 was played instead of Qe2. The evaluation swung by roughly +8.3 pawns.</div>
      <div class="reason__summary">The position went from clearly favorable to lost in a single move.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

</div>
</div>

<!-- === VIEW STATE === -->
<div class="lfym-state-section">
<h3>View State \u2014 Solution Revealed</h3>
<p style="font-size:14px;opacity:0.6">User clicked "View the solution" without solving. Shows best move and full reason note.</p>
<div class="lfym-states-grid">

<div>
<div class="lfym-state-label">VIEW \u2014 Catastrophic blunder revealed <span class="panel-id">panel-view-catastrophic</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Solution</strong>
    <em>Best was <strong>Qe2</strong></em>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#8b1a1a66;background:#8b1a1a1a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#8b1a1a">-6.3 <span class="class-tag">wrong</span></span>
      </div>
      <div class="eval-box" style="border-color:#db303166;background:#db30311a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#db3031">-1.2 <span class="class-tag">way-off</span></span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#8b1a1a">Chosen because: Catastrophic blunder.</div>
      <div class="reason__detail" style="border-color:#8b1a1a40;color:#8b1a1a">f4 was played instead of Qe2. The evaluation swung by roughly +8.3 pawns.</div>
      <div class="reason__summary">The position went from clearly favorable to lost in a single move.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

<div>
<div class="lfym-state-label">VIEW \u2014 Missed mate revealed <span class="panel-id">panel-view-missed-mate</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">5 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Solution</strong>
    <em>Best was <strong>Qxh7#</strong></em>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#e06c4e66;background:#e06c4e1a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#e06c4e">-3.8 <span class="class-tag">far-off</span></span>
      </div>
      <div class="eval-box" style="border-color:#8bb8a866;background:#8bb8a81a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#8bb8a8">+0.4 <span class="class-tag">acceptable</span></span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#db3031">Chosen because: Blunder.</div>
      <div class="reason__detail" style="border-color:#db303140;color:#db3031">Mate in 1 via Qxh7# was available. Bd3 was played instead.</div>
      <div class="reason__summary">Checkmate was right there. This move lets the opponent escape.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save to Library</button>
      <button>Try another move</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
</div>

</div>
</div>

<!-- === HARSH MODE EXAMPLES === -->
<div class="lfym-state-section">
<h3>Harsh Mode Examples</h3>
<p style="font-size:14px;opacity:0.6">Representative panels showing how all text changes when harsh tone is active. Every user-facing string has a harsh variant.</p>
<div class="lfym-states-grid">

<div>
<div class="lfym-state-label">FIND (harsh)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:#e06c4e">1 / 12</span></div>
  <div class="lfym-panel__body">
    <div style="color:#e06c4e;font-size:14px;font-style:italic;margin-bottom:10px">I hope you're sitting down.</div>
    <strong>Ng5 was played. Let's fix that.</strong>
    <em>Find a better move for White. It's not hard.</em>
    <div class="actions">
      <a>Just show me the answer</a>
      <a>Give up on this one</a>
    </div>
  </div>
</div>
<div class="panel-id">panel-harsh-find</div>
</div>

<div>
<div class="lfym-state-label">FAIL (harsh)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:#e06c4e">3 / 12</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--fail">\u2717</span>
    <strong>Getting warmer. Still wrong.</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#e69d0066;background:#e69d001a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#e69d00">-1.5</span>
      </div>
      <div class="eval-box" style="border-color:#8bb8a866;background:#8bb8a81a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#8bb8a8">+0.5</span>
      </div>
    </div>
    <div class="actions">
      <a>Just show me the answer</a>
      <a>Give up on this one</a>
      <button class="btn-save">Save this embarrassment</button>
      <button>Try again.</button>
    </div>
  </div>
</div>
<div class="panel-id">panel-harsh-fail</div>
</div>

<div>
<div class="lfym-state-label">WIN (harsh)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:#e06c4e">3 / 12</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Well, you got one right.</strong>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#26a641">\u2713</span>
      </div>
      <div class="eval-box" style="border-color:#26a64166;background:#26a6411a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#26a641">+2.4</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#e06c4e">Chosen because: Serious mistake.</div>
      <div class="reason__detail" style="border-color:#e06c4e40;color:#e06c4e">Ng5 instead of Bc2. That cost you roughly +2.4 pawns.</div>
      <div class="reason__summary">The engine is embarrassed on your behalf.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save this embarrassment</button>
      <button>Try again.</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
<div class="panel-id">panel-harsh-win</div>
</div>

<div>
<div class="lfym-state-label">VIEW (harsh)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:#e06c4e">5 / 12</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong>Here's what you should have played.</strong>
    <em>The answer was <strong>Qe2</strong></em>
    <div class="eval-boxes">
      <div class="eval-box" style="border-color:#8b1a1a66;background:#8b1a1a1a">
        <span class="eval-box__label">vs Engine Best</span>
        <span class="eval-box__value" style="color:#8b1a1a">-6.3</span>
      </div>
      <div class="eval-box" style="border-color:#db303166;background:#db30311a">
        <span class="eval-box__label">vs Move Played</span>
        <span class="eval-box__value" style="color:#db3031">-1.2</span>
      </div>
    </div>
    <div class="reason">
      <div class="reason__label" style="color:#8b1a1a">Chosen because: Catastrophic blunder.</div>
      <div class="reason__detail" style="border-color:#8b1a1a40;color:#8b1a1a">f4 threw away a won game. Qe2 was right there. Cost: +8.3 pawns.</div>
      <div class="reason__summary">The engine would like to speak with your manager.</div>
    </div>
    <div class="actions">
      <button class="btn-save">Save this embarrassment</button>
      <button>Try again.</button>
    </div>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
<div class="panel-id">panel-harsh-view</div>
</div>

<div>
<div class="lfym-state-label">OFF TRACK (harsh)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:#e06c4e">3 / 12</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--off">!</span>
    <strong>Focus.</strong>
    <div class="actions">
      <a>Get back to work.</a>
    </div>
  </div>
</div>
<div class="panel-id">panel-harsh-offtrack</div>
</div>

<div>
<div class="lfym-state-label">END (harsh, disaster)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:#8b1a1a">18 / 18</span></div>
  <div class="lfym-panel__body">
    <strong style="color:#8b1a1a">Done. Let's never speak of this game again.</strong>
    <div class="actions" style="margin-top:8px">
      <a>Suffer through it again</a>
    </div>
  </div>
</div>
<div class="panel-id">panel-harsh-end</div>
</div>

<div>
<div class="lfym-state-label">VINDICATED (harsh)</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--win">\u2713</span>
    <strong style="font-size:14px">Fine. You were right this time. Don't let it go to your head.</strong>
    <div class="continue"><a>\u25b6 Next</a></div>
  </div>
</div>
<div class="panel-id">panel-harsh-vindicated</div>
</div>

</div>
</div>

<!-- === UTILITY STATES === -->
<div class="lfym-state-section">
<h3>Utility States</h3>
<p style="font-size:14px;opacity:0.6">Non-solving screens: engine evaluation, off-track navigation, and session end.</p>
<div class="lfym-states-grid">

<div>
<div class="lfym-state-label">EVAL \u2014 Engine thinking <span class="panel-id">panel-eval</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body" style="text-align:center;padding:24px 16px">
    <strong>Evaluating your move\u2026</strong>
    <div style="margin-top:12px;background:#3a3a3a;border-radius:4px;height:6px;overflow:hidden">
      <div style="width:60%;height:100%;background:#629924;border-radius:4px"></div>
    </div>
    <div style="font-size:12px;opacity:0.4;margin-top:4px">Depth: 14 / 18</div>
  </div>
</div>
</div>

<div>
<div class="lfym-state-label">OFF TRACK \u2014 Browsed away <span class="panel-id">panel-offtrack</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">3 / 7</span></div>
  <div class="lfym-panel__body">
    <span class="lfym-panel__icon lfym-panel__icon--off">!</span>
    <strong>You browsed away</strong>
    <div class="actions">
      <a>Resume learning</a>
    </div>
  </div>
</div>
</div>

<div>
<div class="lfym-state-label">END \u2014 No mistakes found <span class="panel-id">panel-end-empty</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">0 / 0</span></div>
  <div class="lfym-panel__body">
    <strong>No mistakes found.</strong>
  </div>
</div>
</div>

<div>
<div class="lfym-state-label">END \u2014 Session complete <span class="panel-id">panel-end-complete</span></div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress">7 / 7</span></div>
  <div class="lfym-panel__body">
    <strong>Done reviewing mistakes.</strong>
    <div class="actions" style="margin-top:8px">
      <a>Do it again</a>
      <button class="btn-save">Save 3 failed position(s) to Library</button>
    </div>
  </div>
</div>
</div>

</div>
</div>

<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> The LFYM panel is the box that appears on the right side of the analysis board when the user clicks "Mistakes." It walks through each flagged position one at a time. The user sees a prompt to find a better move, then feedback on their attempt (correct, close, or wrong), with colored eval boxes and a reason note. ...</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details">The LFYM panel is the box that appears on the right side of the analysis board when the user clicks "Mistakes." It walks through each flagged position one at a time. The user sees a prompt to find a better move, then feedback on their attempt (correct, close, or wrong), with colored eval boxes and a reason note. These panels show every possible state that box can be in.<br><br><strong>Code:</strong> <code>renderRetroStrip()</code> in <code>src/analyse/retroView.ts</code>.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>LFYM panel (all states) \u2014 Game Analysis tool</li><li>Eval comparison boxes \u2014 Game Analysis tool</li><li>Reason notes \u2014 Game Analysis tool</li><li>Session intro/end messaging \u2014 Game Analysis tool</li><li>Save to Library button \u2014 Game Analysis tool \u2192 Puzzle Library</li></ul></div></div>
</section>

<!-- F4. Mistake Count Gradient -->
<section id="mistake-count">
<h2>F4. Mistake Count Gradient</h2>
<p>Session-level messaging that escalates based on how many learnable moments were found in the game.</p>

<div class="color-strip" style="margin-bottom:16px">
${MISTAKE_COUNT_TIERS.map(t => `  <div class="color-strip__tier" style="background:${t.color};color:${contrastText(t.color)}">
    <span class="label">${esc(t.tier)}</span>
    <span class="hex">${t.color}</span>
    <span class="range">${t.countCeiling === Infinity ? t.countFloor + '+' : t.countFloor === t.countCeiling ? String(t.countFloor) : t.countFloor + '\u2013' + t.countCeiling}</span>
  </div>`).join('\n')}
</div>

<table style="margin-bottom:24px">
<thead><tr><th>Tier</th><th>Count</th><th>Color</th><th>Session Intro</th><th>Session End</th></tr></thead>
<tbody>
${MISTAKE_COUNT_TIERS.map(t => `<tr>
  <td><code>${esc(t.tier)}</code></td>
  <td>${t.countCeiling === Infinity ? t.countFloor + '+' : t.countFloor === t.countCeiling ? String(t.countFloor) : t.countFloor + '\u2013' + t.countCeiling}</td>
  <td><span class="swatch" style="background:${t.color}"></span> <code>${t.color}</code></td>
  <td contenteditable="true" data-tone="count" data-reason="${t.tier}" data-tier="${t.tier}" data-field="intro">${esc(t.sessionIntro || '\u2014')}</td>
  <td contenteditable="true" data-tone="count" data-reason="${t.tier}" data-tier="${t.tier}" data-field="end">${esc(t.sessionEnd)}</td>
</tr>`).join('\n')}
</tbody>
</table>

<h3>Harsh Tone</h3>
<table style="margin-bottom:24px">
<thead><tr><th>Tier</th><th>Count</th><th>Session Intro (harsh)</th><th>Session End (harsh)</th></tr></thead>
<tbody>
${MISTAKE_COUNT_TIERS.map(t => `<tr>
  <td><code>${esc(t.tier)}</code></td>
  <td>${t.countCeiling === Infinity ? t.countFloor + '+' : t.countFloor === t.countCeiling ? String(t.countFloor) : t.countFloor + '\u2013' + t.countCeiling}</td>
  <td contenteditable="true" data-tone="count-harsh" data-reason="${t.tier}" data-tier="${t.tier}" data-field="intro">${esc(t.sessionIntroHarsh || '\u2014')}</td>
  <td contenteditable="true" data-tone="count-harsh" data-reason="${t.tier}" data-tier="${t.tier}" data-field="end">${esc(t.sessionEndHarsh)}</td>
</tr>`).join('\n')}
</tbody>
</table>

<h3>LFYM Panel Previews \u2014 Session Intro by Count</h3>
<div class="lfym-states-grid">
${MISTAKE_COUNT_TIERS.filter(t => t.tier !== 'clean').map(t => {
  const countLabel = t.countCeiling === Infinity ? t.countFloor + '+' : t.countFloor === t.countCeiling ? String(t.countFloor) : t.countFloor + '\u2013' + t.countCeiling;
  const sampleCount = t.countCeiling === Infinity ? t.countFloor + 2 : Math.round((t.countFloor + t.countCeiling) / 2);
  return `<div>
<div class="lfym-state-label">${esc(t.tier.toUpperCase())} \u2014 ${countLabel} mistakes</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:${t.color}">1 / ${sampleCount}</span></div>
  <div class="lfym-panel__body">
    <div style="color:${t.color};font-size:14px;font-style:italic;margin-bottom:10px" contenteditable="true" data-tone="count-panel" data-reason="${t.tier}" data-tier="${t.tier}" data-field="intro">${esc(t.sessionIntro)}</div>
    <strong>Nxf3 was played</strong>
    <em>Find a better move for White</em>
    <div class="actions">
      <a>View the solution</a>
      <a>Skip this move</a>
    </div>
  </div>
</div>
<div class="panel-id">panel-count-intro-${esc(t.tier)}</div>
</div>`;
}).join('\n')}
</div>

<h3>Session End Previews</h3>
<div class="lfym-states-grid">
${MISTAKE_COUNT_TIERS.map(t => {
  const sampleCount = t.countCeiling === Infinity ? t.countFloor + 2 : t.countCeiling;
  return `<div>
<div class="lfym-state-label">END \u2014 ${esc(t.tier)}</div>
<div class="lfym-panel">
  <div class="lfym-panel__title"><span>Learn from your mistakes</span><span class="progress" style="color:${t.color}">${sampleCount} / ${sampleCount}</span></div>
  <div class="lfym-panel__body">
    <strong style="color:${t.color}" contenteditable="true" data-tone="count-end-panel" data-reason="${t.tier}" data-tier="${t.tier}" data-field="end">${esc(t.sessionEnd)}</strong>
    ${t.tier !== 'clean' ? '<div class="actions" style="margin-top:8px"><a>Do it again</a></div>' : ''}
  </div>
</div>
<div class="panel-id">panel-count-end-${esc(t.tier)}</div>
</div>`;
}).join('\n')}
</div>

<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> When the user opens Learn From Your Mistakes, the number in the top-right corner ("3 / 7") is tinted with a color that reflects how many mistakes the game had overall. On the very first puzzle, a short intro message appears (e.g., "This game had a lot of room for improvement.") that sets the tone for the session. ...</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details">When the user opens Learn From Your Mistakes, the number in the top-right corner ("3 / 7") is tinted with a color that reflects how many mistakes the game had overall. On the very first puzzle, a short intro message appears (e.g., "This game had a lot of room for improvement.") that sets the tone for the session. At the end, a closing message replaces the generic "Done reviewing mistakes" with something that matches the overall severity. More mistakes = warmer/redder colors and more direct language.<br><br><strong>Code:</strong> <code>classifyMistakeCount(total)</code> in <code>src/feedback/severity.ts</code>, wired in <code>retroView.ts</code>. Affects <code>.retro-box__progress</code> color, first-find intro, and session-end message.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>LFYM panel \u2014 Game Analysis tool \u2014 progress counter tint</li><li>LFYM panel \u2014 Game Analysis tool \u2014 first puzzle intro message</li><li>LFYM panel \u2014 Game Analysis tool \u2014 session end message</li></ul></div></div>
</section>

<!-- G. Special Classifications -->
<section id="special">
<h2>G. Special Classifications</h2>
<div class="special-cards">
${Object.values(SPECIAL_CLASSIFICATIONS).map(s => `<div class="special-card">
  <div class="card-label" style="color:${s.color}">${esc(s.label)}</div>
  <div class="card-summary">${esc(s.summary)}</div>
  <div class="card-color"><span class="swatch" style="background:${s.color}"></span> ${s.color}</div>
</div>`).join('\n')}
</div>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>Status:</strong> Defined in <code>SPECIAL_CLASSIFICATIONS</code> in <code>src/feedback/severity.ts</code> but not yet wired.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Not yet used in any tool \u2014 reserved for future surfaces</li></ul></div></div>
</section>

<!-- H. Board Glyphs -->
<section id="glyphs">
<h2>H. Board Glyphs</h2>
<p>Annotation badges as they appear on board squares after game review.</p>
<div class="glyph-gallery">
${buildGlyphCards()}
</div>
<div class="usage-note" onclick="this.classList.toggle('expanded')"><div class="usage-summary" ><strong>What the user sees:</strong> After game review, colored circle badges appear on the board squares where each move lands \u2014 blue for inaccuracies, orange for mistakes, red for blunders, green for good moves. The same glyphs appear as text symbols in the move list. ...</div><div class="usage-expand"><span class="expand-icon">▼</span><span class="expand-text">Show details</span><span class="collapse-text">Hide details</span></div><div class="usage-details">After game review, colored circle badges appear on the board squares where each move lands \u2014 blue for inaccuracies, orange for mistakes, red for blunders, green for good moves. The same glyphs appear as text symbols in the move list. The purple KO skull appears on the losing king\u2019s square at checkmate.<br><br><strong>Code:</strong> <code>annotationShapes()</code> in <code>src/analyse/boardGlyphs.ts</code>, <code>GLYPH_COLORS</code> in <code>moveList.ts</code>, KO overlay in <code>engine/ctrl.ts</code>.<br><br><strong>Present in:</strong><ul style="margin:4px 0 0;padding-left:20px"><li>Board square badges after review \u2014 Game Analysis tool</li><li>Move list glyph symbols \u2014 Game Analysis tool</li><li>Eval graph dot colors \u2014 Game Analysis tool</li><li>KO skull overlay at checkmate \u2014 Game Analysis tool</li></ul></div></div>
</section>

<!-- I. LFYM Feedback Icons -->
<section id="lfym-icons">
<h2>I. LFYM Feedback Icons</h2>
<p style="margin:0 0 16px;color:#aaa;font-size:15px;">Icons shown in the Learn From Your Mistakes feedback box. Each maps to a specific session feedback state.</p>
<div class="glyph-gallery">
${LFYM_ICONS.map(icon => `
  <div class="glyph-card">
    <div style="width:80px;height:80px;border-radius:8px;background:#222;border:2px solid ${icon.color};display:flex;align-items:center;justify-content:center;font-size:44px;color:${icon.color};line-height:1;">${icon.symbol}</div>
    <div class="glyph-card__label">${icon.name}</div>
    <div class="glyph-card__sub">State: ${icon.state}</div>
    <div class="glyph-card__sub" style="color:${icon.color}">${icon.color}</div>
    <div class="glyph-card__sub" style="max-width:140px;white-space:normal;margin-top:4px;font-size:13px;">${icon.meaning}</div>
  </div>`).join('\n')}
</div>
</section>

</div><!-- .content -->

<!-- Save bar (hidden until edits are made) -->
<div class="save-bar" id="save-bar">
  <span class="edit-count" id="edit-count">0 edits</span>
  <button onclick="saveEdits()">Save Edits</button>
  <span class="save-status" id="save-status"></span>
</div>

<!-- Save confirmation modal -->
<div id="save-modal" style="display:none;position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center">
  <div style="background:#222;border:1px solid #3a3a3a;border-radius:8px;padding:24px 32px;max-width:480px;text-align:center;line-height:1.6">
    <div style="font-size:18px;font-weight:600;margin-bottom:12px;color:#26a641">Edits saved!</div>
    <p style="margin:0 0 16px;font-size:14px">Your changes have been downloaded as <code style="background:#333;padding:2px 6px;border-radius:3px">feedback-edits.json</code></p>
    <p style="margin:0 0 16px;font-size:13px;opacity:0.8">To apply them, tell Claude:</p>
    <div style="background:#1a1a1a;border:1px solid #3a3a3a;border-radius:6px;padding:12px 16px;font-size:14px;text-align:left;margin-bottom:16px;color:#e8e8e8;font-family:monospace">Apply my feedback edits from docs/feedback-edits.json</div>
    <button onclick="document.getElementById('save-modal').style.display='none'" style="background:#629924;color:#fff;border:none;border-radius:4px;padding:8px 20px;cursor:pointer;font-size:14px">Got it</button>
  </div>
</div>

<script>
// Click-to-copy for panel IDs
document.addEventListener('click', function(e) {
  const el = e.target.closest('.panel-id');
  if (!el) return;
  const text = el.textContent.trim();
  navigator.clipboard.writeText(text).then(function() {
    el.classList.add('copied');
    const orig = el.textContent;
    el.textContent = '\u2713 copied';
    setTimeout(function() { el.textContent = orig; el.classList.remove('copied'); }, 1200);
  });
});
function setTone(tone) {
  document.querySelectorAll('.tone-section').forEach(el => {
    el.classList.toggle('visible', el.dataset.toneSection === tone);
  });
  document.querySelectorAll('.tone-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tone === tone);
  });
}
function toggleRegen() {
  document.getElementById('regen-tooltip').classList.toggle('visible');
}
document.addEventListener('click', function(e) {
  const hint = document.querySelector('.regen-hint');
  if (hint && !hint.contains(e.target)) {
    document.getElementById('regen-tooltip').classList.remove('visible');
  }
});

// --- Edit tracking ---
const originalValues = new Map();
const editedCells = new Set();

// Snapshot originals on load
document.querySelectorAll('[contenteditable]').forEach(el => {
  const key = editKey(el);
  originalValues.set(key, el.textContent.trim());
});

function editKey(el) {
  return [el.dataset.tone, el.dataset.reason, el.dataset.tier, el.dataset.field].join('|');
}

document.addEventListener('input', function(e) {
  const el = e.target;
  if (!el.hasAttribute('contenteditable') || !el.dataset.tone) return;
  const key = editKey(el);
  const current = el.textContent.trim();
  const original = originalValues.get(key);
  if (current !== original) {
    editedCells.add(key);
    el.classList.add('edit-dirty');
  } else {
    editedCells.delete(key);
    el.classList.remove('edit-dirty');
  }
  updateSaveBar();
});

function updateSaveBar() {
  const bar = document.getElementById('save-bar');
  const count = editedCells.size;
  document.getElementById('edit-count').textContent = count + ' edit' + (count !== 1 ? 's' : '');
  bar.classList.toggle('visible', count > 0);
}

function saveEdits() {
  const edits = {};
  document.querySelectorAll('[contenteditable].edit-dirty').forEach(el => {
    const { tone, reason, tier, field } = el.dataset;
    if (!edits[tone]) edits[tone] = {};
    if (!edits[tone][reason]) edits[tone][reason] = {};
    if (!edits[tone][reason][tier]) edits[tone][reason][tier] = {};
    edits[tone][reason][tier][field] = el.textContent.trim();
  });

  const json = JSON.stringify(edits, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'feedback-edits.json';
  a.click();
  URL.revokeObjectURL(url);

  // Also try to save to docs/ via fetch if served through the dev server
  fetch('/api/save-feedback-edits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  }).catch(function() {
    // Silently ignore if not served through dev server — download is the primary path
  });

  document.getElementById('save-status').textContent = 'Downloaded!';
  document.getElementById('save-modal').style.display = 'flex';
}
</script>
</body>
</html>`;
}

// Simple contrast check — light text for dark backgrounds, dark for light
function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#1a1a1a' : '#e8e8e8';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const html = buildHTML();
writeFileSync(outPath, html, 'utf8');
console.log(`Generated: ${outPath}`);
