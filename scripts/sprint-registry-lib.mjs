import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readRegistry as readPromptRegistry } from './prompt-registry-lib.mjs';

export const SPRINTS_DIR = 'docs/mini-sprints';
export const SPRINT_REGISTRY_PATH = `${SPRINTS_DIR}/sprint-registry.json`;
export const SPRINT_STATUS_PATH = `${SPRINTS_DIR}/SPRINT_STATUS.md`;
export const SPRINT_LOCK_PATH = `${SPRINTS_DIR}/sprint-registry.lock`;

const VALID_SPRINT_STATUS = new Set([
  'planned',
  'active',
  'implementation-partial',
  'needs-review',
  'blocked',
  'completed',
  'completed-with-issues',
  'archived',
]);

const VALID_PHASE_STATUS = new Set([
  'planned',
  'active',
  'implementation-partial',
  'needs-review',
  'blocked',
  'completed',
  'completed-with-issues',
  'archived',
]);

const VALID_TASK_STATUS = new Set([
  'planned',
  'not-started',
  'implementation-partial',
  'implemented',
  'verified',
  'broken',
  'blocked',
  'deferred',
]);

const VALID_AUDIT_TYPES = new Set(['audit', 'research', 'implementation-review']);
const VALID_AUDIT_STATUS = new Set(['planned', 'present', 'superseded']);
const VALID_STEP_PRIORITIES = new Set(['critical', 'high', 'normal', 'low']);
const SPRINT_ID_RE = /^SPR-(\d+)$/;

export function sprintRegistryPaths(root = process.cwd()) {
  return {
    root,
    registry: resolve(root, SPRINT_REGISTRY_PATH),
    status: resolve(root, SPRINT_STATUS_PATH),
    lock: resolve(root, SPRINT_LOCK_PATH),
  };
}

export function ensureSprintRegistryFile(root = process.cwd()) {
  const paths = sprintRegistryPaths(root);
  mkdirSync(dirname(paths.registry), { recursive: true });
  if (!existsSync(paths.registry)) {
    writeFileSync(paths.registry, JSON.stringify({
      version: 1,
      allocator: { nextSprintNumber: 1 },
      sprints: [],
      phases: [],
      tasks: [],
    }, null, 2) + '\n');
  }
}

export function readSprintRegistry(root = process.cwd()) {
  ensureSprintRegistryFile(root);
  const paths = sprintRegistryPaths(root);
  const raw = JSON.parse(readFileSync(paths.registry, 'utf8'));
  if (raw.version !== 1) throw new Error(`Unsupported sprint registry version: ${raw.version}`);
  if (!Array.isArray(raw.sprints)) throw new Error('Sprint registry "sprints" must be an array');
  if (!Array.isArray(raw.phases)) throw new Error('Sprint registry "phases" must be an array');
  if (!Array.isArray(raw.tasks)) throw new Error('Sprint registry "tasks" must be an array');
  return { paths, registry: raw };
}

export function writeSprintRegistry(root, registry) {
  const paths = sprintRegistryPaths(root);
  mkdirSync(dirname(paths.registry), { recursive: true });
  writeFileSync(paths.registry, JSON.stringify(registry, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

export async function withSprintRegistryLock(root = process.cwd(), fn, options = {}) {
  const { paths } = readSprintRegistry(root);
  const timeoutMs = options.timeoutMs ?? 5000;
  const retryMs = options.retryMs ?? 50;
  const startedAt = Date.now();
  let fd = null;

  while (true) {
    try {
      fd = openSync(paths.lock, 'wx');
      writeFileSync(paths.lock, JSON.stringify({
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      }, null, 2) + '\n');
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        let lockHint = '';
        try {
          const stat = statSync(paths.lock);
          lockHint = ` Existing lock age: ${Math.round((Date.now() - stat.mtimeMs) / 1000)}s.`;
        } catch {
          lockHint = '';
        }
        throw new Error(`Timed out waiting for sprint registry lock at ${paths.lock}.${lockHint}`);
      }
      await sleep(retryMs);
    }
  }

  try {
    return await fn();
  } finally {
    try {
      if (fd !== null) closeSync(fd);
    } finally {
      try {
        unlinkSync(paths.lock);
      } catch {
        // Ignore cleanup races.
      }
    }
  }
}

export async function mutateSprintRegistryLocked(root = process.cwd(), mutator, options = {}) {
  return withSprintRegistryLock(root, async () => {
    const { registry } = readSprintRegistry(root);
    ensureSprintAllocator(registry);
    const result = await mutator(registry);
    if (result?.write !== false) writeSprintRegistry(root, registry);
    return result;
  }, options);
}

function parseSprintNumber(id) {
  const match = String(id ?? '').match(SPRINT_ID_RE);
  return match ? Number(match[1]) : null;
}

function formatSprintId(number) {
  return `SPR-${String(number).padStart(3, '0')}`;
}

export function ensureSprintAllocator(registry) {
  const currentMax = registry.sprints.reduce((max, sprint) => {
    const n = parseSprintNumber(sprint.id);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  if (!registry.allocator || typeof registry.allocator !== 'object') {
    registry.allocator = { nextSprintNumber: currentMax + 1 };
    return registry.allocator;
  }
  if (!Number.isInteger(registry.allocator.nextSprintNumber) || registry.allocator.nextSprintNumber <= currentMax) {
    registry.allocator.nextSprintNumber = currentMax + 1;
  }
  return registry.allocator;
}

export function reserveNextSprintId(registry) {
  const allocator = ensureSprintAllocator(registry);
  const id = formatSprintId(allocator.nextSprintNumber);
  allocator.nextSprintNumber += 1;
  return id;
}

function isIsoDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase();
}

function executionStateFromPrompt(prompt) {
  if (!prompt) return 'planned';
  if (prompt.status === 'reviewed') {
    if (prompt.reviewOutcome === 'issues found' || prompt.reviewOutcome === 'needs rework') return 'issues-found';
    if (prompt.reviewOutcome === 'passed with notes') return 'reviewed-with-notes';
    if (prompt.reviewOutcome === 'passed' || prompt.reviewOutcome === 'issues resolved') return 'reviewed-passed';
  }
  if (prompt.queueState === 'queued-started') return 'started';
  if (prompt.queueState === 'queued-run') return 'completed';
  if (prompt.queueState === 'queued-pending' || prompt.status === 'created') return 'prompt-created';
  return 'planned';
}

export function computeTaskExecution(task, promptById) {
  const linkedPrompts = uniqueStrings(task.linkedPromptIds).map(id => promptById.get(id)).filter(Boolean);
  const states = linkedPrompts.map(executionStateFromPrompt);
  const coverageState = linkedPrompts.length > 0 ? 'linked' : 'unlinked';

  let executionState = 'planned';
  if (states.includes('issues-found')) executionState = 'issues-found';
  else if (states.includes('started')) executionState = 'started';
  else if (states.includes('completed')) executionState = 'completed';
  else if (linkedPrompts.length > 0) {
    const allReviewed = linkedPrompts.every(prompt => prompt.status === 'reviewed');
    if (allReviewed) {
      executionState = states.includes('reviewed-with-notes') ? 'reviewed-with-notes' : 'reviewed-passed';
    } else {
      executionState = 'prompt-created';
    }
  }

  const promptCount = linkedPrompts.length;
  const promptReviewedCount = linkedPrompts.filter(prompt => prompt.status === 'reviewed').length;
  const promptUnreviewedCount = linkedPrompts.filter(prompt => prompt.status !== 'reviewed').length;

  return {
    coverageState,
    executionState,
    promptCount,
    promptReviewedCount,
    promptUnreviewedCount,
    linkedPrompts,
  };
}

function computeProgressSegments(tasks) {
  const counts = {
    planned: 0,
    promptCreated: 0,
    started: 0,
    completed: 0,
    reviewedPassed: 0,
    reviewedWithNotes: 0,
    issuesFound: 0,
    broken: 0,
    blocked: 0,
    partial: 0,
    verified: 0,
    implemented: 0,
  };

  for (const task of tasks) {
    switch (task._execution.executionState) {
      case 'prompt-created': counts.promptCreated += 1; break;
      case 'started': counts.started += 1; break;
      case 'completed': counts.completed += 1; break;
      case 'reviewed-passed': counts.reviewedPassed += 1; break;
      case 'reviewed-with-notes': counts.reviewedWithNotes += 1; break;
      case 'issues-found': counts.issuesFound += 1; break;
      default: counts.planned += 1; break;
    }
    switch (task.status) {
      case 'verified': counts.verified += 1; break;
      case 'implemented': counts.implemented += 1; break;
      case 'implementation-partial': counts.partial += 1; break;
      case 'broken': counts.broken += 1; break;
      case 'blocked': counts.blocked += 1; break;
      default: break;
    }
  }
  return counts;
}

export function buildSprintDashboardData(root = process.cwd()) {
  const { registry: sprintRegistry } = readSprintRegistry(root);
  const { registry: promptRegistry } = readPromptRegistry(root);
  const promptById = new Map(promptRegistry.prompts.map(prompt => [prompt.id, prompt]));
  const phasesBySprint = new Map();
  const tasksByPhase = new Map();
  const tasksBySprint = new Map();

  for (const phase of sprintRegistry.phases) {
    if (!phasesBySprint.has(phase.sprintId)) phasesBySprint.set(phase.sprintId, []);
    phasesBySprint.get(phase.sprintId).push(phase);
  }

  for (const task of sprintRegistry.tasks) {
    const enrichedTask = {
      ...task,
      linkedPromptIds: uniqueStrings(task.linkedPromptIds),
      dependencyTaskIds: uniqueStrings(task.dependencyTaskIds),
      auditRefs: task.auditRefs || [],
      _execution: computeTaskExecution(task, promptById),
    };
    if (!tasksByPhase.has(task.phaseId)) tasksByPhase.set(task.phaseId, []);
    tasksByPhase.get(task.phaseId).push(enrichedTask);
    if (!tasksBySprint.has(task.sprintId)) tasksBySprint.set(task.sprintId, []);
    tasksBySprint.get(task.sprintId).push(enrichedTask);
  }

  const sprints = sprintRegistry.sprints.map(sprint => {
    const phases = (phasesBySprint.get(sprint.id) || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(phase => ({
        ...phase,
        dependencyPhaseIds: uniqueStrings(phase.dependencyPhaseIds),
        tasks: (tasksByPhase.get(phase.id) || []).slice(),
      }));
    const tasks = tasksBySprint.get(sprint.id) || [];
    const linkedPromptIds = uniqueStrings([
      ...(sprint.unassignedPromptIds || []),
      ...tasks.flatMap(task => task.linkedPromptIds),
    ]);
    const linkedPrompts = linkedPromptIds.map(id => promptById.get(id)).filter(Boolean);
    const progress = computeProgressSegments(tasks);
    const totalTasks = tasks.length;
    const tasksWithPrompts = tasks.filter(task => task._execution.coverageState === 'linked').length;
    const planCoveragePct = totalTasks ? Math.round((tasksWithPrompts / totalTasks) * 100) : 0;
    const executionPct = totalTasks
      ? Math.round(((progress.reviewedPassed + progress.reviewedWithNotes) / totalTasks) * 100)
      : 0;
    const implementationPct = totalTasks
      ? Math.round(((progress.verified + progress.implemented) / totalTasks) * 100)
      : 0;

    return {
      ...sprint,
      dependencySprintIds: uniqueStrings(sprint.dependencySprintIds),
      auditRefs: sprint.auditRefs || [],
      recommendedNextSteps: sprint.recommendedNextSteps || [],
      phases,
      tasks,
      linkedPromptIds,
      linkedPrompts,
      planCoveragePct,
      executionPct,
      implementationPct,
      progress,
      totalTasks,
      promptsLinkedCount: linkedPromptIds.length,
      promptsUnreviewedCount: linkedPrompts.filter(prompt => prompt.status !== 'reviewed').length,
      unassignedPromptIds: uniqueStrings(sprint.unassignedPromptIds || []),
    };
  });

  return {
    sprintRegistry,
    promptRegistry,
    sprints,
  };
}

export function renderSprintStatus(root = process.cwd()) {
  const { sprints } = buildSprintDashboardData(root);
  const lines = [
    '# Sprint Status',
    '',
    '> Generated from `docs/mini-sprints/sprint-registry.json`, sprint markdown docs, and `docs/prompts/prompt-registry.json`. Do not hand-edit this file.',
    '',
    '## Sprint Index',
    '',
  ];

  for (const sprint of sprints) {
    lines.push(`- ${sprint.id} — ${sprint.title} (${sprint.status})`);
  }

  lines.push('', '## Detailed Status', '');

  for (const sprint of sprints) {
    lines.push(`## ${sprint.id} — ${sprint.title}`, '');
    lines.push(`- Source document: \`${sprint.sourceDocument}\``);
    lines.push(`- Status: \`${sprint.status}\``);
    lines.push(`- Tasks: ${sprint.totalTasks}`);
    lines.push(`- Plan coverage: ${sprint.planCoveragePct}%`);
    lines.push(`- Execution progress: ${sprint.executionPct}%`);
    lines.push(`- Implementation progress: ${sprint.implementationPct}%`);
    lines.push(`- Linked prompts: ${sprint.promptsLinkedCount}`);
    lines.push(`- Unreviewed linked prompts: ${sprint.promptsUnreviewedCount}`);
    if (sprint.completionSummary) lines.push(`- Summary: ${sprint.completionSummary}`);
    if (sprint.dependencySprintIds?.length) lines.push(`- Dependencies: ${sprint.dependencySprintIds.map(id => `\`${id}\``).join(', ')}`);
    if (sprint.auditRefs?.length) {
      lines.push('- Audits:');
      for (const audit of sprint.auditRefs) {
        lines.push(`  - \`${audit.sourceDocument}\` — ${audit.title} (${audit.status})`);
      }
    }
    if (sprint.recommendedNextSteps?.length) {
      lines.push('- Recommended next steps:');
      for (const step of sprint.recommendedNextSteps) {
        lines.push(`  - [${step.priority}] ${step.title}`);
      }
    }
    lines.push('- Tasks:');
    for (const task of sprint.tasks) {
      lines.push(`  - ${task.id} — ${task.title}`);
      lines.push(`    - Audit status: \`${task.status}\``);
      lines.push(`    - Execution state: \`${task._execution.executionState}\``);
      lines.push(`    - Linked prompts: ${task.linkedPromptIds.length ? task.linkedPromptIds.map(id => `\`${id}\``).join(', ') : 'none'}`);
    }
    if (sprint.unassignedPromptIds?.length) {
      lines.push(`- Unassigned sprint prompts: ${sprint.unassignedPromptIds.map(id => `\`${id}\``).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

export function validateSprintRegistry(root = process.cwd()) {
  const { paths, registry } = readSprintRegistry(root);
  const { registry: promptRegistry } = readPromptRegistry(root);
  const findings = [];

  const sprintIds = new Set();
  const phaseIds = new Set();
  const taskIds = new Set();
  const sprintById = new Map();
  const phaseById = new Map();
  const taskById = new Map();
  const promptById = new Map(promptRegistry.prompts.map(prompt => [prompt.id, prompt]));

  if (!registry.allocator || !Number.isInteger(registry.allocator.nextSprintNumber)) {
    findings.push('Sprint registry allocator is invalid.');
  }

  for (const sprint of registry.sprints) {
    if (!sprint.id) findings.push('Sprint missing id');
    if (sprint.id && sprintIds.has(sprint.id)) findings.push(`Duplicate sprint id: ${sprint.id}`);
    if (sprint.id) sprintIds.add(sprint.id);
    if (!sprint.title) findings.push(`Sprint ${sprint.id} missing title`);
    if (!VALID_SPRINT_STATUS.has(sprint.status)) findings.push(`Sprint ${sprint.id} has invalid status: ${sprint.status}`);
    if (!sprint.sourceDocument) findings.push(`Sprint ${sprint.id} missing sourceDocument`);
    else if (!existsSync(resolve(root, sprint.sourceDocument))) findings.push(`Sprint ${sprint.id} sourceDocument missing: ${sprint.sourceDocument}`);
    if (sprint.createdAt && !isIsoDateTime(sprint.createdAt)) findings.push(`Sprint ${sprint.id} has invalid createdAt`);
    if (sprint.updatedAt && !isIsoDateTime(sprint.updatedAt)) findings.push(`Sprint ${sprint.id} has invalid updatedAt`);
    for (const dep of sprint.dependencySprintIds || []) {
      if (dep === sprint.id) findings.push(`Sprint ${sprint.id} cannot depend on itself`);
    }
    for (const audit of sprint.auditRefs || []) {
      if (!audit.id) findings.push(`Sprint ${sprint.id} has audit ref missing id`);
      if (!VALID_AUDIT_TYPES.has(audit.type)) findings.push(`Sprint ${sprint.id} audit ${audit.id} has invalid type: ${audit.type}`);
      if (!VALID_AUDIT_STATUS.has(audit.status)) findings.push(`Sprint ${sprint.id} audit ${audit.id} has invalid status: ${audit.status}`);
    }
    for (const step of sprint.recommendedNextSteps || []) {
      if (!step.id) findings.push(`Sprint ${sprint.id} has recommended step missing id`);
      if (!VALID_STEP_PRIORITIES.has(step.priority)) findings.push(`Sprint ${sprint.id} recommended step ${step.id} has invalid priority: ${step.priority}`);
    }
    sprintById.set(sprint.id, sprint);
  }

  for (const phase of registry.phases) {
    if (!phase.id) findings.push('Phase missing id');
    if (phase.id && phaseIds.has(phase.id)) findings.push(`Duplicate phase id: ${phase.id}`);
    if (phase.id) phaseIds.add(phase.id);
    if (!VALID_PHASE_STATUS.has(phase.status)) findings.push(`Phase ${phase.id} has invalid status: ${phase.status}`);
    if (!sprintById.has(phase.sprintId)) findings.push(`Phase ${phase.id} references missing sprint ${phase.sprintId}`);
    phaseById.set(phase.id, phase);
  }

  for (const task of registry.tasks) {
    if (!task.id) findings.push('Task missing id');
    if (task.id && taskIds.has(task.id)) findings.push(`Duplicate task id: ${task.id}`);
    if (task.id) taskIds.add(task.id);
    if (!VALID_TASK_STATUS.has(task.status)) findings.push(`Task ${task.id} has invalid status: ${task.status}`);
    if (!sprintById.has(task.sprintId)) findings.push(`Task ${task.id} references missing sprint ${task.sprintId}`);
    if (!phaseById.has(task.phaseId)) findings.push(`Task ${task.id} references missing phase ${task.phaseId}`);
    for (const dep of task.dependencyTaskIds || []) {
      if (dep === task.id) findings.push(`Task ${task.id} cannot depend on itself`);
    }
    for (const promptId of task.linkedPromptIds || []) {
      if (!promptById.has(promptId)) findings.push(`Task ${task.id} references missing prompt ${promptId}`);
    }
    for (const audit of task.auditRefs || []) {
      if (!audit.id) findings.push(`Task ${task.id} has audit ref missing id`);
    }
    taskById.set(task.id, task);
  }

  for (const sprint of registry.sprints) {
    for (const phaseId of sprint.phaseIds || []) {
      if (!phaseById.has(phaseId)) findings.push(`Sprint ${sprint.id} references missing phase ${phaseId}`);
    }
    for (const dep of sprint.dependencySprintIds || []) {
      if (!sprintById.has(dep)) findings.push(`Sprint ${sprint.id} references missing dependency sprint ${dep}`);
    }
    for (const promptId of sprint.unassignedPromptIds || []) {
      if (!promptById.has(promptId)) findings.push(`Sprint ${sprint.id} has missing unassigned prompt ${promptId}`);
    }
    for (const step of sprint.recommendedNextSteps || []) {
      for (const taskId of step.linkedTaskIds || []) {
        if (!taskById.has(taskId)) findings.push(`Sprint ${sprint.id} recommended step ${step.id} references missing task ${taskId}`);
      }
      for (const promptId of step.suggestedPromptIds || []) {
        if (!promptById.has(promptId)) findings.push(`Sprint ${sprint.id} recommended step ${step.id} references missing prompt ${promptId}`);
      }
    }
  }

  for (const phase of registry.phases) {
    for (const taskId of phase.taskIds || []) {
      if (!taskById.has(taskId)) findings.push(`Phase ${phase.id} references missing task ${taskId}`);
    }
    for (const dep of phase.dependencyPhaseIds || []) {
      if (!phaseById.has(dep)) findings.push(`Phase ${phase.id} references missing dependency phase ${dep}`);
    }
  }

  for (const prompt of promptRegistry.prompts) {
    if (prompt.sprintId && !sprintById.has(prompt.sprintId)) findings.push(`Prompt ${prompt.id} references missing sprint ${prompt.sprintId}`);
    if (prompt.sprintPhaseId && !phaseById.has(prompt.sprintPhaseId)) findings.push(`Prompt ${prompt.id} references missing sprint phase ${prompt.sprintPhaseId}`);
    if (prompt.sprintTaskId && !taskById.has(prompt.sprintTaskId)) findings.push(`Prompt ${prompt.id} references missing sprint task ${prompt.sprintTaskId}`);
    if (prompt.sprintTaskId) {
      const task = taskById.get(prompt.sprintTaskId);
      if (task && !(task.linkedPromptIds || []).includes(prompt.id)) {
        findings.push(`Prompt ${prompt.id} points to sprint task ${prompt.sprintTaskId} but the task does not link back`);
      }
    }
  }

  return { paths, registry, findings };
}
