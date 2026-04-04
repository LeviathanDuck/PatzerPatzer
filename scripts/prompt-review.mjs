// Mark a prompt as reviewed in the registry.
//
// Usage:
//   npm run prompt:review -- CCP-175 --passed --reviewed-by Codex --review-method full-review
//   npm run prompt:review -- CCP-175 --passed-with-notes "minor style nit"
//   npm run prompt:review -- CCP-175 --issues "typecheck failure in view.ts"
//   npm run prompt:review -- CCP-175 --rework "wrong approach, needs redesign"
//   npm run prompt:review -- CCP-175 --issues-resolved --reviewed-by Codex --review-method follow-up-recheck
//
// Sets status → reviewed, reviewOutcome, queueState → not-queued.
// Then runs prompts:refresh.

import { execSync } from 'node:child_process';
import { ensureActivePrompt, mutateRegistryLocked, requirePrompt } from './prompt-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const id = args[0];

if (!id || (!args.includes('--passed') && !args.includes('--issues') && !args.includes('--rework') && !args.includes('--passed-with-notes') && !args.includes('--issues-resolved'))) {
  console.error('Usage: npm run prompt:review -- <CCP-ID> --passed|--passed-with-notes "..."|--issues "..."|--rework "..."|--issues-resolved --reviewed-by Codex|Claude|User|Unknown --review-method full-review|manager-plus-children|manager-only|spot-check|follow-up-recheck [--review-scope "full tree"]');
  process.exit(1);
}

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? (args[idx + 1] || '') : null;
}

const VALID_REVIEWERS = new Set(['Codex', 'Claude', 'User', 'Unknown']);
const VALID_REVIEW_METHODS = new Set([
  'full-review',
  'manager-plus-children',
  'manager-only',
  'spot-check',
  'follow-up-recheck',
]);

let outcome;
let issues;
if (args.includes('--passed')) {
  outcome = 'passed';
  issues = '';
} else if (getFlag('--passed-with-notes') !== null) {
  outcome = 'passed with notes';
  issues = getFlag('--passed-with-notes');
} else if (getFlag('--issues') !== null) {
  outcome = 'issues found';
  issues = getFlag('--issues');
} else if (getFlag('--rework') !== null) {
  outcome = 'needs rework';
  issues = getFlag('--rework');
} else if (args.includes('--issues-resolved')) {
  outcome = 'issues resolved';
  issues = '';
}

const reviewedBy = getFlag('--reviewed-by');
const reviewMethod = getFlag('--review-method');
const reviewScope = getFlag('--review-scope') || '';

if (!reviewedBy) {
  console.error('Missing required --reviewed-by flag. Use one of: Codex, Claude, User, Unknown.');
  process.exit(1);
}

if (!reviewMethod) {
  console.error('Missing required --review-method flag. Use one of: full-review, manager-plus-children, manager-only, spot-check, follow-up-recheck.');
  process.exit(1);
}

if (!VALID_REVIEWERS.has(reviewedBy)) {
  console.error(`Invalid --reviewed-by value: ${reviewedBy}`);
  process.exit(1);
}

if (!VALID_REVIEW_METHODS.has(reviewMethod)) {
  console.error(`Invalid --review-method value: ${reviewMethod}`);
  process.exit(1);
}

try {
  await mutateRegistryLocked(root, registry => {
    const prompt = requirePrompt(registry, id);
    ensureActivePrompt(prompt, 'prompt:review');

    const now = new Date().toISOString();
    prompt.status = 'reviewed';
    prompt.reviewOutcome = outcome;
    prompt.reviewIssues = issues || '';
    prompt.reviewedAt = now;
    prompt.reviewedBy = reviewedBy;
    prompt.reviewMethod = reviewMethod;
    prompt.reviewScope = reviewScope;
    prompt.queueState = 'not-queued';
  });

  console.log(`${id} → reviewed (${outcome}) by ${reviewedBy} via ${reviewMethod}${issues ? ': ' + issues : ''}`);
  console.log('Running prompts:refresh...');
  try {
    execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[prompt:review] prompts:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
