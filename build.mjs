import * as esbuild from 'esbuild';
import * as sass from 'sass';
import fs from 'fs';

// Compile TypeScript
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'public/js/main.js',
  format: 'esm',
  target: 'es2021',
  sourcemap: true,
  logLevel: 'info',
});

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
