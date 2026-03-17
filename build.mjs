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

// Copy Stockfish engine files to public/stockfish/
// stockfish@16 provides single-threaded NNUE build under src/stockfish-nnue-16-single.*
fs.mkdirSync('public/stockfish', { recursive: true });
const sfAssets = [
  ['node_modules/stockfish/src/stockfish-nnue-16-single.js',   'public/stockfish/stockfish-nnue-16-single.js'],
  ['node_modules/stockfish/src/stockfish-nnue-16-single.wasm', 'public/stockfish/stockfish-nnue-16-single.wasm'],
  ['node_modules/stockfish/src/nn-5af11540bbfe.nnue',          'public/stockfish/nn-5af11540bbfe.nnue'],
];
for (const [src, dst] of sfAssets) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(' ', dst);
  } else {
    console.warn('  WARNING: missing', src);
  }
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
