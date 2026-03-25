import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATA_ROOT = path.join(ROOT, 'data/lichess');
const RAW_DIR = path.join(DATA_ROOT, 'raw');
const WORK_DIR = path.join(DATA_ROOT, 'work');
const DEFAULT_DEST = path.join(RAW_DIR, 'lichess_db_puzzle.csv.zst');
const DEFAULT_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

function usage() {
  console.log(`Usage: node scripts/puzzles/download-lichess-puzzles.mjs [options]

Downloads the official Lichess puzzle export into the ignored local dataset workspace.

Options:
  --dest <path>   Output path (default: ${path.relative(ROOT, DEFAULT_DEST)})
  --url <url>     Override the download URL
  --force         Re-download even if the file already exists
  --dry-run       Print the resolved source/destination without downloading
  --help          Show this help text
`);
}

function parseArgs(argv) {
  const args = {
    dest: DEFAULT_DEST,
    url: DEFAULT_URL,
    force: false,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dest') args.dest = path.resolve(argv[++i] ?? '');
    else if (arg === '--url') args.url = argv[++i] ?? '';
    else if (arg === '--force') args.force = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (!args.url) throw new Error('Missing download URL');
  if (!args.dest) throw new Error('Missing destination path');

  fs.mkdirSync(path.dirname(args.dest), { recursive: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });

  console.log(`[lichess-puzzles] url:  ${args.url}`);
  console.log(`[lichess-puzzles] dest: ${path.relative(ROOT, args.dest)}`);

  if (args.dryRun) return;

  if (fs.existsSync(args.dest) && !args.force) {
    console.log('[lichess-puzzles] file already exists; use --force to re-download');
    return;
  }

  const response = await fetch(args.url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const tmpDest = `${args.dest}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmpDest));
  fs.renameSync(tmpDest, args.dest);

  const stats = fs.statSync(args.dest);
  const metaPath = path.join(WORK_DIR, 'lichess_db_puzzle.download.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    url: args.url,
    dest: path.relative(ROOT, args.dest),
    bytes: stats.size,
    downloadedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`[lichess-puzzles] downloaded ${stats.size.toLocaleString()} bytes`);
  console.log(`[lichess-puzzles] metadata: ${path.relative(ROOT, metaPath)}`);
}

main().catch(error => {
  console.error('[lichess-puzzles] download failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
