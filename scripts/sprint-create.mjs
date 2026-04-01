import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mutateSprintRegistryLocked, reserveNextSprintId } from './sprint-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const title = getFlag('--title');
const sourceDocument = getFlag('--source-document');
const status = getFlag('--status') || 'planned';
const completionSummary = getFlag('--completion-summary') || '';
const dependencySprintIds = (getFlag('--depends-on') || '').split(',').map(part => part.trim()).filter(Boolean);

if (!title || !sourceDocument) {
  console.error('Usage: npm run sprint:create -- --title "..." --source-document docs/mini-sprints/FOO.md [--status planned] [--depends-on SPR-001,SPR-002] [--completion-summary "..."]');
  process.exit(1);
}

if (!sourceDocument.startsWith('docs/mini-sprints/')) {
  console.error('--source-document must live under docs/mini-sprints/.');
  process.exit(1);
}

if (!existsSync(resolve(root, sourceDocument))) {
  console.error(`Sprint source document does not exist: ${sourceDocument}`);
  process.exit(1);
}

try {
  const result = await mutateSprintRegistryLocked(root, registry => {
    const existing = registry.sprints.find(sprint => sprint.sourceDocument === sourceDocument);
    if (existing) {
      existing.title = title;
      existing.status = status;
      existing.updatedAt = new Date().toISOString();
      existing.dependencySprintIds = dependencySprintIds;
      if (completionSummary) existing.completionSummary = completionSummary;
      return { id: existing.id, updated: true };
    }

    const id = reserveNextSprintId(registry);
    const now = new Date().toISOString();
    registry.sprints.unshift({
      id,
      title,
      sourceDocument,
      status,
      createdAt: now,
      updatedAt: now,
      dependencySprintIds,
      phaseIds: [],
      auditRefs: [],
      recommendedNextSteps: [],
      completionSummary,
      unassignedPromptIds: [],
    });
    return { id, updated: false };
  });

  console.log(`${result.id} → ${result.updated ? 'updated' : 'created'}`);
  console.log('Running sprints:refresh...');
  try {
    execSync('npm run sprints:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[sprint:create] sprints:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
