/**
 * Server-side persistence layer — SQLite via better-sqlite3.
 *
 * Single-file database stored at ./data/patzer.db (auto-created).
 * All operations are synchronous (better-sqlite3 is sync), wrapped
 * in exported async functions to keep the API unchanged for callers.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR  = join(__dirname, 'data');
const DB_PATH = join(DB_DIR, 'patzer.db');

mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id          TEXT PRIMARY KEY,
    pgn         TEXT NOT NULL,
    metadata    TEXT,
    importedAt  TEXT,
    source      TEXT
  );

  CREATE TABLE IF NOT EXISTS analysis (
    gameId   TEXT PRIMARY KEY,
    version  INTEGER DEFAULT 1,
    nodes    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS puzzle_definitions (
    id          TEXT PRIMARY KEY,
    data        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS puzzle_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    puzzleId    TEXT NOT NULL,
    data        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS puzzle_user_meta (
    puzzleId    TEXT PRIMARY KEY,
    data        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS puzzle_user_perf (
    id          TEXT PRIMARY KEY DEFAULT 'singleton',
    data        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS puzzle_rating_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    data        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS puzzle_user_perf_by_user (
    username    TEXT PRIMARY KEY,
    data        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS puzzle_rating_history_by_user (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    data        TEXT NOT NULL,
    UNIQUE(username, ts)
  );

  CREATE TABLE IF NOT EXISTS puzzle_rated_attempts_by_user (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL,
    puzzleId    TEXT NOT NULL,
    completedAt INTEGER NOT NULL,
    data        TEXT NOT NULL,
    UNIQUE(username, puzzleId, completedAt)
  );
`);

// ── Migrations ─────────────────────────────────────────────────────────────

function addColumnIfMissing(table, column, type) {
  const cols = db.pragma(`table_info(${table})`);
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Run all pending schema migrations. Called by server.mjs at startup. */
export async function runMigrations() {
  // Add updated_at columns for differential sync.
  addColumnIfMissing('games',             'updated_at', 'INTEGER');
  addColumnIfMissing('analysis',          'updated_at', 'INTEGER');
  addColumnIfMissing('puzzle_definitions','updated_at', 'INTEGER');
  addColumnIfMissing('puzzle_attempts',   'updated_at', 'INTEGER');
  addColumnIfMissing('puzzle_user_meta',  'updated_at', 'INTEGER');

  // Create indexes for differential sync queries.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_games_updated_at             ON games(updated_at);
    CREATE INDEX IF NOT EXISTS idx_analysis_updated_at          ON analysis(updated_at);
    CREATE INDEX IF NOT EXISTS idx_puzzle_definitions_updated_at ON puzzle_definitions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_updated_at   ON puzzle_attempts(updated_at);
    CREATE INDEX IF NOT EXISTS idx_puzzle_user_meta_updated_at  ON puzzle_user_meta(updated_at);
    CREATE INDEX IF NOT EXISTS idx_puzzle_rating_history_by_user_username_ts
      ON puzzle_rating_history_by_user(username, ts);
    CREATE INDEX IF NOT EXISTS idx_puzzle_rated_attempts_by_user_username_completed_at
      ON puzzle_rated_attempts_by_user(username, completedAt);
  `);
}

// ── Prepared statements ─────────────────────────────────────────────────────

const stmts = {
  // Games
  getAllGames:    db.prepare('SELECT * FROM games'),
  upsertGame:    db.prepare(`INSERT INTO games (id, pgn, metadata, importedAt, source)
                             VALUES (@id, @pgn, @metadata, @importedAt, @source)
                             ON CONFLICT(id) DO UPDATE SET pgn=@pgn, metadata=@metadata, importedAt=@importedAt, source=@source`),

  // Analysis
  getAllAnalysis: db.prepare('SELECT * FROM analysis'),
  upsertAnalysis: db.prepare(`INSERT INTO analysis (gameId, version, nodes)
                              VALUES (@gameId, @version, @nodes)
                              ON CONFLICT(gameId) DO UPDATE SET version=@version, nodes=@nodes`),

  // Puzzle definitions
  getAllDefs:     db.prepare('SELECT * FROM puzzle_definitions'),
  upsertDef:     db.prepare(`INSERT INTO puzzle_definitions (id, data) VALUES (@id, @data)
                             ON CONFLICT(id) DO UPDATE SET data=@data`),

  // Puzzle attempts
  getAllAttempts: db.prepare('SELECT * FROM puzzle_attempts'),
  insertAttempt: db.prepare('INSERT INTO puzzle_attempts (puzzleId, data) VALUES (@puzzleId, @data)'),

  // Puzzle user meta
  getAllMeta:     db.prepare('SELECT * FROM puzzle_user_meta'),
  upsertMeta:    db.prepare(`INSERT INTO puzzle_user_meta (puzzleId, data) VALUES (@puzzleId, @data)
                             ON CONFLICT(puzzleId) DO UPDATE SET data=@data`),

  // Puzzle user perf (singleton)
  getPerf:       db.prepare("SELECT data FROM puzzle_user_perf WHERE id = 'singleton'"),
  upsertPerf:    db.prepare(`INSERT INTO puzzle_user_perf (id, data) VALUES ('singleton', @data)
                             ON CONFLICT(id) DO UPDATE SET data=@data`),
  getPerfByUser: db.prepare('SELECT data FROM puzzle_user_perf_by_user WHERE username = @username'),
  upsertPerfByUser: db.prepare(`INSERT INTO puzzle_user_perf_by_user (username, data) VALUES (@username, @data)
                                ON CONFLICT(username) DO UPDATE SET data=@data`),

  // Puzzle rating history
  getAllHistory:  db.prepare('SELECT * FROM puzzle_rating_history ORDER BY ts ASC'),
  insertHistory: db.prepare('INSERT INTO puzzle_rating_history (ts, data) VALUES (@ts, @data)'),
  getAllHistoryByUser: db.prepare(
    'SELECT * FROM puzzle_rating_history_by_user WHERE username = @username ORDER BY ts ASC',
  ),

  // User-scoped rated attempts
  getAllRatedAttemptsByUser: db.prepare(
    'SELECT * FROM puzzle_rated_attempts_by_user WHERE username = @username ORDER BY completedAt ASC',
  ),
};

// ── Games ───────────────────────────────────────────────────────────────────

export async function getAllGames() {
  return stmts.getAllGames.all().map(row => ({
    id: row.id,
    pgn: row.pgn,
    ...(row.metadata ? JSON.parse(row.metadata) : {}),
    importedAt: row.importedAt,
    source: row.source,
  }));
}

const BATCH_SIZE = 500;

export async function upsertGames(games) {
  const tx = db.transaction((items) => {
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const chunk = items.slice(offset, offset + BATCH_SIZE);
      const now = Date.now();
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const sql = `INSERT INTO games (id, pgn, metadata, importedAt, source, updated_at)
                   VALUES ${placeholders}
                   ON CONFLICT(id) DO UPDATE SET pgn=excluded.pgn, metadata=excluded.metadata, importedAt=excluded.importedAt, source=excluded.source, updated_at=excluded.updated_at`;
      const params = [];
      for (const g of chunk) {
        const { id, pgn, importedAt, source, ...rest } = g;
        params.push(
          id,
          pgn,
          JSON.stringify(rest),
          importedAt || new Date().toISOString(),
          source || 'unknown',
          now,
        );
      }
      db.prepare(sql).run(...params);
    }
  });
  tx(games);
  return { upserted: games.length };
}

export async function getGamesSince(since) {
  return db.prepare('SELECT * FROM games WHERE updated_at > ?').all(since).map(row => ({
    id: row.id,
    pgn: row.pgn,
    ...(row.metadata ? JSON.parse(row.metadata) : {}),
    importedAt: row.importedAt,
    source: row.source,
  }));
}

// ── Analysis ────────────────────────────────────────────────────────────────

export async function getAllAnalysis() {
  return stmts.getAllAnalysis.all().map(row => ({
    gameId: row.gameId,
    version: row.version,
    nodes: JSON.parse(row.nodes),
  }));
}

export async function upsertAnalysisBatch(items) {
  const tx = db.transaction((batch) => {
    for (let offset = 0; offset < batch.length; offset += BATCH_SIZE) {
      const chunk = batch.slice(offset, offset + BATCH_SIZE);
      const now = Date.now();
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const sql = `INSERT INTO analysis (gameId, version, nodes, updated_at)
                   VALUES ${placeholders}
                   ON CONFLICT(gameId) DO UPDATE SET version=excluded.version, nodes=excluded.nodes, updated_at=excluded.updated_at`;
      const params = [];
      for (const a of chunk) {
        params.push(a.gameId, a.version || 1, JSON.stringify(a.nodes), now);
      }
      db.prepare(sql).run(...params);
    }
  });
  tx(items);
  return { upserted: items.length };
}

export async function getAnalysisSince(since) {
  return db.prepare('SELECT * FROM analysis WHERE updated_at > ?').all(since).map(row => ({
    gameId: row.gameId,
    version: row.version,
    nodes: JSON.parse(row.nodes),
  }));
}

// ── Puzzle definitions ──────────────────────────────────────────────────────

export async function getAllPuzzleDefinitions() {
  return stmts.getAllDefs.all().map(row => JSON.parse(row.data));
}

export async function upsertPuzzleDefinitions(defs) {
  const tx = db.transaction((items) => {
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const chunk = items.slice(offset, offset + BATCH_SIZE);
      const now = Date.now();
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
      const sql = `INSERT INTO puzzle_definitions (id, data, updated_at)
                   VALUES ${placeholders}
                   ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`;
      const params = [];
      for (const d of chunk) {
        params.push(d.id, JSON.stringify(d), now);
      }
      db.prepare(sql).run(...params);
    }
  });
  tx(defs);
  return { upserted: defs.length };
}

export async function getPuzzleDefinitionsSince(since) {
  return db.prepare('SELECT * FROM puzzle_definitions WHERE updated_at > ?').all(since).map(row => JSON.parse(row.data));
}

// ── Puzzle attempts ─────────────────────────────────────────────────────────

export async function getAllPuzzleAttempts() {
  return stmts.getAllAttempts.all().map(row => JSON.parse(row.data));
}

export async function insertPuzzleAttempts(attempts) {
  const tx = db.transaction((items) => {
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const chunk = items.slice(offset, offset + BATCH_SIZE);
      const now = Date.now();
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
      const sql = `INSERT INTO puzzle_attempts (puzzleId, data, updated_at) VALUES ${placeholders}`;
      const params = [];
      for (const a of chunk) {
        params.push(a.puzzleId, JSON.stringify(a), now);
      }
      db.prepare(sql).run(...params);
    }
  });
  tx(attempts);
  return { inserted: attempts.length };
}

export async function getPuzzleAttemptsSince(since) {
  return db.prepare('SELECT * FROM puzzle_attempts WHERE updated_at > ?').all(since).map(row => JSON.parse(row.data));
}

// ── Puzzle user meta ────────────────────────────────────────────────────────

export async function getAllPuzzleUserMeta() {
  return stmts.getAllMeta.all().map(row => JSON.parse(row.data));
}

export async function upsertPuzzleUserMetaBatch(items) {
  const tx = db.transaction((batch) => {
    for (let offset = 0; offset < batch.length; offset += BATCH_SIZE) {
      const chunk = batch.slice(offset, offset + BATCH_SIZE);
      const now = Date.now();
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
      const sql = `INSERT INTO puzzle_user_meta (puzzleId, data, updated_at)
                   VALUES ${placeholders}
                   ON CONFLICT(puzzleId) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`;
      const params = [];
      for (const m of chunk) {
        params.push(m.puzzleId, JSON.stringify(m), now);
      }
      db.prepare(sql).run(...params);
    }
  });
  tx(items);
  return { upserted: items.length };
}

export async function getPuzzleUserMetaSince(since) {
  return db.prepare('SELECT * FROM puzzle_user_meta WHERE updated_at > ?').all(since).map(row => JSON.parse(row.data));
}

// ── Puzzle user perf (singleton + user-scoped v2) ──────────────────────────

export async function getUserPuzzlePerf(username) {
  const row = username ? stmts.getPerfByUser.get({ username }) : null;
  if (row) return JSON.parse(row.data);
  const legacy = stmts.getPerf.get();
  return legacy ? JSON.parse(legacy.data) : null;
}

export async function upsertUserPuzzlePerf(perf) {
  if (!perf?.username) throw new Error('username required for user-scoped puzzle perf');
  stmts.upsertPerfByUser.run({ username: perf.username, data: JSON.stringify(perf) });
  return { ok: true };
}

// ── Puzzle rating history ───────────────────────────────────────────────────

export async function getUserPuzzleRatingHistory(username) {
  const rows = username ? stmts.getAllHistoryByUser.all({ username }) : [];
  if (rows.length > 0) return rows.map(row => JSON.parse(row.data));
  return stmts.getAllHistory.all().map(row => JSON.parse(row.data));
}

export async function insertUserPuzzleRatingHistoryBatch(entries) {
  const tx = db.transaction((items) => {
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const chunk = items.slice(offset, offset + BATCH_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
      const sql = `INSERT OR IGNORE INTO puzzle_rating_history_by_user (username, ts, data) VALUES ${placeholders}`;
      const params = [];
      for (const e of chunk) {
        params.push(
          e.username,
          e.timestampMs ?? e.timestamp_ms ?? e.timestamp ?? Date.now(),
          JSON.stringify(e),
        );
      }
      db.prepare(sql).run(...params);
    }
  });
  tx(entries);
  return { inserted: entries.length };
}

// ── User-scoped rated attempts ──────────────────────────────────────────────

export async function getUserPuzzleRatedAttempts(username) {
  return stmts.getAllRatedAttemptsByUser.all({ username }).map(row => JSON.parse(row.data));
}

export async function insertUserPuzzleRatedAttemptsBatch(entries) {
  const tx = db.transaction((items) => {
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      const chunk = items.slice(offset, offset + BATCH_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const sql = `INSERT OR IGNORE INTO puzzle_rated_attempts_by_user (username, puzzleId, completedAt, data) VALUES ${placeholders}`;
      const params = [];
      for (const e of chunk) {
        params.push(e.username, e.puzzleId, e.completedAt, JSON.stringify(e));
      }
      db.prepare(sql).run(...params);
    }
  });
  tx(entries);
  return { inserted: entries.length };
}
