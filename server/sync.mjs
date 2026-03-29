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

import { requireAuth } from './auth.mjs';
import {
  getAllGames, upsertGames,
  getAllAnalysis, upsertAnalysisBatch,
  getAllPuzzleDefinitions, upsertPuzzleDefinitions,
  getAllPuzzleAttempts, insertPuzzleAttempts,
  getAllPuzzleUserMeta, upsertPuzzleUserMetaBatch,
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

/**
 * Route sync API requests. Returns true if handled, false otherwise.
 */
export function handleSyncRoute(url, method, req, res) {
  // --- Games ---
  if (url === '/api/sync/games' && method === 'GET') {
    if (!requireAuth(req, res)) return true;
    getAllGames()
      .then(games => json(res, 200, { games }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (url === '/api/sync/games' && method === 'POST') {
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
  if (url === '/api/sync/analysis' && method === 'GET') {
    if (!requireAuth(req, res)) return true;
    getAllAnalysis()
      .then(analysis => json(res, 200, { analysis }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (url === '/api/sync/analysis' && method === 'POST') {
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
  if (url === '/api/sync/puzzles' && method === 'GET') {
    if (!requireAuth(req, res)) return true;
    Promise.all([getAllPuzzleDefinitions(), getAllPuzzleAttempts(), getAllPuzzleUserMeta()])
      .then(([definitions, attempts, meta]) => json(res, 200, { definitions, attempts, meta }))
      .catch(err => json(res, 500, { error: err.message }));
    return true;
  }
  if (url === '/api/sync/puzzles' && method === 'POST') {
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

  return false;
}
