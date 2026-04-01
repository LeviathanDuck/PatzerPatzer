import { execSync } from 'node:child_process';
import { mutateRegistryLocked, requirePrompt } from './prompt-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const id = args[0];

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

if (!id) {
  console.error('Usage: npm run prompt:release -- <PROMPT_ID> [--note "reason"]');
  process.exit(1);
}

const note = getFlag('--note');

try {
  await mutateRegistryLocked(root, registry => {
    const prompt = requirePrompt(registry, id);
    if (prompt.status !== 'reserved') {
      throw new Error(`Prompt ${id} is not reserved and cannot be released.`);
    }
    if (prompt.reservationReleasedAt) {
      throw new Error(`Prompt ${id} is already released.`);
    }
    prompt.reservationReleasedAt = new Date().toISOString();
    prompt.notes = note ? `${prompt.notes || 'Reserved by allocator'}\nReleased: ${note}` : `${prompt.notes || 'Reserved by allocator'}\nReleased manually.`;
  });

  console.log(`${id} → reservation released`);
  console.log('Running prompts:refresh...');
  try {
    execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[prompt:release] prompts:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
