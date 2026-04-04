// Mark a prompt as skipped in the registry.
//
// Usage:
//   npm run prompt:skip -- CCP-175
//   npm run prompt:skip -- CCP-175 --reason "Superseded by sprint audit"
//
// Sets status → skipped, queueState → not-queued, skippedAt → now.
// Then runs prompts:refresh to regenerate all docs and dashboard.

import { execSync } from 'node:child_process';
import { isSkippablePrompt, mutateRegistryLocked, requirePrompt } from './prompt-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const id = args[0];

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

if (!id) {
  console.error('Usage: npm run prompt:skip -- <CCP-ID> [--reason "description"]');
  process.exit(1);
}

const reason = getFlag('--reason');

try {
  const result = await mutateRegistryLocked(root, registry => {
    const prompt = requirePrompt(registry, id);

    if (!isSkippablePrompt(prompt)) {
      throw new Error(`Prompt ${id} cannot be skipped. Only created / queued-pending prompts may be skipped.`);
    }

    const now = new Date().toISOString();
    prompt.status = 'skipped';
    prompt.queueState = 'not-queued';
    prompt.skippedAt = now;
    prompt.skipReason = reason || '';
    prompt.startedAt = '';
    prompt.completedAt = '';
    prompt.completionErrors = '';
    prompt.reviewedAt = '';
    prompt.reviewedBy = '';
    prompt.reviewMethod = '';
    prompt.reviewScope = '';
    prompt.reviewIssues = '';
    prompt.reviewOutcome = 'pending';
    prompt.manualChecklist = [];

    return { skippedAt: now };
  });

  console.log(`${id} → skipped (skippedAt: ${result.skippedAt})`);
  if (reason) console.log(`  Reason: ${reason}`);

  console.log('Running prompts:refresh...');
  try {
    execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[prompt:skip] prompts:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
