import { execSync } from 'node:child_process';
import { makeReservedPromptRecord, mutateRegistryLocked, reserveNextFollowupId, requirePrompt } from './prompt-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const taskId = args[0];

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

if (!taskId) {
  console.error('Usage: npm run prompt:reserve-followup -- <ROOT_TASK_ID> [--parent-prompt-id <CCP-ID>] [--title "..."] [--kind feature] [--created-by Codex]');
  process.exit(1);
}

const parentPromptId = getFlag('--parent-prompt-id') || taskId;
const title = getFlag('--title');
const kind = getFlag('--kind') || 'feature';
const createdBy = getFlag('--created-by') || 'Unknown';
const notes = getFlag('--notes') || `Reserved follow-up in ${taskId}`;
const executionTarget = getFlag('--execution-target') || 'Claude Code';

try {
  const { id } = await mutateRegistryLocked(root, registry => {
    requirePrompt(registry, taskId);
    requirePrompt(registry, parentPromptId);
    const id = reserveNextFollowupId(registry, taskId);
    registry.prompts.push(makeReservedPromptRecord({
      id,
      taskId,
      parentPromptId,
      title: title || `Reserved follow-up ${id}`,
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
    console.log('[prompt:reserve-followup] prompts:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
