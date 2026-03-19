import * as esbuild from 'esbuild';
import * as sass from 'sass';
import fs from 'fs';

// Compile TypeScript — main bundle
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'public/js/main.js',
  format: 'esm',
  target: 'es2021',
  sourcemap: true,
  logLevel: 'info',
});

// Compile TypeScript — Stockfish worker entry
// The worker is a classic (non-module) worker so it uses iife format.
// Adapted from lichess-org/lila: ui/lib/src/ceval/engines/simpleEngine.ts
await esbuild.build({
  entryPoints: ['src/ceval/worker.ts'],
  bundle: true,
  outfile: 'public/js/stockfish-worker.js',
  format: 'iife',
  target: 'es2021',
  sourcemap: true,
  logLevel: 'info',
});

// Copy @lichess-org/stockfish-web engine files to public/stockfish-web/.
// sf_18_smallnet is Stockfish 18 with a 15 MB NNUE — the same build Lichess
// uses for analysis. Runs in the main thread via dynamic import(); Emscripten
// handles its own pthreads internally using SharedArrayBuffer.
// Requires COOP+COEP headers — use `pnpm serve` (server.mjs).
// Adapted from lichess-org/lila: ui/lib/src/ceval/engines/engines.ts asset config.
fs.mkdirSync('public/stockfish-web', { recursive: true });
const sfWebAssets = [
  ['node_modules/@lichess-org/stockfish-web/sf_18_smallnet.js',   'public/stockfish-web/sf_18_smallnet.js'],
  ['node_modules/@lichess-org/stockfish-web/sf_18_smallnet.wasm', 'public/stockfish-web/sf_18_smallnet.wasm'],
];
for (const [src, dst] of sfWebAssets) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(' ', dst);
  } else {
    console.warn('  WARNING: missing', src);
  }
}

// Download the NNUE evaluation network if not already present.
// nn-4ca89e4b3abf.nnue is the smallnet weights file for sf_18_smallnet.
// Source: https://tests.stockfishchess.org/nns (official Stockfish NNUE repository)
// ~15 MB download — only happens once; subsequent builds skip it.
const nnueDst = 'public/stockfish-web/nn-4ca89e4b3abf.nnue';
if (!fs.existsSync(nnueDst)) {
  console.log('  Downloading NNUE weights (~15 MB)...');
  const nnueUrl = 'https://tests.stockfishchess.org/api/nn/nn-4ca89e4b3abf.nnue';
  const resp = await fetch(nnueUrl);
  if (resp.ok) {
    const buf = await resp.arrayBuffer();
    fs.writeFileSync(nnueDst, Buffer.from(buf));
    console.log(' ', nnueDst);
  } else {
    console.warn('  WARNING: NNUE download failed', resp.status, nnueUrl);
    console.warn('  Engine will not evaluate without NNUE. Re-run `pnpm build` to retry.');
  }
} else {
  console.log('  public/stockfish-web/nn-4ca89e4b3abf.nnue (cached)');
}

// Compile SCSS + prepend Chessground CSS
const cgCss = [
  'node_modules/@lichess-org/chessground/assets/chessground.base.css',
  'node_modules/@lichess-org/chessground/assets/chessground.brown.css',
  'node_modules/@lichess-org/chessground/assets/chessground.cburnett.css',
].map(f => fs.readFileSync(f, 'utf8')).join('\n');

fs.mkdirSync('public/css', { recursive: true });
const result = sass.compile('src/styles/main.scss');
fs.writeFileSync('public/css/main.css', cgCss + '\n' + result.css);
console.log('  public/css/main.css');
