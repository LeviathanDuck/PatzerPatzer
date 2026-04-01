// Mark a prompt as started in the registry.
// Usage: node scripts/prompt-start.mjs CCP-175
//   or:  npm run prompt:start -- CCP-175
//
// Sets queueState → queued-started, startedAt → now (if unset), claudeUsed → true.
// Then runs prompts:refresh to regenerate all docs and dashboard.

import { execSync } from 'node:child_process';
import { ensureNotReserved, mutateRegistryLocked, requirePrompt } from './prompt-registry-lib.mjs';

const root = process.cwd();
const id = process.argv[2];

if (!id) {
  console.error('Usage: npm run prompt:start -- <CCP-ID>');
  process.exit(1);
}

try {
  const result = await mutateRegistryLocked(root, registry => {
    const prompt = requirePrompt(registry, id);
    ensureNotReserved(prompt, 'prompt:start');

    if (prompt.queueState === 'queued-started') {
      return { alreadyStarted: true, startedAt: prompt.startedAt };
    }

    const now = new Date().toISOString();
    prompt.queueState = 'queued-started';
    if (!prompt.startedAt) prompt.startedAt = now;
    prompt.claudeUsed = true;
    return { alreadyStarted: false, startedAt: prompt.startedAt };
  });

  if (result.alreadyStarted) {
    console.log(`${id} is already started (startedAt: ${result.startedAt}).`);
  } else {
    console.log(`${id} → queued-started (startedAt: ${result.startedAt})`);
  }

  console.log('Running prompts:refresh...');
  try {
    execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    // prompts:refresh may exit non-zero if audit finds pre-existing issues.
    // The prompt start itself succeeded — don't propagate that error.
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
