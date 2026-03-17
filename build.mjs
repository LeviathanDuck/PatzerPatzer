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
// stockfish npm package provides browser-compatible JS builds.
fs.mkdirSync('public/stockfish', { recursive: true });
const sfCandidates = [
  'node_modules/stockfish/stockfish.js',
  'node_modules/stockfish/src/stockfish.js',
];
const sfSrc = sfCandidates.find(f => fs.existsSync(f));
if (sfSrc) {
  fs.copyFileSync(sfSrc, 'public/stockfish/stockfish.js');
  console.log('  public/stockfish/stockfish.js');
} else {
  console.warn('  WARNING: stockfish.js not found — run pnpm install');
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
