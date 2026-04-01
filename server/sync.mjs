/**
 * Sync API endpoints for Patzer Pro.
 * All endpoints require admin auth.
 *
 * GET  /api/sync/games    — return all stored games
 * POST /api/sync/games    — upsert a batch of games
 * GET  /api/sync/analysis  — return all analysis results
 * POST /api/sync/analysis  — upsert a batch of analysis results
 * GET  /api/sync/puzzles   — return puzzle definitions + attempts + meta
 * POST /api/sync/puzzles   — upsert puzzle definitions + attempts + meta
 */

import { requireAuth, requireAuthAndGetUsername } from './auth.mjs';
import {
  getAllGames, getGamesSince, upsertGames,
  getAllAnalysis, getAnalysisSince, upsertAnalysisBatch,
  getAllPuzzleDefinitions, getPuzzleDefinitionsSince, upsertPuzzleDefinitions,
  getAllPuzzleAttempts, getPuzzleAttemptsSince, insertPuzzleAttempts,
  getAllPuzzleUserMeta, getPuzzleUserMetaSince, upsertPuzzleUserMetaBatch,
  getUserPuzzlePerf, upsertUserPuzzlePerf,
  getUserPuzzleRatingHistory, insertUserPuzzleRatingHistoryBatch,
} from './db.mjs';

/** Read the full JSON body from a request. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

/** Send a JSON response. */
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** Parse optional `since` query parameter as a numeric epoch-ms timestamp. */
function parseSince(urlStr) {
  try {
    const u = new URL(urlStr, 'http://localhost');
    const s = u.searchParams.get('since');
    if (s === null) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Return the pathname portion of a URL string (strips query params). */
function pathname(urlStr) {
  try { return new URL(urlStr, 'http://localhost').pathname; }
  catch { return urlStr; }
}

/**
 * Route sync API requests. Returns true if handled, false otherwise.
 */
export function handleSyncRoute(url, method, req, res) {
  const path = pathname(url);

  // --- Games ---
  if (path === '/api/sync/games' && method === 'GET') {
    if (!requireAuth(req, res)) return true;
    const since = parseSince(url);
    const fetcher = since !== undefined ? getGamesSince(since) : getAllGames();
    fetcher
      .then(games => json(res, 200, { games }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (path === '/api/sync/games' && method === 'POST') {
    if (!requireAuth(req, res)) return true;
    readBody(req).then(async body => {
      const games = body.games ?? body;
      if (!Array.isArray(games)) return json(res, 400, { error: 'Expected games array' });
      await upsertGames(games);
      json(res, 200, { ok: true, count: games.length });
    }).catch(err => json(res, 400, { error: err.message }));
    return true;
  }

  // --- Analysis ---
  if (path === '/api/sync/analysis' && method === 'GET') {
    if (!requireAuth(req, res)) return true;
    const since = parseSince(url);
    const fetcher = since !== undefined ? getAnalysisSince(since) : getAllAnalysis();
    fetcher
      .then(analysis => json(res, 200, { analysis }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (path === '/api/sync/analysis' && method === 'POST') {
    if (!requireAuth(req, res)) return true;
    readBody(req).then(async body => {
      const results = body.analysis ?? body;
      if (!Array.isArray(results)) return json(res, 400, { error: 'Expected analysis array' });
      await upsertAnalysisBatch(results);
      json(res, 200, { ok: true, count: results.length });
    }).catch(err => json(res, 400, { error: err.message }));
    return true;
  }

  // --- Puzzles (definitions + attempts + meta) ---
  if (path === '/api/sync/puzzles' && method === 'GET') {
    if (!requireAuth(req, res)) return true;
    const since = parseSince(url);
    Promise.all([
      since !== undefined ? getPuzzleDefinitionsSince(since) : getAllPuzzleDefinitions(),
      since !== undefined ? getPuzzleAttemptsSince(since) : getAllPuzzleAttempts(),
      since !== undefined ? getPuzzleUserMetaSince(since) : getAllPuzzleUserMeta(),
    ])
      .then(([definitions, attempts, meta]) => json(res, 200, { definitions, attempts, meta }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (path === '/api/sync/puzzles' && method === 'POST') {
    if (!requireAuth(req, res)) return true;
    readBody(req).then(async body => {
      const counts = { definitions: 0, attempts: 0, meta: 0 };
      if (Array.isArray(body.definitions)) {
        await upsertPuzzleDefinitions(body.definitions);
        counts.definitions = body.definitions.length;
      }
      if (Array.isArray(body.attempts)) {
        await insertPuzzleAttempts(body.attempts);
        counts.attempts = body.attempts.length;
      }
      if (Array.isArray(body.meta)) {
        await upsertPuzzleUserMetaBatch(body.meta);
        counts.meta = body.meta.length;
      }
      json(res, 200, { ok: true, counts });
    }).catch(err => json(res, 400, { error: err.message }));
    return true;
  }

  // --- User puzzle perf (user-scoped) ---
  // GET  /api/sync/puzzle-perf  — return the authenticated user's puzzle perf
  // POST /api/sync/puzzle-perf  — upsert the authenticated user's puzzle perf
  if (path === '/api/sync/puzzle-perf' && method === 'GET') {
    const username = requireAuthAndGetUsername(req, res);
    if (!username) return true;
    getUserPuzzlePerf(username)
      .then(perf => json(res, 200, { perf }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (path === '/api/sync/puzzle-perf' && method === 'POST') {
    const username = requireAuthAndGetUsername(req, res);
    if (!username) return true;
    readBody(req).then(async body => {
      const perf = body.perf ?? body;
      if (!perf || typeof perf !== 'object') return json(res, 400, { error: 'Expected perf object' });
      await upsertUserPuzzlePerf({ ...perf, username });
      json(res, 200, { ok: true });
    }).catch(err => json(res, 400, { error: err.message }));
    return true;
  }

  // GET  /api/sync/puzzle-rating-history  — return the authenticated user's rating history
  // POST /api/sync/puzzle-rating-history  — append rating history entries
  if (path === '/api/sync/puzzle-rating-history' && method === 'GET') {
    const username = requireAuthAndGetUsername(req, res);
    if (!username) return true;
    getUserPuzzleRatingHistory(username)
      .then(history => json(res, 200, { history }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (path === '/api/sync/puzzle-rating-history' && method === 'POST') {
    const username = requireAuthAndGetUsername(req, res);
    if (!username) return true;
    readBody(req).then(async body => {
      const entries = body.history ?? body;
      if (!Array.isArray(entries)) return json(res, 400, { error: 'Expected history array' });
      await insertUserPuzzleRatingHistoryBatch(entries.map(e => ({ ...e, username })));
      json(res, 200, { ok: true, count: entries.length });
    }).catch(err => json(res, 400, { error: err.message }));
    return true;
  }

  return false;
}
