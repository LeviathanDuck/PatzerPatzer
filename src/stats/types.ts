// Per-game summary type for the improvement intelligence platform.
// Persisted to the 'game-summaries' IDB store after batch analysis completes.
// Drives the stats dashboard, weakness engine, and training recommendations.

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
  opening:             string;    // opening name or ECO description
  eco:                 string;    // ECO code (e.g. "B12")
  hadWinningPosition:  boolean;   // win-chance > 0.7 sustained 3+ moves
  converted:           boolean;   // had winning position AND won
  hadLosingPosition:   boolean;   // win-chance < 0.3 sustained 3+ moves
  survived:            boolean;   // had losing position AND drew or won
  retroCandidateCount: number;    // learnable mistake positions found
  hasClockData:        boolean;   // whether %clk data was present
  avgTimePerMove?:     number;    // average seconds per move, if clock data present
  timeTroubleMoves?:   number;    // moves made with < 30 s remaining, if clock data present
  analysisDepth:       number;    // Stockfish depth used for batch analysis
  // Missed-moment type breakdown (optional for backward compat with older records)
  swingCount?:         number;    // win-chance swing moments
  missedMateCount?:    number;    // missed forced mates
  collapseCount?:      number;    // near-win collapses
}
