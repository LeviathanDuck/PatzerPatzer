import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_INPUT = path.join(ROOT, 'data/lichess/raw/lichess_db_puzzle.csv.zst');
const DEFAULT_OUTPUT = path.join(ROOT, 'public/generated/lichess-puzzles');
const DEFAULT_SHARD_SIZE = 5000;

const EXPECTED_COLUMNS = [
  'PuzzleId',
  'FEN',
  'Moves',
  'Rating',
  'RatingDeviation',
  'Popularity',
  'NbPlays',
  'Themes',
  'GameUrl',
  'OpeningTags',
];

function usage() {
  console.log(`Usage: node scripts/puzzles/build-lichess-shards.mjs [options]

Builds a Patzer-friendly manifest + shard set from the official Lichess puzzle export.

Options:
  --input <path>       Input .csv or .csv.zst file (default: ${path.relative(ROOT, DEFAULT_INPUT)})
  --output <path>      Output directory (default: ${path.relative(ROOT, DEFAULT_OUTPUT)})
  --shard-size <n>     Number of records per shard (default: ${DEFAULT_SHARD_SIZE})
  --limit <n>          Optional row limit for safe dev/sample runs
  --help               Show this help text

Notes:
  - .zst input requires a local \`zstd\` binary on PATH
  - output is written under the ignored local generated dataset path
`);
}

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    shardSize: DEFAULT_SHARD_SIZE,
    limit: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') args.input = path.resolve(argv[++i] ?? '');
    else if (arg === '--output') args.output = path.resolve(argv[++i] ?? '');
    else if (arg === '--shard-size') args.shardSize = Math.max(1, Number.parseInt(argv[++i] ?? '', 10) || DEFAULT_SHARD_SIZE);
    else if (arg === '--limit') args.limit = Math.max(1, Number.parseInt(argv[++i] ?? '', 10) || 0);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parseCsvRow(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function toInt(value) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitTags(value) {
  return (value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function sanitizeRow(fields, shardId) {
  const row = {
    id: fields['PuzzleId'],
    fen: fields['FEN'],
    moves: splitTags(fields['Moves']),
    rating: toInt(fields['Rating']) ?? 0,
    ratingDeviation: toInt(fields['RatingDeviation']),
    popularity: toInt(fields['Popularity']),
    plays: toInt(fields['NbPlays']),
    themes: splitTags(fields['Themes']),
    openingTags: splitTags(fields['OpeningTags']),
    gameUrl: fields['GameUrl']?.trim() || undefined,
  };
  return {
    ...row,
    shardId,
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function openInputStream(inputPath) {
  if (inputPath.endsWith('.zst')) {
    const child = spawn('zstd', ['-dc', inputPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    if (!child.stdout) throw new Error('Failed to open zstd output stream');
    child.on('error', error => {
      console.error('[lichess-puzzles] zstd launch failed');
      console.error(error instanceof Error ? error.message : error);
    });
    return { stream: child.stdout, child };
  }
  return { stream: fs.createReadStream(inputPath), child: null };
}

function writeShard(outputDir, shardId, rows) {
  const file = `shard-${shardId}.json`;
  const payload = rows.map(({ shardId: _shardId, ...row }) => row);
  fs.writeFileSync(path.join(outputDir, file), JSON.stringify(payload));

  const ratingValues = rows.map(row => row.rating);
  const themes = [...new Set(rows.flatMap(row => row.themes))].sort();
  const openings = [...new Set(rows.flatMap(row => row.openingTags))].sort();
  return {
    id: shardId,
    file,
    count: rows.length,
    ratingMin: ratingValues.length ? Math.min(...ratingValues) : undefined,
    ratingMax: ratingValues.length ? Math.max(...ratingValues) : undefined,
    themes,
    openings,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (!fs.existsSync(args.input)) {
    throw new Error(`Input not found: ${path.relative(ROOT, args.input)}`);
  }

  ensureDir(args.output);

  const { stream, child } = openInputStream(args.input);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const manifestThemes = new Set();
  const manifestOpenings = new Set();
  const shardMeta = [];
  let shardRows = [];
  let totalCount = 0;
  let shardIndex = 0;
  let ratingMin;
  let ratingMax;
  let headerMap = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvRow(line);
    if (!headerMap) {
      headerMap = EXPECTED_COLUMNS.reduce((map, column) => {
        map[column] = cells.indexOf(column);
        return map;
      }, {});
      const missing = EXPECTED_COLUMNS.filter(column => headerMap[column] < 0);
      if (missing.length > 0) {
        throw new Error(`Unexpected CSV header; missing columns: ${missing.join(', ')}`);
      }
      continue;
    }

    const fields = EXPECTED_COLUMNS.reduce((map, column) => {
      map[column] = cells[headerMap[column]] ?? '';
      return map;
    }, {});
    const shardId = String(shardIndex).padStart(5, '0');
    const row = sanitizeRow(fields, shardId);
    if (!row.id || !row.fen || row.moves.length === 0) continue;
    shardRows.push(row);
    totalCount += 1;
    ratingMin = ratingMin === undefined ? row.rating : Math.min(ratingMin, row.rating);
    ratingMax = ratingMax === undefined ? row.rating : Math.max(ratingMax, row.rating);
    for (const theme of row.themes) manifestThemes.add(theme);
    for (const opening of row.openingTags) manifestOpenings.add(opening);

    if (shardRows.length >= args.shardSize) {
      shardMeta.push(writeShard(args.output, shardId, shardRows));
      shardRows = [];
      shardIndex += 1;
    }

    if (args.limit !== null && totalCount >= args.limit) break;
  }

  if (shardRows.length > 0) {
    const shardId = String(shardIndex).padStart(5, '0');
    shardMeta.push(writeShard(args.output, shardId, shardRows));
  }

  if (child) {
    await new Promise((resolve, reject) => {
      child.on('exit', code => {
        if (code === 0) resolve();
        else reject(new Error(`zstd exited with code ${code}`));
      });
    });
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalCount,
    shardSize: args.shardSize,
    shards: shardMeta,
    ...(ratingMin !== undefined ? { ratingMin } : {}),
    ...(ratingMax !== undefined ? { ratingMax } : {}),
    themes: [...manifestThemes].sort(),
    openings: [...manifestOpenings].sort(),
    source: {
      file: path.basename(args.input),
      license: 'CC0',
      url: 'https://database.lichess.org/#puzzles',
    },
  };
  fs.writeFileSync(path.join(args.output, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`[lichess-puzzles] wrote manifest + ${shardMeta.length} shard(s)`);
  console.log(`[lichess-puzzles] output: ${path.relative(ROOT, args.output)}`);
  console.log(`[lichess-puzzles] total puzzles: ${totalCount.toLocaleString()}`);
}

main().catch(error => {
  console.error('[lichess-puzzles] shard build failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
