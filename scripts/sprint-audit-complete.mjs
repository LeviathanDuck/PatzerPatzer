import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mutateSprintRegistryLocked, normalizeRepoPath, readSprintRegistry } from './sprint-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function parseTaskOutcomes(value) {
  if (!value) return [];
  return value
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .map(entry => {
      const [taskId, state] = entry.split(':').map(s => s.trim());
      return { taskId, state };
    });
}

const sprintId = getFlag('--sprint-id');
const auditDocument = getFlag('--audit-document');
const title = getFlag('--title') || 'Sprint audit';
const date = getFlag('--date') || new Date().toISOString().slice(0, 10);
const completionSummary = getFlag('--completion-summary') || '';
const findings = getFlag('--findings') || '';
const taskOutcomes = parseTaskOutcomes(getFlag('--task-outcomes'));
const normalized = getFlag('--normalized');

if (!sprintId || !auditDocument) {
  console.error('Usage: npm run sprint:audit:complete -- --sprint-id SPR-### --audit-document docs/audits/FOO.md [--title "..."] [--date YYYY-MM-DD] [--completion-summary "..."] [--findings "..."] [--task-outcomes "SPR-001-T01:Audit Confirmed Done|SPR-001-T02:Audit Found Mismatch"] [--normalized yes|no]');
  process.exit(1);
}

const normalizedAuditDocument = normalizeRepoPath(root, auditDocument);
if (!normalizedAuditDocument.startsWith('docs/')) {
  console.error(`--audit-document must resolve to a repo-relative docs path. Received: ${auditDocument}`);
  process.exit(1);
}
if (!existsSync(resolve(root, normalizedAuditDocument))) {
  console.error(`Audit document does not exist: ${normalizedAuditDocument}`);
  process.exit(1);
}

try {
  const { registry } = readSprintRegistry(root);
  const sprint = registry.sprints.find(entry => entry.id === sprintId);
  if (!sprint) throw new Error(`Unknown sprint: ${sprintId}`);

  await mutateSprintRegistryLocked(root, current => {
    const targetSprint = current.sprints.find(entry => entry.id === sprintId);
    if (!targetSprint) throw new Error(`Unknown sprint: ${sprintId}`);
    const sprintTasks = current.tasks.filter(task => task.sprintId === sprintId);
    for (const task of sprintTasks) {
      task.auditState = '';
      task.auditSourceDocument = '';
      task.auditUpdatedAt = '';
    }
    for (const outcome of taskOutcomes) {
      const task = sprintTasks.find(entry => entry.id === outcome.taskId);
      if (!task) throw new Error(`Sprint ${sprintId} does not contain task ${outcome.taskId}`);
      if (!['Audit Found Mismatch', 'Audit Confirmed Done'].includes(outcome.state)) {
        throw new Error(`Invalid task outcome for ${outcome.taskId}: ${outcome.state}`);
      }
      task.auditState = outcome.state;
      task.auditSourceDocument = normalizedAuditDocument;
      task.auditUpdatedAt = new Date().toISOString();
    }

    const existingAudit = (targetSprint.auditRefs || []).find(ref => ref.sourceDocument === normalizedAuditDocument);
    const auditRef = {
      id: existingAudit?.id || `${sprintId}-audit-${Date.now()}`,
      sourceDocument: normalizedAuditDocument,
      title,
      type: 'implementation-review',
      status: 'present',
      date,
      ...(findings ? { findings } : {}),
      ...(taskOutcomes.length ? { taskOutcomes } : {}),
    };
    targetSprint.auditRefs = [
      ...(targetSprint.auditRefs || []).filter(ref => ref.sourceDocument !== normalizedAuditDocument),
      auditRef,
    ];
    targetSprint.latestAuditRefId = auditRef.id;
    if (completionSummary) targetSprint.completionSummary = completionSummary;
    if (normalized === 'yes') targetSprint.normalizedStructure = true;
    if (normalized === 'no') targetSprint.normalizedStructure = false;
    targetSprint.updatedAt = new Date().toISOString();
  });

  console.log(`${sprintId} audit state updated.`);
  console.log('Running sprint:recompute...');
  execSync('npm run sprint:recompute', { cwd: root, stdio: 'inherit' });
  console.log('Running sprints:refresh...');
  try {
    execSync('npm run sprints:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[sprint:audit:complete] sprints:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
