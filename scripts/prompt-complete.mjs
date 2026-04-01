// Mark a prompt as completed in the registry.
//
// Usage:
//   node scripts/prompt-complete.mjs CCP-175
//   node scripts/prompt-complete.mjs CCP-175 --errors "tsc found 3 errors in view.ts"
//   node scripts/prompt-complete.mjs CCP-175 --checklist "- [ ] Open puzzles page, verify rating displays|- [ ] Complete a rated puzzle, confirm delta shown"
//   node scripts/prompt-complete.mjs CCP-175 --errors "..." --checklist "..."
//   node scripts/prompt-complete.mjs CCP-175 --fixes CCP-170
//
// --checklist: pipe-delimited list of manual verification items for the reviewer.
//   Each item separated by | becomes a line in the manualChecklist array.
//
// --fixes <CCP-ID>: declares that this prompt resolves review issues from an earlier prompt.
//   Sets fixesPromptId on this prompt.
//   Sets fixedByPromptId on the original prompt.
//   Updates the original prompt's reviewOutcome from 'issues found'/'needs rework' → 'issues resolved'.
//
// Without --errors: sets queueState → queued-run, completedAt → now.
//   Dashboard shows: "COMPLETED: NEEDS REVIEW"
//
// With --errors: same, plus completionErrors on the record.
//   Dashboard shows: "COMPLETED WITH ERRORS: NEEDS REVIEW"
//
// Then runs prompts:refresh to regenerate all docs and dashboard.

import { execSync } from 'node:child_process';
import { ensureNotReserved, mutateRegistryLocked, requirePrompt } from './prompt-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const id = args[0];

if (!id) {
  console.error('Usage: npm run prompt:complete -- <CCP-ID> [--errors "description"] [--checklist "item1|item2|..."] [--fixes <CCP-ID>]');
  process.exit(1);
}

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const errors = getFlag('--errors');
const checklistRaw = getFlag('--checklist');
const fixesId = getFlag('--fixes');

try {
  const result = await mutateRegistryLocked(root, registry => {
    const prompt = requirePrompt(registry, id);
    ensureNotReserved(prompt, 'prompt:complete');

    let fixesTarget = null;
    if (fixesId) {
      fixesTarget = requirePrompt(registry, fixesId);
      ensureNotReserved(fixesTarget, 'prompt:complete --fixes');
    }

    const now = new Date().toISOString();
    const alreadyCompleted = prompt.queueState === 'queued-run' && !errors && !checklistRaw && !fixesId;

    if (alreadyCompleted) {
      return { alreadyCompleted: true, completedAt: prompt.completedAt };
    }

    prompt.queueState = 'queued-run';
    if (!prompt.completedAt) prompt.completedAt = now;

    if (errors) {
      prompt.completionErrors = errors;
    } else if (!prompt.completionErrors) {
      prompt.completionErrors = '';
    }

    if (checklistRaw) {
      prompt.manualChecklist = checklistRaw
        .split('|')
        .map(s => s.trim())
        .filter(Boolean);
    }

    let fixesResolved = false;
    if (fixesTarget) {
      prompt.fixesPromptId = fixesId;
      fixesTarget.fixedByPromptId = id;
      if (fixesTarget.reviewOutcome === 'issues found' || fixesTarget.reviewOutcome === 'needs rework') {
        fixesTarget.reviewOutcome = 'issues resolved';
        fixesResolved = true;
      }
    }

    return {
      alreadyCompleted: false,
      completedAt: prompt.completedAt,
      checklistCount: prompt.manualChecklist?.length ?? 0,
      fixesResolved,
    };
  });

  if (result.alreadyCompleted) {
    console.log(`${id} is already marked as completed (completedAt: ${result.completedAt}).`);
  } else {
    if (errors) {
      console.log(`${id} → queued-run with errors (completedAt: ${result.completedAt})`);
      console.log(`  Errors: ${errors}`);
    } else {
      console.log(`${id} → queued-run (completedAt: ${result.completedAt})`);
    }
    if (checklistRaw) console.log(`  Manual checklist: ${result.checklistCount} items`);
    if (fixesId && result.fixesResolved) console.log(`  ${fixesId} → reviewOutcome updated to 'issues resolved' (fixed by ${id})`);
    if (fixesId) console.log(`  Linked: ${id} fixes ${fixesId}`);
  }

  console.log('Running prompts:refresh...');
  try {
    execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[prompt:complete] prompts:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
