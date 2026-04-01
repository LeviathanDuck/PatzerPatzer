import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mutateRegistryLocked, requirePrompt, validatePromptBodyText } from './prompt-registry-lib.mjs';
import { readSprintRegistry } from './sprint-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const id = args[0];

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function parseBatchPromptIds(value) {
  if (!value) return [];
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

if (!id) {
  console.error('Usage: npm run prompt:create -- <PROMPT_ID> --prompt-file docs/prompts/items/CCP-###.md --title "..." --task "..." --source-document "..." [--source-step "..."] [--task-id CCP-###] [--parent-prompt-id CCP-###] [--queue-summary "..."] [--queue-state queued-pending|not-queued] [--kind feature] [--execution-target "Claude Code"] [--batch-prompt-ids "CCP-001,CCP-002"] [--sprint-id SPR-###] [--sprint-phase-id SPR-###-P#] [--sprint-task-id SPR-###-T##]');
  process.exit(1);
}

const promptFile = getFlag('--prompt-file');
const title = getFlag('--title');
const task = getFlag('--task');
const sourceDocument = getFlag('--source-document');
const sourceStep = getFlag('--source-step') || '';
const taskId = getFlag('--task-id');
const parentPromptId = getFlag('--parent-prompt-id');
const queueSummary = getFlag('--queue-summary');
const requestedQueueState = getFlag('--queue-state');
const kind = getFlag('--kind');
const executionTarget = getFlag('--execution-target');
const notes = getFlag('--notes');
const createdBy = getFlag('--created-by');
const batchPromptIds = parseBatchPromptIds(getFlag('--batch-prompt-ids'));
const sprintId = getFlag('--sprint-id') || '';
const sprintPhaseId = getFlag('--sprint-phase-id') || '';
const sprintTaskId = getFlag('--sprint-task-id') || '';

if (!promptFile || !title || !task || !sourceDocument) {
  console.error('Missing required flags. Required: --prompt-file, --title, --task, --source-document.');
  process.exit(1);
}

if (!promptFile.startsWith('docs/prompts/items/')) {
  console.error('--prompt-file must live under docs/prompts/items/.');
  process.exit(1);
}

const promptFilePath = resolve(root, promptFile);
if (!existsSync(promptFilePath)) {
  console.error(`Prompt file does not exist: ${promptFile}`);
  process.exit(1);
}

const promptBody = readFileSync(promptFilePath, 'utf8');
const bodyFindings = validatePromptBodyText(promptBody, { id });
if (bodyFindings.length) {
  console.error(`Prompt body validation failed for ${id}:`);
  for (const finding of bodyFindings) console.error(`- ${finding}`);
  process.exit(1);
}

if (requestedQueueState && !['queued-pending', 'not-queued'].includes(requestedQueueState)) {
  console.error('Invalid --queue-state. Use queued-pending or not-queued.');
  process.exit(1);
}

if (sprintId || sprintPhaseId || sprintTaskId) {
  const { registry: sprintRegistry } = readSprintRegistry(root);
  if (sprintId && !sprintRegistry.sprints.find(sprint => sprint.id === sprintId)) {
    console.error(`Unknown --sprint-id: ${sprintId}`);
    process.exit(1);
  }
  if (sprintPhaseId && !sprintRegistry.phases.find(phase => phase.id === sprintPhaseId)) {
    console.error(`Unknown --sprint-phase-id: ${sprintPhaseId}`);
    process.exit(1);
  }
  if (sprintTaskId && !sprintRegistry.tasks.find(task => task.id === sprintTaskId)) {
    console.error(`Unknown --sprint-task-id: ${sprintTaskId}`);
    process.exit(1);
  }
}

try {
  await mutateRegistryLocked(root, registry => {
    const prompt = requirePrompt(registry, id);
    if (prompt.status !== 'reserved') {
      throw new Error(`Prompt ${id} is not reserved and cannot be finalized with prompt:create.`);
    }
    if (prompt.reservationReleasedAt) {
      throw new Error(`Prompt ${id} is a released reservation and cannot be finalized.`);
    }

    if (taskId && taskId !== prompt.taskId) {
      throw new Error(`Prompt ${id} was reserved for taskId ${prompt.taskId}; prompt:create cannot change it to ${taskId}.`);
    }
    if ((parentPromptId ?? '') !== '' && (parentPromptId ?? '') !== (prompt.parentPromptId ?? '')) {
      throw new Error(`Prompt ${id} was reserved with parentPromptId ${prompt.parentPromptId || 'none'}; prompt:create cannot change it to ${parentPromptId}.`);
    }
    if (createdBy && prompt.createdBy && createdBy !== prompt.createdBy) {
      throw new Error(`Prompt ${id} was reserved by ${prompt.createdBy}; prompt:create cannot change createdBy to ${createdBy}.`);
    }

    const finalTaskId = prompt.taskId || id;
    const finalParentPromptId = prompt.parentPromptId ?? '';
    if (finalParentPromptId) requirePrompt(registry, finalParentPromptId);
    for (const childId of batchPromptIds) requirePrompt(registry, childId);

    prompt.title = title;
    prompt.taskId = finalTaskId;
    prompt.parentPromptId = finalParentPromptId;
    prompt.batchPromptIds = batchPromptIds;
    prompt.sourceDocument = sourceDocument;
    prompt.sourceStep = sourceStep;
    prompt.task = task;
    prompt.executionTarget = executionTarget || prompt.executionTarget || 'Claude Code';
    prompt.status = 'created';
    prompt.reviewOutcome = 'pending';
    prompt.reviewIssues = '';
    prompt.queueState = requestedQueueState || (kind === 'manager' ? 'not-queued' : 'queued-pending');
    prompt.queueSummary = queueSummary || prompt.queueSummary || task;
    prompt.promptFile = promptFile;
    prompt.notes = notes || prompt.notes || '';
    prompt.kind = kind || prompt.kind || 'feature';
    if (prompt.kind === 'manager' && !requestedQueueState) prompt.queueState = 'not-queued';
    prompt.reservationReleasedAt = '';
    prompt.sprintId = sprintId;
    prompt.sprintPhaseId = sprintPhaseId;
    prompt.sprintTaskId = sprintTaskId;
  });

  console.log(`${id} → created`);
  console.log('Running prompts:refresh...');
  try {
    execSync('npm run prompts:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[prompt:create] prompts:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
