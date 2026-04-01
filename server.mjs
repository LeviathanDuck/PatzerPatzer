/**
 * Dev server for PatzerPro.
 *
 * Sets Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers,
 * which are required to unlock SharedArrayBuffer in the browser.
 * Without these headers, multi-threaded Stockfish WASM cannot run because
 * Emscripten pthreads rely on SharedArrayBuffer for shared memory.
 *
 * Usage:  node server.mjs        (serves on http://localhost:3000)
 *         node server.mjs 8080   (custom port)
 *
 * After starting, open http://localhost:3000 in your browser.
 * File://  URLs do NOT get these headers — you must use this server.
 */

import http  from 'http';
import https from 'https';
import fs    from 'fs';
import path  from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { handleAuthStatus, handleLogout } from './server/auth.mjs';
import { handleSyncRoute } from './server/sync.mjs';
import {
  startOAuth, handleCallback,
  getLichessToken, getLichessStatus, disconnectLichess,
} from './server/lichess-oauth.mjs';
import { runMigrations } from './server/db.mjs';
import { buildSprintDashboardData } from './scripts/sprint-registry-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC    = path.join(__dirname, 'public');
const DOCS      = path.join(__dirname, 'docs');
const PORT      = parseInt(process.argv[2] ?? '3001', 10);
const DASHBOARD_PATH = path.join(DOCS, 'prompts', 'dashboard.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.wasm': 'application/wasm',
  '.nnue': 'application/octet-stream',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.map':  'application/json',
};

const server = http.createServer((req, res) => {
  // SharedArrayBuffer requires both of these (COOP + COEP).
  // Mirrors the headers Lichess production servers set on every response.
  res.setHeader('Cross-Origin-Opener-Policy',   'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  const url      = (req.url ?? '/').split('?')[0];
  const method   = req.method ?? 'GET';

  // --- Lichess OAuth endpoints ---
  if (url === '/api/lichess/connect') return startOAuth(req, res);
  if (url === '/oauth/callback')      return handleCallback(req, res);
  if (url === '/api/lichess/status' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getLichessStatus()));
    return;
  }
  if (url === '/api/lichess/disconnect' && method === 'POST') {
    disconnectLichess();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ connected: false }));
    return;
  }

  // --- Opening explorer proxy ---
  // Forwards /api/explorer/:db?... to https://explorer.lichess.ovh/:db?...
  // Uses the Lichess OAuth token from the OAuth flow (falls back to LICHESS_TOKEN env var).
  if (url.startsWith('/api/explorer/')) {
    const db    = url.slice('/api/explorer/'.length);
    const qs    = (req.url ?? '').includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const token = getLichessToken() || process.env.LICHESS_TOKEN || '';
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not connected to Lichess' }));
      return;
    }
    const target = `https://explorer.lichess.ovh/${db}${qs}`;
    https.get(target, {
      headers: { 'User-Agent': 'PatzerPro/1.0', 'Authorization': `Bearer ${token}` },
    }, upstream => {
      res.setHeader('Content-Type', upstream.headers['content-type'] ?? 'application/x-ndjson');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(upstream.statusCode ?? 502);
      upstream.pipe(res);
    }).on('error', err => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Explorer proxy error: ${err.message}`);
    });
    return;
  }

  // --- Auth endpoints ---
  if (url === '/api/auth/status' && method === 'GET') {
    return handleAuthStatus(req, res);
  }
  if (url === '/api/auth/logout' && method === 'POST') {
    return handleLogout(req, res);
  }

  // --- Sync endpoints (require auth) ---
  if (url.startsWith('/api/sync/') && handleSyncRoute(url, method, req, res)) return;

  // Prompt dashboard: regenerate from registry and redirect back.
  if (url === '/api/refresh-dashboard') {
    try {
      execSync('npm run dashboard:generate', { cwd: __dirname, timeout: 15000 });
      res.writeHead(302, { Location: '/dashboard' });
      res.end();
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Dashboard generation failed: ' + (e.message ?? e));
    }
    return;
  }

  // Serve the prompt dashboard at /dashboard
  if (url === '/dashboard') {
    if (fs.existsSync(DASHBOARD_PATH)) {
      res.setHeader('Content-Type', MIME['.html']);
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      fs.createReadStream(DASHBOARD_PATH).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Dashboard not generated yet. Run: npm run dashboard:generate');
    }
    return;
  }

  // Serve prompt registry JSON for live dashboard reads
  if (url === '/api/prompt-registry') {
    const regPath = path.join(__dirname, 'docs', 'prompts', 'prompt-registry.json');
    if (fs.existsSync(regPath)) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      fs.createReadStream(regPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('{}');
    }
    return;
  }

  if (url === '/api/sprint-registry') {
    try {
      const data = buildSprintDashboardData(__dirname);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      res.end(JSON.stringify({ sprints: data.sprints }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  // Serve prompt item files for live dashboard reads
  if (url.startsWith('/api/prompt-item/')) {
    const id = url.slice('/api/prompt-item/'.length);
    const itemPath = path.join(__dirname, 'docs', 'prompts', 'items', `${id}.md`);
    if (fs.existsSync(itemPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      fs.createReadStream(itemPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('');
    }
    return;
  }

  const filePath = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));

  // Prevent path traversal outside public/
  if (!filePath.startsWith(PUBLIC + path.sep) && filePath !== PUBLIC) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback — serve index.html for unknown paths so that
    // a hard refresh on any hash route still loads the app.
    const index = path.join(PUBLIC, 'index.html');
    res.setHeader('Content-Type', MIME['.html']);
    res.writeHead(200);
    fs.createReadStream(index).pipe(res);
    return;
  }

  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.writeHead(200);
  fs.createReadStream(filePath).pipe(res);

});

// Run database migrations then start listening
runMigrations()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\nPatzerPro dev server → http://localhost:${PORT}`);
      console.log('COOP + COEP headers active — SharedArrayBuffer available');
      console.log('Multi-threaded Stockfish will be used automatically.\n');
    });
  })
  .catch(err => {
    console.warn('[db] Migration failed (server starting without database):', err.message);
    server.listen(PORT, () => {
      console.log(`\nPatzerPro dev server → http://localhost:${PORT} (no database)`);
    });
  });
