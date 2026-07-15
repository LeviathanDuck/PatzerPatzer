// Per-game summary type for the improvement intelligence platform.
// Persisted to the 'game-summaries' IDB store after batch analysis completes.
// Drives the stats dashboard, weakness engine, and training recommendations.

export const CURRENT_GAME_SUMMARY_EXTRACTION_VERSION = 2;

export interface GameSummaryBackfillResult {
  created: number;
  rebuilt: number;
  skippedCurrent: number;
  skippedNewer: number;
  unrebuildable: number;
}

export interface GameSummary {
  gameId:              string;
  date:                string;    // ISO date from game headers (e.g. "2025-03-29")
  analyzedAt:          string;    // ISO timestamp when summary was written
  source:              'lichess' | 'chesscom' | 'pgn';
  timeClass:           string;    // bullet / blitz / rapid / classical
  playerColor:         'white' | 'black';
  opponentRating:      number;
  playerRating:        number;
  result:              string;    // '1-0', '0-1', '1/2-1/2'
  accuracy:            number;    // 0–100
  blunderCount:        number;
  mistakeCount:        number;
  inaccuracyCount:     number;
  goodMoveCount:       number;
  totalMoves:          number;    // player's moves only
  missedMomentCount:   number;
  worstLoss:           number;    // magnitude of worst single-move win-chance loss
  worstLossPly:        number;    // ply of the worst-loss move
  opening:             string;    // human-readable opening name for UI grouping
  eco:                 string;    // internal ECO code metadata (e.g. "B12")
  hadWinningPosition:  boolean;   // strict Lichess pre-move win-chance > 66.6% and material > +1
  converted:           boolean;   // had winning position AND won
  hadLosingPosition:   boolean;   // strict Lichess pre-move win-chance < 33.3% and material < -1
  survived:            boolean;   // had losing position AND drew or won
  retroCandidateCount: number;    // learnable mistake positions found
  hasClockData:        boolean;   // at least one usable remaining-clock sample exists
  avgTimePerMove?:     number;    // average seconds across accepted explicit/derived move-time samples
  timeTroubleMoves?:   number;    // moves made with < 30 s remaining, if clock data present
  analysisDepth:       number;    // Stockfish depth used for batch analysis
  extractionVersion?:  number;    // optional for backward compatibility with legacy summaries
  clockSampleCount?:   number;    // user moves with a usable remaining-clock sample
  // Missed-moment type breakdown (optional for backward compat with older records)
  swingCount?:         number;    // win-chance swing moments
  missedMateCount?:    number;    // missed forced mates
  collapseCount?:      number;    // near-win collapses
}

export function isCurrentGameSummaryExtraction(summary: GameSummary): boolean {
  return summary.extractionVersion === CURRENT_GAME_SUMMARY_EXTRACTION_VERSION;
}
