import * as esbuild from 'esbuild';
import * as sass from 'sass';
import fs from 'fs';
import { execSync } from 'child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version || '0.0.0';
const builtAt = new Date().toISOString();

function gitValue(args) {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const commit = process.env.PATZER_COMMIT || gitValue('rev-parse HEAD');
const shortCommit = process.env.PATZER_SHORT_COMMIT || (commit ? commit.slice(0, 12) : gitValue('rev-parse --short=12 HEAD'));
const branch = process.env.PATZER_BRANCH || gitValue('branch --show-current');
const commitTimestamp = process.env.PATZER_COMMIT_TIMESTAMP || gitValue('show -s --format=%cI HEAD');
const commitMessage = process.env.PATZER_COMMIT_MESSAGE || gitValue('log -1 --format=%B');
const buildId = process.env.PATZER_BUILD_ID || shortCommit || builtAt.replace(/[-:T.Z]/g, '').slice(0, 14);
const release = `patzer-pro@${version}+${buildId}`;
const sourcemapRoot = 'dist/sourcemaps';

fs.rmSync(sourcemapRoot, { recursive: true, force: true });
fs.mkdirSync(`${sourcemapRoot}/js`, { recursive: true });
fs.rmSync('public/js/main.js.map', { force: true });
fs.rmSync('public/js/stockfish-worker.js.map', { force: true });
fs.rmSync('public/js/opening-tree-worker.js.map', { force: true });

function moveSourcemap(publicMapPath) {
  const mapName = publicMapPath.split('/').pop();
  const privateMapPath = `${sourcemapRoot}/js/${mapName}`;
  if (fs.existsSync(publicMapPath)) {
    fs.renameSync(publicMapPath, privateMapPath);
    console.log(' ', privateMapPath);
  }
}

// Compile TypeScript — main bundle
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'public/js/main.js',
  format: 'esm',
  target: 'es2021',
  minify: true,
  sourcemap: 'external',
  define: {
    __PATZER_RELEASE__: JSON.stringify(release),
    __PATZER_VERSION__: JSON.stringify(version),
    __PATZER_BUILD_ID__: JSON.stringify(buildId),
    __PATZER_COMMIT__: JSON.stringify(commit),
    __PATZER_SHORT_COMMIT__: JSON.stringify(shortCommit),
    __PATZER_BRANCH__: JSON.stringify(branch),
    __PATZER_COMMIT_TIMESTAMP__: JSON.stringify(commitTimestamp),
    __PATZER_COMMIT_MESSAGE__: JSON.stringify(commitMessage),
    __PATZER_BUILT_AT__: JSON.stringify(builtAt),
  },
  logLevel: 'info',
});
moveSourcemap('public/js/main.js.map');

// Compile TypeScript — Stockfish worker entry
// The worker is a classic (non-module) worker so it uses iife format.
// Adapted from lichess-org/lila: ui/lib/src/ceval/engines/simpleEngine.ts
await esbuild.build({
  entryPoints: ['src/ceval/worker.ts'],
  bundle: true,
  outfile: 'public/js/stockfish-worker.js',
  format: 'iife',
  target: 'es2021',
  minify: true,
  sourcemap: 'external',
  logLevel: 'info',
});
moveSourcemap('public/js/stockfish-worker.js.map');

// Compile TypeScript — opening-tree aggregation worker entry (Lane D R7, DORMANT).
// Runs the existing OpeningTreeBuilder parse/replay aggregation off the main
// thread via a classic (non-module) dedicated worker, so it uses iife format like
// the Stockfish worker above. Built + tested but not yet consumed by any caller;
// R8 wires ctrl.ts to it. The cache-busting query (`?v=<buildId>`) is applied by
// the consuming `new Worker(...)` call in R8, mirroring the main.js/main.css
// convention — the artifact filename here stays stable and unhashed like
// stockfish-worker.js.
await esbuild.build({
  entryPoints: ['src/openings/treeWorker.ts'],
  bundle: true,
  outfile: 'public/js/opening-tree-worker.js',
  format: 'iife',
  target: 'es2021',
  minify: true,
  sourcemap: 'external',
  logLevel: 'info',
});
moveSourcemap('public/js/opening-tree-worker.js.map');

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





const indexHtmlPath = 'public/index.html';
if (fs.existsSync(indexHtmlPath)) {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const bustedHtml = html.replace(
    /(\/(?:css\/main\.css|js\/main\.js))\?v=[^"']*/g,
    `$1?v=${buildId}`,
  );
  if (bustedHtml !== html) {
    fs.writeFileSync(indexHtmlPath, bustedHtml);
    console.log(`  public/index.html (cache-bust ?v=${buildId})`);
  } else {
    console.log(`  public/index.html (cache-bust already ?v=${buildId})`);
  }
}
