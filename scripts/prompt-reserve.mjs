import { execSync } from 'node:child_process';
import { makeReservedPromptRecord, mutateRegistryLocked, reserveNextRootId } from './prompt-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const title = getFlag('--title');
const kind = getFlag('--kind') || 'feature';
const createdBy = getFlag('--created-by') || 'Unknown';
const notes = getFlag('--notes') || 'Reserved by allocator';
const executionTarget = getFlag('--execution-target') || 'Claude Code';

try {
  const { id } = await mutateRegistryLocked(root, registry => {
    const id = reserveNextRootId(registry);
    registry.prompts.push(makeReservedPromptRecord({
      id,
      taskId: id,
      title: title || `Reserved ${id}`,
      kind,
      createdBy,
      notes,
      executionTarget,
    }));
    return { id };
  });

  console.log(id);
  try {
    execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[prompt:reserve] prompts:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
