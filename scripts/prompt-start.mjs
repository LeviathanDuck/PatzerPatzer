// Mark a prompt as started in the registry.
// Usage: node scripts/prompt-start.mjs CCP-175
//   or:  npm run prompt:start CCP-175
//
// Sets queueState → queued-started, startedAt → now (if unset), claudeUsed → true.
// Then runs prompts:refresh to regenerate all docs and dashboard.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const REGISTRY_PATH = resolve(root, 'docs/prompts/prompt-registry.json');

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run prompt:start <CCP-ID>');
  process.exit(1);
}

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const prompt = registry.prompts.find(p => p.id === id);

if (!prompt) {
  console.error(`Prompt ${id} not found in registry.`);
  process.exit(1);
}

if (prompt.queueState === 'queued-started') {
  console.log(`${id} is already started (startedAt: ${prompt.startedAt}).`);
} else {
  const now = new Date().toISOString();
  prompt.queueState = 'queued-started';
  if (!prompt.startedAt) prompt.startedAt = now;
  prompt.claudeUsed = true;
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
  console.log(`${id} → queued-started (startedAt: ${prompt.startedAt})`);
}

// Regenerate docs and dashboard.
console.log('Running prompts:refresh...');
execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
