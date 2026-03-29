/**
 * Server-side MySQL database module for Patzer Pro.
 * Uses mysql2 for async connection to a MySQL database (e.g. Bluehost cPanel MySQL).
 *
 * Schema mirrors the client-side IDB stores so push/pull sync
 * can round-trip data without transformation.
 *
 * Includes a sequential migration runner — all schema changes go
 * through numbered migrations so the database evolves automatically
 * on server restart.
 *
 * Configuration via environment variables:
 *   DB_HOST     (default: localhost)
 *   DB_PORT     (default: 3306)
 *   DB_USER     (required)
 *   DB_PASSWORD  (required)
 *   DB_NAME     (default: patzer_pro)
 */

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'patzer_pro',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

if (!process.env.DB_USER) {
  console.warn('[db] WARNING: DB_USER not set. Database operations will fail.');
  console.warn('[db] Set: DB_USER=xxx DB_PASSWORD=xxx DB_NAME=patzer_pro node server.mjs');
}

export default pool;

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

/**
 * Ordered array of migrations. Each entry is a SQL string or array of SQL strings.
 * Migration index 0 = version 1, index 1 = version 2, etc.
 */
const MIGRATIONS = [
  // --- Migration 1: initial schema ---
  [
    // Schema version tracking
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INT NOT NULL
    )`,

    // Users — single admin row for now
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      token_hash VARCHAR(255),
      role VARCHAR(50) NOT NULL DEFAULT 'admin',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Imported games — metadata + PGN
    `CREATE TABLE IF NOT EXISTS games (
      id VARCHAR(255) PRIMARY KEY,
      platform VARCHAR(50),
      username VARCHAR(255),
      white VARCHAR(255),
      black VARCHAR(255),
      white_elo INT,
      black_elo INT,
      result VARCHAR(20),
      time_control VARCHAR(50),
      date VARCHAR(50),
      pgn LONGTEXT,
      data_json LONGTEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Analysis / review results — keyed by game ID
    `CREATE TABLE IF NOT EXISTS analysis_results (
      game_id VARCHAR(255) PRIMARY KEY,
      summary_json LONGTEXT,
      eval_cache_json LONGTEXT,
      missed_moments_json LONGTEXT,
      review_depth INT,
      reviewed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Puzzle definitions — mirrors PuzzleDefinition from types.ts
    `CREATE TABLE IF NOT EXISTS puzzle_definitions (
      id VARCHAR(255) PRIMARY KEY,
      source_kind VARCHAR(50) NOT NULL,
      start_fen VARCHAR(255) NOT NULL,
      trigger_move VARCHAR(10),
      solution_line_json TEXT NOT NULL,
      strict_solution_move VARCHAR(10),
      rating INT,
      rating_deviation INT,
      popularity INT,
      plays INT,
      themes TEXT,
      opening_tags TEXT,
      lichess_puzzle_id VARCHAR(50),
      game_url VARCHAR(512),
      source_game_id VARCHAR(255),
      source_path VARCHAR(255),
      source_reason VARCHAR(100),
      title VARCHAR(255),
      notes TEXT,
      tags_json TEXT,
      source_pgn LONGTEXT,
      data_json LONGTEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Puzzle attempts — append-only history
    `CREATE TABLE IF NOT EXISTS puzzle_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      puzzle_id VARCHAR(255) NOT NULL,
      started_at BIGINT NOT NULL,
      completed_at BIGINT NOT NULL,
      result VARCHAR(50) NOT NULL,
      failure_reasons_json TEXT,
      first_wrong_ply INT,
      used_hint TINYINT NOT NULL DEFAULT 0,
      used_engine_reveal TINYINT NOT NULL DEFAULT 0,
      revealed_solution TINYINT NOT NULL DEFAULT 0,
      opened_notes TINYINT NOT NULL DEFAULT 0,
      skipped TINYINT NOT NULL DEFAULT 0,
      session_mode VARCHAR(20),
      data_json LONGTEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    // Puzzle user metadata — one row per puzzle
    `CREATE TABLE IF NOT EXISTS puzzle_user_meta (
      puzzle_id VARCHAR(255) PRIMARY KEY,
      folders_json TEXT,
      notes TEXT,
      tags_json TEXT,
      favorite TINYINT NOT NULL DEFAULT 0,
      due_at BIGINT,
      last_attempt_result VARCHAR(50),
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Indexes
    `CREATE INDEX idx_puzzle_defs_source ON puzzle_definitions(source_kind)`,
    `CREATE INDEX idx_puzzle_defs_rating ON puzzle_definitions(rating)`,
    `CREATE INDEX idx_puzzle_defs_lichess_id ON puzzle_definitions(lichess_puzzle_id)`,
    `CREATE INDEX idx_puzzle_attempts_puzzle ON puzzle_attempts(puzzle_id)`,
    `CREATE INDEX idx_puzzle_attempts_completed ON puzzle_attempts(completed_at)`,
    `CREATE INDEX idx_games_platform ON games(platform, username)`,
  ],

  // Future migrations go here as new array entries.
];

export async function runMigrations() {
  const conn = await pool.getConnection();
  try {
    // Ensure schema_version table exists
    await conn.execute(`CREATE TABLE IF NOT EXISTS schema_version (version INT NOT NULL)`);

    const [rows] = await conn.execute('SELECT version FROM schema_version LIMIT 1');
    let currentVersion = Array.isArray(rows) && rows.length > 0 ? rows[0].version : 0;

    if (currentVersion >= MIGRATIONS.length) {
      conn.release();
      return;
    }

    for (let i = currentVersion; i < MIGRATIONS.length; i++) {
      const migration = MIGRATIONS[i];
      const statements = Array.isArray(migration) ? migration : [migration];

      await conn.beginTransaction();
      try {
        for (const sql of statements) {
          await conn.execute(sql);
        }
        if (currentVersion === 0 && i === 0) {
          await conn.execute('INSERT INTO schema_version (version) VALUES (?)', [i + 1]);
        } else {
          await conn.execute('UPDATE schema_version SET version = ?', [i + 1]);
        }
        await conn.commit();
        currentVersion = i + 1;
        console.log(`[db] Migration ${i + 1} applied`);
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }

    console.log(`[db] Schema at version ${currentVersion}`);
  } finally {
    conn.release();
  }
}

export async function getSchemaVersion() {
  const [rows] = await pool.execute('SELECT version FROM schema_version LIMIT 1');
  return Array.isArray(rows) && rows.length > 0 ? rows[0].version : 0;
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

// --- Games ---

export async function getAllGames() {
  const [rows] = await pool.execute('SELECT * FROM games ORDER BY date DESC');
  return rows;
}

export async function upsertGame(game) {
  await pool.execute(`
    INSERT INTO games (id, platform, username, white, black, white_elo, black_elo, result, time_control, date, pgn, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      platform=VALUES(platform), username=VALUES(username), white=VALUES(white), black=VALUES(black),
      white_elo=VALUES(white_elo), black_elo=VALUES(black_elo), result=VALUES(result),
      time_control=VALUES(time_control), date=VALUES(date), pgn=VALUES(pgn), data_json=VALUES(data_json)
  `, [game.id, game.platform, game.username, game.white, game.black, game.whiteElo, game.blackElo,
      game.result, game.timeControl, game.date, game.pgn, game.dataJson]);
}

export async function upsertGames(games) {
  for (const g of games) await upsertGame(g);
}

// --- Analysis results ---

export async function getAllAnalysis() {
  const [rows] = await pool.execute('SELECT * FROM analysis_results ORDER BY reviewed_at DESC');
  return rows;
}

export async function upsertAnalysis(result) {
  await pool.execute(`
    INSERT INTO analysis_results (game_id, summary_json, eval_cache_json, missed_moments_json, review_depth, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      summary_json=VALUES(summary_json), eval_cache_json=VALUES(eval_cache_json),
      missed_moments_json=VALUES(missed_moments_json), review_depth=VALUES(review_depth),
      reviewed_at=VALUES(reviewed_at)
  `, [result.gameId, result.summaryJson, result.evalCacheJson, result.missedMomentsJson,
      result.reviewDepth, result.reviewedAt]);
}

export async function upsertAnalysisBatch(results) {
  for (const r of results) await upsertAnalysis(r);
}

// --- Puzzle definitions ---

export async function getAllPuzzleDefinitions() {
  const [rows] = await pool.execute('SELECT * FROM puzzle_definitions ORDER BY created_at DESC');
  return rows;
}

export async function upsertPuzzleDefinition(def) {
  await pool.execute(`
    INSERT INTO puzzle_definitions (id, source_kind, start_fen, trigger_move, solution_line_json, strict_solution_move,
      rating, rating_deviation, popularity, plays, themes, opening_tags, lichess_puzzle_id, game_url,
      source_game_id, source_path, source_reason, title, notes, tags_json, source_pgn, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      source_kind=VALUES(source_kind), start_fen=VALUES(start_fen), trigger_move=VALUES(trigger_move),
      solution_line_json=VALUES(solution_line_json), strict_solution_move=VALUES(strict_solution_move),
      rating=VALUES(rating), rating_deviation=VALUES(rating_deviation), popularity=VALUES(popularity),
      plays=VALUES(plays), themes=VALUES(themes), opening_tags=VALUES(opening_tags),
      lichess_puzzle_id=VALUES(lichess_puzzle_id), game_url=VALUES(game_url),
      source_game_id=VALUES(source_game_id), source_path=VALUES(source_path),
      source_reason=VALUES(source_reason), title=VALUES(title), notes=VALUES(notes),
      tags_json=VALUES(tags_json), source_pgn=VALUES(source_pgn), data_json=VALUES(data_json)
  `, [def.id, def.sourceKind, def.startFen, def.triggerMove, def.solutionLineJson, def.strictSolutionMove,
      def.rating, def.ratingDeviation, def.popularity, def.plays, def.themes, def.openingTags,
      def.lichessPuzzleId, def.gameUrl, def.sourceGameId, def.sourcePath, def.sourceReason,
      def.title, def.notes, def.tagsJson, def.sourcePgn, def.dataJson]);
}

export async function upsertPuzzleDefinitions(defs) {
  for (const d of defs) await upsertPuzzleDefinition(d);
}

// --- Puzzle attempts ---

export async function getAllPuzzleAttempts() {
  const [rows] = await pool.execute('SELECT * FROM puzzle_attempts ORDER BY completed_at DESC');
  return rows;
}

export async function insertPuzzleAttempt(attempt) {
  await pool.execute(`
    INSERT INTO puzzle_attempts (puzzle_id, started_at, completed_at, result, failure_reasons_json,
      first_wrong_ply, used_hint, used_engine_reveal, revealed_solution, opened_notes, skipped, session_mode, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [attempt.puzzleId, attempt.startedAt, attempt.completedAt, attempt.result, attempt.failureReasonsJson,
      attempt.firstWrongPly, attempt.usedHint, attempt.usedEngineReveal, attempt.revealedSolution,
      attempt.openedNotes, attempt.skipped, attempt.sessionMode, attempt.dataJson]);
}

export async function insertPuzzleAttempts(attempts) {
  for (const a of attempts) await insertPuzzleAttempt(a);
}

// --- Puzzle user meta ---

export async function getAllPuzzleUserMeta() {
  const [rows] = await pool.execute('SELECT * FROM puzzle_user_meta ORDER BY updated_at DESC');
  return rows;
}

export async function upsertPuzzleUserMeta(meta) {
  await pool.execute(`
    INSERT INTO puzzle_user_meta (puzzle_id, folders_json, notes, tags_json, favorite, due_at, last_attempt_result)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      folders_json=VALUES(folders_json), notes=VALUES(notes), tags_json=VALUES(tags_json),
      favorite=VALUES(favorite), due_at=VALUES(due_at), last_attempt_result=VALUES(last_attempt_result)
  `, [meta.puzzleId, meta.foldersJson, meta.notes, meta.tagsJson, meta.favorite, meta.dueAt, meta.lastAttemptResult]);
}

export async function upsertPuzzleUserMetaBatch(metas) {
  for (const m of metas) await upsertPuzzleUserMeta(m);
}
