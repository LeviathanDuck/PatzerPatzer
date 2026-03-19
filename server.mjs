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

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC    = path.join(__dirname, 'public');
const PORT      = parseInt(process.argv[2] ?? '3001', 10);

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

http.createServer((req, res) => {
  // SharedArrayBuffer requires both of these (COOP + COEP).
  // Mirrors the headers Lichess production servers set on every response.
  res.setHeader('Cross-Origin-Opener-Policy',   'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  const url      = (req.url ?? '/').split('?')[0];
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

}).listen(PORT, () => {
  console.log(`\nPatzerPro dev server → http://localhost:${PORT}`);
  console.log('COOP + COEP headers active — SharedArrayBuffer available');
  console.log('Multi-threaded Stockfish will be used automatically.\n');
});
