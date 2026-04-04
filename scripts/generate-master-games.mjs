#!/usr/bin/env node
/**
 * scripts/generate-master-games.mjs
 *
 * Downloads Fischer and Capablanca PGN collections from pgnmentor.com and
 * generates src/showcase/masterGames.ts with verified UCI move arrays.
 * Every move is validated by chessops before inclusion — illegal moves cause
 * the game to be skipped entirely.
 *
 * Usage (auto-download):
 *   node scripts/generate-master-games.mjs
 *
 * Usage (local files, skips download):
 *   node scripts/generate-master-games.mjs --fischer path/to/fischer.pgn --capablanca path/to/capa.pgn
 */

import { execSync }                                 from 'child_process';
import { readFileSync, writeFileSync, existsSync,
         mkdirSync }                                from 'fs';
import { join, dirname }                            from 'path';
import { fileURLToPath }                            from 'url';
import { tmpdir }                                   from 'os';
import { makeUci }                                  from 'chessops';
import { parsePgn, startingPosition }               from 'chessops/pgn';
import { parseSan }                                 from 'chessops/san';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, '..');
const OUT_FILE   = join(ROOT, 'src', 'showcase', 'masterGames.ts');

const URLS = {
  fischer:    'https://www.pgnmentor.com/players/Fischer.zip',
  capablanca: 'https://www.pgnmentor.com/players/Capablanca.zip',
};

const GAMES_PER_PLAYER = 100;
const MIN_MOVES        = 10;   // skip games shorter than this

// ─── Download + extract ───────────────────────────────────────────────────────

/** Download a zip from url, extract, return the text of the first .pgn found. */
function fetchPgn(name, url) {
  const tmp     = join(tmpdir(), `patzer-master-${name}`);
  const zipPath = join(tmp, `${name}.zip`);
  const cached  = join(tmp, `${name}.pgn`);

  mkdirSync(tmp, { recursive: true });

  if (!existsSync(cached)) {
    console.log(`  curl ${url}`);
    execSync(`curl -sL --max-time 30 "${url}" -o "${zipPath}"`);
    console.log(`  unzip`);
    execSync(`unzip -o "${zipPath}" -d "${tmp}"`);

    const found = execSync(`find "${tmp}" -name "*.pgn"`, {
      encoding: 'utf8',
    }).trim().split('\n').filter(Boolean);

    if (!found.length) throw new Error(`No .pgn found in zip for ${name}`);
    // On case-insensitive (macOS) the extracted file may already be 'cached'
    const srcPgn = found[0];
    if (srcPgn.toLowerCase() !== cached.toLowerCase()) {
      execSync(`cp "${srcPgn}" "${cached}"`);
    } else {
      // already in place — rename to ensure consistent lowercase path
      execSync(`mv "${srcPgn}" "${cached}" 2>/dev/null || true`);
    }
    console.log(`  cached → ${cached}`);
  } else {
    console.log(`  using cached ${cached}`);
  }

  return readFileSync(cached, 'utf8');
}

// ─── PGN → UCI conversion (uses same chessops pattern as src/tree/pgn.ts) ─────

/**
 * Parse a raw PGN string and return up to maxGames validated game objects.
 * Each returned game's moves[] array contains only legal UCI strings.
 * Games with any illegal move are silently skipped.
 */
function pgnToGames(pgnText, maxGames) {
  const parsed = parsePgn(pgnText);
  const out    = [];

  for (const game of parsed) {
    if (out.length >= maxGames) break;

    try {
      const pos  = startingPosition(game.headers).unwrap();
      const ucis = [];
      let legal  = true;

      // Walk the mainline only (children[0] at each step)
      const walk = (node) => {
        const child = node.children[0];
        if (!child) return;
        const move = parseSan(pos, child.data.san);
        if (!move) { legal = false; return; }
        ucis.push(makeUci(move));
        pos.play(move);
        walk(child);
      };
      walk(game.moves);

      if (!legal || ucis.length < MIN_MOVES) continue;

      const h      = game.headers;
      const result = h.get('Result') ?? '*';
      const normResult =
        result === '1-0'       ? '1-0' :
        result === '0-1'       ? '0-1' :
        result === '1/2-1/2'   ? '1/2-1/2' :
        null;

      if (!normResult) continue; // skip games without a definitive result

      // Extract year from Date header (YYYY.MM.DD or YYYY)
      const dateStr = h.get('Date') ?? '';
      const year    = parseInt(dateStr.slice(0, 4), 10) || 0;

      out.push({
        white:   h.get('White')   ?? 'Unknown',
        black:   h.get('Black')   ?? 'Unknown',
        result:  normResult,
        year,
        event:   h.get('Event')   ?? '',
        site:    h.get('Site')    ?? '',
        eco:     h.get('ECO')     ?? '',
        opening: h.get('Opening') ?? '',
        moves:   ucis,
      });
    } catch {
      // chessops threw (e.g. variant game, bad FEN) — skip silently
    }
  }

  return out;
}

// ─── TypeScript codegen ───────────────────────────────────────────────────────

function generateTs(fischerGames, capablancaGames) {
  const lines = [];

  lines.push(
    `// Generated by scripts/generate-master-games.mjs — do not edit by hand.`,
    `// All games are public domain (Capablanca pre-1928; Fischer games, United States).`,
    ``,
    `export interface MasterGame {`,
    `  id:       string;          // e.g. 'fischer-001'`,
    `  white:    string;          // full name`,
    `  black:    string;          // full name`,
    `  result:   '1-0' | '0-1' | '1/2-1/2';`,
    `  year:     number;`,
    `  event:    string;          // tournament or match name`,
    `  site:     string;          // city / venue if known, else ''`,
    `  eco:      string;          // ECO code if known, else ''`,
    `  opening:  string;          // opening name if known, else ''`,
    `  label:    string;          // one-line display: "{White} vs {Black}, {Event} {Year}"`,
    `  moves:    string[];        // UCI move array e.g. ['e2e4', 'e7e5', 'g1f3', ...]`,
    `}`,
    ``,
    `export const MASTER_GAMES: MasterGame[] = [`,
  );

  const players = [
    { prefix: 'fischer',    games: fischerGames },
    { prefix: 'capablanca', games: capablancaGames },
  ];

  for (const { prefix, games } of players) {
    lines.push(`  // ─── ${prefix.toUpperCase()} ` + '─'.repeat(60 - prefix.length));
    games.forEach((g, i) => {
      const id    = `${prefix}-${String(i + 1).padStart(3, '0')}`;
      const label = `${g.white} vs ${g.black}, ${g.event} ${g.year}`.trim();
      const movesStr = g.moves.map(m => `'${m}'`).join(', ');
      lines.push(
        `  {`,
        `    id:      '${id}',`,
        `    white:   ${JSON.stringify(g.white)},`,
        `    black:   ${JSON.stringify(g.black)},`,
        `    result:  ${JSON.stringify(g.result)},`,
        `    year:    ${g.year},`,
        `    event:   ${JSON.stringify(g.event)},`,
        `    site:    ${JSON.stringify(g.site)},`,
        `    eco:     ${JSON.stringify(g.eco)},`,
        `    opening: ${JSON.stringify(g.opening)},`,
        `    label:   ${JSON.stringify(label)},`,
        `    moves:   [${movesStr}],`,
        `  },`,
      );
    });
  }

  lines.push(
    `];`,
    ``,
    `/** Return a random game from the full dataset. */`,
    `export function randomMasterGame(): MasterGame {`,
    `  return MASTER_GAMES[Math.floor(Math.random() * MASTER_GAMES.length)]!;`,
    `}`,
    ``,
    `/** Return a random game by a specific player (matched against white or black field). */`,
    `export function randomGameByPlayer(name: string): MasterGame | undefined {`,
    `  const matches = MASTER_GAMES.filter(`,
    `    g => g.white.toLowerCase().includes(name.toLowerCase()) ||`,
    `         g.black.toLowerCase().includes(name.toLowerCase()),`,
    `  );`,
    `  if (matches.length === 0) return undefined;`,
    `  return matches[Math.floor(Math.random() * matches.length)]!;`,
    `}`,
    ``,
  );

  return lines.join('\n');
}

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

function getArg(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const fischerPath    = getArg(args, '--fischer');
  const capablancaPath = getArg(args, '--capablanca');

  let fischerPgn, capablancaPgn;

  if (fischerPath) {
    console.log(`Fischer: reading ${fischerPath}`);
    fischerPgn = readFileSync(fischerPath, 'utf8');
  } else {
    console.log('Fischer: downloading from pgnmentor.com...');
    fischerPgn = fetchPgn('fischer', URLS.fischer);
  }

  if (capablancaPath) {
    console.log(`Capablanca: reading ${capablancaPath}`);
    capablancaPgn = readFileSync(capablancaPath, 'utf8');
  } else {
    console.log('Capablanca: downloading from pgnmentor.com...');
    capablancaPgn = fetchPgn('capablanca', URLS.capablanca);
  }

  console.log('\nConverting Fischer PGN → UCI...');
  const fischerGames = pgnToGames(fischerPgn, GAMES_PER_PLAYER);
  console.log(`  ${fischerGames.length} games`);

  console.log('Converting Capablanca PGN → UCI...');
  const capablancaGames = pgnToGames(capablancaPgn, GAMES_PER_PLAYER);
  console.log(`  ${capablancaGames.length} games`);

  const total = fischerGames.length + capablancaGames.length;
  if (total < 180) {
    console.error(`\nERROR: only ${total} games — need 180+. Check PGN sources or supply local files.`);
    process.exit(1);
  }

  mkdirSync(join(ROOT, 'src', 'showcase'), { recursive: true });

  const ts = generateTs(fischerGames, capablancaGames);
  writeFileSync(OUT_FILE, ts, 'utf8');

  console.log(`\n✓ ${OUT_FILE}`);
  console.log(`  ${total} games  (${fischerGames.length} Fischer + ${capablancaGames.length} Capablanca)`);
  console.log(`  ${(ts.length / 1024).toFixed(1)} KB unminified`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
