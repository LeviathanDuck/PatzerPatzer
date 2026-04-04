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
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { readRegistry as readPromptRegistry } from './prompt-registry-lib.mjs';

export const SPRINTS_DIR = 'docs/mini-sprints';
export const SPRINT_REGISTRY_PATH = `${SPRINTS_DIR}/sprint-registry.json`;
export const SPRINT_STATUS_PATH = `${SPRINTS_DIR}/SPRINT_STATUS.md`;
export const SPRINT_LOCK_PATH = `${SPRINTS_DIR}/sprint-registry.lock`;

const VALID_SPRINT_STATUS = new Set([
  'Needs Prompts',
  'Ready to Start',
  'In Progress',
  'Completed Needs Full Review',
  'Completed: With Issues',
  'Completed: Reviews Passed',
  'Superseded',
  'Retired',
  'planned',
  'active',
  'implementation-partial',
  'needs-review',
  'blocked',
  'completed',
  'completed-with-issues',
  'archived',
]);

// Terminal statuses that must not be overwritten by deriveSprintStatus.
// These are manually set and represent deliberate lifecycle decisions.
const TERMINAL_SPRINT_STATUSES = new Set(['Superseded', 'Retired']);

const VALID_PHASE_STATUS = new Set([
  'Incomplete Start State',
  'In Progress',
  'Completed',
  'Completed: Issues Found',
  'Completed: Review Passed',
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
  'No Prompt Exists Yet',
  'Prompts Created',
  'In Progress',
  'Prompt Complete',
  'Audit Found Mismatch',
  'Audit Confirmed Done',
  'Not Ready Yet',
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
const VALID_PANEL_NOTE_KEYS = new Set(['audit', 'mismatch', 'nextPhase', 'appendRequest']);
const SPRINT_ID_RE = /^SPR-(\d+)$/;
const PHASE_HEADING_RE = /^#{2,3}\s+Phase\s+([0-9]+(?:\.[0-9]+)?)\s*[—:-]\s+(.+)$/gm;
const TASK_HEADING_RE = /^###\s+Task\s+([0-9]+(?:\.[0-9a-z]+)?)\s*[:—-]\s+(.+)$/gm;

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

function isSupervisoryPrompt(prompt) {
  if (!prompt) return false;
  if (prompt.kind === 'manager' || prompt.category === 'manager') return true;
  const sourceStep = String(prompt.sourceStep || '').toLowerCase();
  const title = String(prompt.title || '').toLowerCase();
  const task = String(prompt.task || '').toLowerCase();
  return sourceStep.includes('integration review')
    || sourceStep.includes('sprint review')
    || sourceStep.includes('sprint audit')
    || title.includes('review')
    || task.includes('full sprint');
}

function computeUnassignedSprintPromptIds(promptIds, assignedPromptIds, promptById) {
  return uniqueStrings(promptIds).filter(id => {
    if (assignedPromptIds.has(id)) return false;
    const prompt = promptById.get(id);
    return !isSupervisoryPrompt(prompt);
  });
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase();
}

function normalizePanelHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const body = String(entry.body ?? '').trim();
  if (!body) return null;
  const normalized = { body };
  if (entry.archivedAt) normalized.archivedAt = String(entry.archivedAt);
  return normalized;
}

function normalizePanelNote(note) {
  if (!note || typeof note !== 'object') return null;
  const text = String(note.text ?? '').trim();
  const currentBody = String(note.currentBody ?? '').trim();
  const history = Array.isArray(note.history)
    ? note.history.map(normalizePanelHistoryEntry).filter(Boolean)
    : [];
  const supersededVersionIds = Array.isArray(note.supersededVersionIds)
    ? note.supersededVersionIds.filter(id => typeof id === 'string' && id)
    : [];
  const normalized = {};
  if (text) normalized.text = text;
  if (currentBody) normalized.currentBody = currentBody;
  if (note.updatedAt) normalized.updatedAt = String(note.updatedAt);
  if (note.lastEditedAt) normalized.lastEditedAt = String(note.lastEditedAt);
  if (history.length) normalized.history = history;
  if (supersededVersionIds.length) normalized.supersededVersionIds = supersededVersionIds;
  return Object.keys(normalized).length ? normalized : null;
}

export function nextSprintPanelRetiredId(registry, sprintId, panel) {
  const prefix = `RETIRED-SPRINT-PANEL-DONOTRUN-REFERENCE-ONLY-${sprintId}-${panel}-V`;
  let max = 0;
  for (const sprint of registry.sprints) {
    if (typeof sprint.id === 'string' && sprint.id.startsWith(prefix)) {
      const n = parseInt(sprint.id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return prefix + (max + 1);
}

function normalizePanelNotes(value) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  for (const key of VALID_PANEL_NOTE_KEYS) {
    const note = normalizePanelNote(value[key]);
    if (note) normalized[key] = note;
  }
  return normalized;
}

export function hasNormalizedSprintStructure(text) {
  const phases = [...String(text ?? '').matchAll(PHASE_HEADING_RE)];
  if (!phases.length) return false;
  return phases.every((match, idx, arr) => {
    const source = String(text ?? '');
    const start = (match.index ?? 0) + match[0].length;
    const end = idx + 1 < arr.length ? (arr[idx + 1].index ?? source.length) : source.length;
    const body = source.slice(start, end);
    if ([...body.matchAll(TASK_HEADING_RE)].length > 0) return true;
    if (/^- CCP-\d+(?:-F\d+)?\s+[—-]\s+/m.test(body)) return true;
    return /\|\s*CCP\s*\|/i.test(body);
  });
}

function fmtPath(path) {
  return String(path ?? '').replace(/\\/g, '/');
}

export function normalizeRepoPath(root = process.cwd(), path = '') {
  const raw = String(path ?? '').trim();
  if (!raw) return '';
  const absolute = isAbsolute(raw) ? raw : resolve(root, raw);
  const repoRelative = fmtPath(relative(root, absolute));
  if (!repoRelative || repoRelative.startsWith('..')) return fmtPath(absolute);
  return repoRelative;
}

function readSprintDocText(root, sprint) {
  try {
    return readFileSync(resolve(root, sprint.sourceDocument), 'utf8');
  } catch {
    return '';
  }
}

function promptStateOrder(state) {
  switch (state) {
    case 'Not Ready Yet': return 0;
    case 'No Prompt Exists Yet': return 1;
    case 'Prompts Created': return 2;
    case 'In Progress': return 3;
    case 'Prompt Complete': return 4;
    case 'Audit Found Mismatch': return 5;
    case 'Audit Confirmed Done': return 6;
    default: return -1;
  }
}

function slugStatus(status) {
  return String(status ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function derivePromptLifecycleState(linkedPrompts) {
  if (!linkedPrompts.length) return 'No Prompt Exists Yet';
  if (linkedPrompts.every(prompt => prompt.queueState === 'queued-run' || prompt.status === 'reviewed')) return 'Prompt Complete';
  if (linkedPrompts.some(prompt => prompt.queueState === 'queued-started')) return 'In Progress';
  return 'Prompts Created';
}

function latestAuditRef(sprint) {
  const refs = [...(sprint.auditRefs || [])];
  return refs
    .filter(audit => audit?.date || audit?.sourceDocument || audit?.id)
    .sort((a, b) => {
      const aDate = Date.parse(a.date || '') || 0;
      const bDate = Date.parse(b.date || '') || 0;
      return bDate - aDate || String(b.id || '').localeCompare(String(a.id || ''));
    })[0] || null;
}

function deriveTaskState(task, phaseAvailable) {
  if (task.auditState === 'Audit Found Mismatch') return 'Audit Found Mismatch';
  if (task.auditState === 'Audit Confirmed Done') return 'Audit Confirmed Done';
  if (!phaseAvailable) return 'Not Ready Yet';
  return task._execution.promptLifecycleState;
}

function phaseFullyPromptCompleted(phase) {
  if (!phase.tasks.length) return false;
  return phase.tasks.every(task =>
    task._execution.promptLifecycleState === 'Prompt Complete' ||
    task.auditState === 'Audit Confirmed Done',
  );
}

function derivePhaseStatus(tasks) {
  const states = tasks.map(task => task.currentState);
  if (!states.length) return 'Incomplete Start State';
  if (states.includes('Audit Found Mismatch')) return 'Completed: Issues Found';
  if (states.every(state => state === 'Audit Confirmed Done')) return 'Completed: Review Passed';
  if (states.every(state => state === 'Prompt Complete' || state === 'Audit Confirmed Done')) return 'Completed';
  if (states.includes('In Progress')) return 'In Progress';
  return 'Incomplete Start State';
}

function deriveSprintStatus(phases, nextAvailablePhase) {
  if (!phases.length) return 'Needs Prompts';
  const phaseStatuses = phases.map(phase => phase.currentStatus);
  if (phaseStatuses.includes('Completed: Issues Found')) return 'Completed: With Issues';
  if (phaseStatuses.every(status => status === 'Completed: Review Passed')) return 'Completed: Reviews Passed';
  if (phaseStatuses.every(status => status === 'Completed' || status === 'Completed: Review Passed')) {
    return 'Completed Needs Full Review';
  }
  if (nextAvailablePhase) {
    const nextStates = nextAvailablePhase.tasks.map(task => task.currentState);
    if (nextStates.length && nextStates.every(state => state === 'No Prompt Exists Yet')) return 'Needs Prompts';
    if (nextStates.some(state => state === 'Prompts Created') && !nextStates.some(state => state === 'In Progress')) {
      return 'Ready to Start';
    }
  }
  return 'In Progress';
}

function buildSprintAuditPromptTemplate(root, sprint) {
  const latestAudit = latestAuditRef(sprint);
  const linkedPromptIds = sprint.linkedPromptIds || [];
  const sourceSprintDoc = normalizeRepoPath(root, sprint.sourceDocument || '');
  const currentTaskLines = sprint.phases.flatMap(phase =>
    phase.tasks.map(task => {
      const linked = task.linkedPromptIds.length ? ` | linked: ${task.linkedPromptIds.join(', ')}` : '';
      const notes = task.notes ? ` | notes: ${task.notes}` : '';
      return `- ${task.id} — ${task.title} [${task.currentState}]${linked}${notes}`;
    }),
  );

  return [
    'Audit this sprint against our current sprint workflow, prompt workflow, and implementation reality.',
    '',
    `Sprint ID: ${sprint.id}`,
    `Sprint Title: ${sprint.title}`,
    `Source Sprint Doc: ${sourceSprintDoc || 'unknown'}`,
    `Current Sprint Status: ${sprint.currentStatus}`,
    `Normalization Ready: ${sprint.normalizedStructure ? 'yes' : 'no'}`,
    `Next Available Phase: ${sprint.nextAvailablePhase ? `${sprint.nextAvailablePhase.id} — ${sprint.nextAvailablePhase.title}` : 'none'}`,
    `Latest Audit: ${latestAudit ? `${latestAudit.title} (${normalizeRepoPath(root, latestAudit.sourceDocument || '')})` : 'none'}`,
    `Linked Prompt IDs: ${linkedPromptIds.length ? linkedPromptIds.join(', ') : 'none'}`,
    `Unassigned Prompt IDs: ${(sprint.unassignedPromptIds || []).length ? sprint.unassignedPromptIds.join(', ') : 'none'}`,
    '',
    'Current phase/task state snapshot:',
    ...currentTaskLines,
    '',
    'Required audit work:',
    '- compare the sprint markdown doc, sprint registry, linked prompts, codebase reality, and review findings',
    '- confirm whether the sprint markdown doc is normalized to the current sprint workflow',
    '- identify prompt coverage gaps, implementation gaps, and tracking drift',
    '- explicitly decide which tasks are Audit Confirmed Done and which are Audit Found Mismatch',
    '- RULE: a task with implementation evidence of Partial or Not started MUST be Audit Found Mismatch — the only exception is if the task is intentionally deferred to a future sprint, in which case you must state that explicitly and record why',
    '- RULE: Audit Confirmed Done requires confirmed implementation evidence in the codebase, not just a completed or reviewed prompt',
    '- update the sprint registry so the latest audit becomes the manager of sprint truth',
    '- refresh the sprint dashboard outputs after the audit update completes',
  ].join('\n');
}

function buildMismatchFollowUpTemplate(root, sprint) {
  const mismatchTasks = sprint.phases.flatMap(phase =>
    phase.tasks.filter(task => task.auditState === 'Audit Found Mismatch'),
  );
  if (mismatchTasks.length === 0) return '';
  const sourceSprintDoc = normalizeRepoPath(root, sprint.sourceDocument || '');
  const taskLines = mismatchTasks.map(task => {
    const anchor = task.sourceAnchor ? ` (${task.sourceAnchor})` : '';
    const gap = task.notes ? ` | gap: ${task.notes}` : '';
    const linked = task.linkedPromptIds?.length ? ` | previously linked: ${task.linkedPromptIds.join(', ')}` : '';
    return `- ${task.id}${anchor}${gap}${linked}`;
  });
  return [
    'Create follow-up tracked prompts to complete the unfinished work in this sprint.',
    '',
    'These tasks were marked Audit Found Mismatch — implementation evidence shows them as Partial or Not started despite prompt completion.',
    '',
    `Sprint ID: ${sprint.id}`,
    `Sprint Title: ${sprint.title}`,
    `Source Sprint Doc: ${sourceSprintDoc || 'unknown'}`,
    '',
    'Mismatch tasks requiring follow-up prompts:',
    ...taskLines,
    '',
    'Required rules:',
    '- use our tracked prompt process to create one follow-up prompt per task',
    '- every prompt must include exact sprint linkage: sprintId, sprintPhaseId, sprintTaskId',
    '- each prompt body must describe what was partially or not implemented and what still needs to be built',
    '- reference the sprint source doc for the original acceptance criteria',
    '- do not recreate the original prompt — create a follow-up that completes only what is missing',
    '- report the created prompt IDs at the end',
  ].join('\n');
}

function buildNextPromptsTemplate(root, sprint) {
  const phase = sprint.nextAvailablePhase;
  if (!phase || !sprint.showNextPromptPanel) return '';
  const sourceSprintDoc = normalizeRepoPath(root, sprint.sourceDocument || '');
  const needingPrompts = phase.tasks.filter(task => task.currentState === 'No Prompt Exists Yet');
  const coveredTasks = phase.tasks.filter(task => task.currentState !== 'No Prompt Exists Yet');

  return [
    'Create the next tracked prompts for this sprint phase using our prompt workflow.',
    '',
    `Sprint ID: ${sprint.id}`,
    `Sprint Title: ${sprint.title}`,
    `Source Sprint Doc: ${sourceSprintDoc || 'unknown'}`,
    `Sprint Phase ID: ${phase.id}`,
    `Sprint Phase Title: ${phase.title}`,
    '',
    'Tasks in this next available phase that still need prompts:',
    ...(needingPrompts.length
      ? needingPrompts.map(task => `- ${task.id} — ${task.title} [${task.currentState}]`)
      : ['- none']),
    '',
    'Tasks in this same phase that already have linked prompts:',
    ...(coveredTasks.length
      ? coveredTasks.map(task => `- ${task.id} — ${task.title} [${task.currentState}] | linked prompts: ${task.linkedPromptIds.join(', ') || 'none'}`)
      : ['- none']),
    '',
    'Required rules:',
    '- create prompts one by one using our tracked prompt process',
    '- every sprint prompt must include exact sprint linkage: sprintId, sprintPhaseId, sprintTaskId',
    '- do not recreate prompts for already-covered tasks unless required to meet the full scope of the phase',
    '- audit already-created prompts for this phase and ensure they still line up with current sprint direction',
    '- use the sprint source document and exact phase/task ids when creating the prompts',
    '- report the created prompt ids and any remaining phase gaps at the end',
  ].join('\n');
}

function buildPhaseNextPromptsTemplate(root, sprint, phase) {
  const sourceSprintDoc = normalizeRepoPath(root, sprint.sourceDocument || '');
  const needingPrompts = phase.tasks.filter(task => task.currentState === 'No Prompt Exists Yet');
  const blockedTasks = phase.tasks.filter(task => task.currentState === 'Not Ready Yet');
  const coveredTasks = phase.tasks.filter(
    task => task.currentState !== 'No Prompt Exists Yet' && task.currentState !== 'Not Ready Yet',
  );
  const phaseReadyLine = phase.isAvailable
    ? 'This phase is currently available for prompt creation.'
    : 'This phase is not ready yet because earlier sprint phases are not fully prompt-complete.';

  return [
    'Create tracked prompts for this exact sprint phase using our prompt workflow.',
    '',
    `Sprint ID: ${sprint.id}`,
    `Sprint Title: ${sprint.title}`,
    `Source Sprint Doc: ${sourceSprintDoc || 'unknown'}`,
    `Sprint Phase ID: ${phase.id}`,
    `Sprint Phase Title: ${phase.title}`,
    '',
    `Phase readiness: ${phaseReadyLine}`,
    '',
    'Tasks in this phase that still need prompts:',
    ...(needingPrompts.length
      ? needingPrompts.map(task => `- ${task.id} — ${task.title} [${task.currentState}]`)
      : ['- none']),
    '',
    'Tasks in this phase that are not ready yet because earlier phases are incomplete:',
    ...(blockedTasks.length
      ? blockedTasks.map(task => `- ${task.id} — ${task.title} [${task.currentState}]`)
      : ['- none']),
    '',
    'Tasks in this phase that are already covered by linked prompts or audits:',
    ...(coveredTasks.length
      ? coveredTasks.map(task => `- ${task.id} — ${task.title} [${task.currentState}] | linked prompts: ${task.linkedPromptIds.join(', ') || 'none'}`)
      : ['- none']),
    '',
    'Required rules:',
    '- create prompts one by one using our tracked prompt process',
    '- every sprint prompt must include exact sprint linkage: sprintId, sprintPhaseId, sprintTaskId',
    '- do not recreate already-covered prompts unless a new follow-up is genuinely needed to complete remaining scope',
    '- use the exact sprint id, exact phase id, exact task id, and source sprint doc when creating prompts',
    '- if this phase is not ready yet, keep the output truthful about that dependency state instead of pretending it is ready to run',
    '- report any created prompt ids plus any remaining gaps or blocked tasks at the end',
  ].join('\n');
}

function buildAppendRequestTemplate(root, sprint) {
  const sourceSprintDoc = normalizeRepoPath(root, sprint.sourceDocument || '');
  const nextPhaseLine = sprint.nextAvailablePhase
    ? `${sprint.nextAvailablePhase.id} — ${sprint.nextAvailablePhase.title}`
    : 'none';
  const latestAudit = latestAuditRef(sprint);
  const recommended = (sprint.recommendedNextSteps || []).map(step =>
    `- [${step.priority}] ${step.title}${step.reason ? ` — ${step.reason}` : ''}`,
  );
  const mismatchTasks = (sprint.tasks || []).filter(task => task.auditState === 'Audit Found Mismatch');
  const mismatchLines = mismatchTasks.map(task => {
    const anchor = task.sourceAnchor ? ` (${task.sourceAnchor})` : '';
    const notes = task.notes ? ` — ${task.notes}` : '';
    return `- ${task.id}${anchor}: ${task.title}${notes}`;
  });

  return [
    'Review this sprint and officially append or update sprint scope through our sprint workflow.',
    '',
    `Sprint ID: ${sprint.id}`,
    `Sprint Title: ${sprint.title}`,
    `Source Sprint Doc: ${sourceSprintDoc || 'unknown'}`,
    `Current Sprint Status: ${sprint.currentStatus}`,
    `Next Available Phase: ${nextPhaseLine}`,
    `Normalized Structure: ${sprint.normalizedStructure ? 'yes' : 'no'}`,
    `Latest Audit: ${latestAudit ? `${latestAudit.title} (${normalizeRepoPath(root, latestAudit.sourceDocument || '')})` : 'none'}`,
    '',
    'Requested sprint change:',
    '- describe the feature, scope change, or implementation request here',
    '',
    'Required workflow:',
    '- review the current sprint markdown doc, sprint registry entry, linked prompts, and latest audit context',
    '- decide whether the request belongs in this sprint right now or should be deferred',
    '- if it belongs, update the sprint in the official workflow while preserving normalized phase/task structure',
    '- update sprint phases/tasks only where needed, keeping ids and existing linkage stable where possible',
    '- update the sprint registry and regenerate sprint outputs if you change the sprint plan',
    '- if the request should not be added, explain why and suggest the correct next step',
    ...(mismatchTasks.length ? [
      '',
      'Current mismatch tasks (Audit Found Mismatch):',
      ...mismatchLines,
      '',
      'Mismatch resolution workflow:',
      '- if the requested change resolves any mismatch tasks, inspect the implementation for each resolved task',
      '- confirm implementation evidence exists in the codebase before marking any task as resolved',
      '- after confirming, run:',
      `  npm run sprint:audit:complete -- --sprint-id ${sprint.id} --audit-document docs/audits/<AUDIT-DOC>.md --title "<title>" --findings "<what was found>" --task-outcomes "${mismatchTasks.map(t => `${t.id}:Audit Confirmed Done`).join('|')}"`,
      '- replace task outcomes with the correct state for each task: Audit Confirmed Done or Audit Found Mismatch',
      '- only mark Audit Confirmed Done when implementation evidence is confirmed — do not mark done based on prompt completion alone',
    ] : []),
    '',
    'Current recommended next steps:',
    ...(recommended.length ? recommended : ['- none']),
  ].join('\n');
}

function renderPromptTemplate(defaultTemplate, noteText) {
  const normalizedDefault = String(defaultTemplate || '').trim();
  const normalizedNote = String(noteText || '').trim();
  if (!normalizedNote) return normalizedDefault;
  return [
    normalizedDefault,
    '',
    'Additional user context:',
    normalizedNote,
  ].join('\n');
}

function renderPanelBody(defaultTemplate, panelData) {
  const normalizedDefault = String(defaultTemplate || '').trim();
  const savedBody = String(panelData?.currentBody ?? '').trim();
  if (savedBody) return savedBody;
  return renderPromptTemplate(normalizedDefault, panelData?.text);
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
  const promptLifecycleState = derivePromptLifecycleState(linkedPrompts);

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
    promptLifecycleState,
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

  const sprints = sprintRegistry.sprints.filter(sprint => !sprint.hiddenFromDashboard).map(sprint => {
    const sprintDocText = readSprintDocText(root, sprint);
    const normalizedStructure = sprint.normalizedStructure === true || hasNormalizedSprintStructure(sprintDocText);
    const phases = (phasesBySprint.get(sprint.id) || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(phase => ({
        ...phase,
        dependencyPhaseIds: uniqueStrings(phase.dependencyPhaseIds),
        tasks: (tasksByPhase.get(phase.id) || []).slice(),
      }));
    let priorPhasesPromptComplete = true;
    let nextAvailablePhase = null;
    for (const phase of phases) {
      phase.isAvailable = priorPhasesPromptComplete;
      phase.isPromptComplete = phaseFullyPromptCompleted(phase);
      for (const task of phase.tasks) {
        task.currentState = deriveTaskState(task, phase.isAvailable);
      }
      phase.currentStatus = derivePhaseStatus(phase.tasks);
      phase.nextPromptsTemplateDefault = buildPhaseNextPromptsTemplate(root, sprint, phase);
      phase.nextPromptsTemplate = phase.nextPromptsTemplateDefault;
      if (!nextAvailablePhase && phase.isAvailable && !phase.isPromptComplete) {
        nextAvailablePhase = phase;
      }
      if (!phase.isPromptComplete) priorPhasesPromptComplete = false;
    }
    const tasks = tasksBySprint.get(sprint.id) || [];
    const unassignedPromptIds = computeUnassignedSprintPromptIds(
      sprint.unassignedPromptIds || [],
      new Set(tasks.flatMap(task => task.linkedPromptIds)),
      promptById,
    );
    const linkedPromptIds = uniqueStrings([
      ...unassignedPromptIds,
      ...tasks.flatMap(task => task.linkedPromptIds),
    ]);
    const linkedPrompts = linkedPromptIds.map(id => promptById.get(id)).filter(Boolean);
    const progress = computeProgressSegments(tasks);
    const totalTasks = tasks.length;
    const tasksWithPrompts = tasks.filter(task => task._execution.coverageState === 'linked').length;
    const planCoveragePct = totalTasks ? Math.round((tasksWithPrompts / totalTasks) * 100) : 0;
    const promptCompleteCount = tasks.filter(task => task.currentState === 'Prompt Complete' || task.currentState === 'Audit Confirmed Done').length;
    const auditConfirmedCount = tasks.filter(task => task.currentState === 'Audit Confirmed Done').length;
    const executionPct = totalTasks ? Math.round((promptCompleteCount / totalTasks) * 100) : 0;
    const implementationPct = totalTasks ? Math.round((auditConfirmedCount / totalTasks) * 100) : 0;
    const tasksNeedingPrompts = nextAvailablePhase
      ? nextAvailablePhase.tasks.filter(task => task.currentState === 'No Prompt Exists Yet')
      : [];
    const nextPhaseCoveredTasks = nextAvailablePhase
      ? nextAvailablePhase.tasks.filter(task => task.currentState !== 'No Prompt Exists Yet')
      : [];
    const showNormalizationWarning = !normalizedStructure;
    const isTerminal = TERMINAL_SPRINT_STATUSES.has(sprint.status);
    const showNextPromptPanel = !isTerminal && normalizedStructure && !!nextAvailablePhase && tasksNeedingPrompts.length > 0;
    const currentStatus = deriveSprintStatus(phases, nextAvailablePhase);
    const panelNotes = normalizePanelNotes(sprint.panelNotes);
    const auditPromptTemplateDefault = buildSprintAuditPromptTemplate(root, {
      ...sprint,
      currentStatus,
      phases,
      tasks,
      linkedPromptIds,
      normalizedStructure,
      nextAvailablePhase,
      unassignedPromptIds,
    });
    const nextPromptsTemplateDefault = buildNextPromptsTemplate(root, {
      ...sprint,
      nextAvailablePhase,
      showNextPromptPanel,
      sourceDocument: sprint.sourceDocument,
      id: sprint.id,
      title: sprint.title,
    });
    const mismatchTasks = tasks.filter(task => task.auditState === 'Audit Found Mismatch');
    const showMismatchPanel = !isTerminal && mismatchTasks.length > 0;
    const mismatchFollowUpTemplateDefault = buildMismatchFollowUpTemplate(root, {
      ...sprint,
      phases,
      id: sprint.id,
      title: sprint.title,
      sourceDocument: sprint.sourceDocument,
    });
    const appendRequestTemplateDefault = buildAppendRequestTemplate(root, {
      ...sprint,
      currentStatus,
      phases,
      tasks,
      recommendedNextSteps: sprint.recommendedNextSteps || [],
      normalizedStructure,
      nextAvailablePhase,
    });
    const auditPromptTemplateRendered = renderPanelBody(auditPromptTemplateDefault, panelNotes.audit);
    const nextPromptsTemplateRendered = renderPanelBody(nextPromptsTemplateDefault, panelNotes.nextPhase);
    const mismatchFollowUpTemplateRendered = renderPanelBody(mismatchFollowUpTemplateDefault, panelNotes.mismatch);
    const appendRequestTemplateRendered = renderPanelBody(appendRequestTemplateDefault, panelNotes.appendRequest);

    return {
      ...sprint,
      panelNotes,
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
      currentStatus,
      normalizedStructure,
      showNormalizationWarning,
      showNextPromptPanel,
      nextAvailablePhase: nextAvailablePhase
        ? {
            id: nextAvailablePhase.id,
            title: nextAvailablePhase.title,
            order: nextAvailablePhase.order,
          }
        : null,
      nextPhaseTasks: nextAvailablePhase
        ? nextAvailablePhase.tasks.map(task => ({
            id: task.id,
            title: task.title,
            currentState: task.currentState,
            linkedPromptIds: task.linkedPromptIds,
          }))
        : [],
      tasksNeedingPrompts: tasksNeedingPrompts.map(task => ({
        id: task.id,
        title: task.title,
        currentState: task.currentState,
        linkedPromptIds: task.linkedPromptIds,
      })),
      nextPhaseCoveredTasks: nextPhaseCoveredTasks.map(task => ({
        id: task.id,
        title: task.title,
        currentState: task.currentState,
        linkedPromptIds: task.linkedPromptIds,
      })),
      auditPromptTemplate: auditPromptTemplateRendered,
      auditPromptTemplateDefault,
      auditPromptTemplateRendered,
      nextPromptsTemplate: nextPromptsTemplateRendered,
      nextPromptsTemplateDefault,
      nextPromptsTemplateRendered,
      showMismatchPanel,
      mismatchTasks: mismatchTasks.map(task => ({
        id: task.id,
        title: task.title,
        sourceAnchor: task.sourceAnchor || '',
        notes: task.notes || '',
        linkedPromptIds: task.linkedPromptIds,
      })),
      mismatchFollowUpTemplate: mismatchFollowUpTemplateRendered,
      mismatchFollowUpTemplateDefault,
      mismatchFollowUpTemplateRendered,
      appendRequestTemplateDefault,
      appendRequestTemplateRendered,
      promptsLinkedCount: linkedPromptIds.length,
      promptsUnreviewedCount: linkedPrompts.filter(prompt => prompt.status !== 'reviewed').length,
      unassignedPromptIds,
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
    lines.push(`- ${sprint.id} — ${sprint.title} (${sprint.currentStatus})`);
  }

  lines.push('', '## Detailed Status', '');

  for (const sprint of sprints) {
    lines.push(`## ${sprint.id} — ${sprint.title}`, '');
    lines.push(`- Source document: \`${sprint.sourceDocument}\``);
    lines.push(`- Status: \`${sprint.currentStatus}\``);
    lines.push(`- Normalized structure: ${sprint.normalizedStructure ? 'yes' : 'no'}`);
    lines.push(`- Tasks: ${sprint.totalTasks}`);
    lines.push(`- Plan coverage: ${sprint.planCoveragePct}%`);
    lines.push(`- Execution progress: ${sprint.executionPct}%`);
    lines.push(`- Implementation progress: ${sprint.implementationPct}%`);
    lines.push(`- Linked prompts: ${sprint.promptsLinkedCount}`);
    lines.push(`- Unreviewed linked prompts: ${sprint.promptsUnreviewedCount}`);
    if (sprint.nextAvailablePhase) {
      lines.push(`- Next available phase: \`${sprint.nextAvailablePhase.id}\` — ${sprint.nextAvailablePhase.title}`);
    }
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
      lines.push(`    - Task state: \`${task.currentState}\``);
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
    if (sprint.hiddenFromDashboard && sprint.retiredReferenceOnly) continue;
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
      if (audit.sourceDocument && isAbsolute(audit.sourceDocument)) {
        findings.push(`Sprint ${sprint.id} audit ${audit.id} must use a repo-relative sourceDocument, not an absolute path.`);
      } else if (audit.sourceDocument && !existsSync(resolve(root, audit.sourceDocument))) {
        findings.push(`Sprint ${sprint.id} audit ${audit.id} sourceDocument missing: ${audit.sourceDocument}`);
      }
    }
    for (const step of sprint.recommendedNextSteps || []) {
      if (!step.id) findings.push(`Sprint ${sprint.id} has recommended step missing id`);
      if (!VALID_STEP_PRIORITIES.has(step.priority)) findings.push(`Sprint ${sprint.id} recommended step ${step.id} has invalid priority: ${step.priority}`);
    }
    const panelNotes = sprint.panelNotes;
    if (panelNotes != null) {
      if (typeof panelNotes !== 'object' || Array.isArray(panelNotes)) {
        findings.push(`Sprint ${sprint.id} panelNotes must be an object when present.`);
      } else {
        for (const [panelKey, note] of Object.entries(panelNotes)) {
          if (!VALID_PANEL_NOTE_KEYS.has(panelKey)) {
            findings.push(`Sprint ${sprint.id} has unsupported panelNotes key: ${panelKey}`);
            continue;
          }
          if (!note || typeof note !== 'object' || Array.isArray(note)) {
            findings.push(`Sprint ${sprint.id} panel note ${panelKey} must be an object.`);
            continue;
          }
          if (!String(note.text ?? '').trim()) {
            if (!String(note.currentBody ?? '').trim()) {
              findings.push(`Sprint ${sprint.id} panel note ${panelKey} is missing text/currentBody.`);
            }
          }
          if (note.updatedAt && !isIsoDateTime(note.updatedAt)) {
            findings.push(`Sprint ${sprint.id} panel note ${panelKey} has invalid updatedAt.`);
          }
          if (note.lastEditedAt && !isIsoDateTime(note.lastEditedAt)) {
            findings.push(`Sprint ${sprint.id} panel note ${panelKey} has invalid lastEditedAt.`);
          }
          if (note.history != null) {
            if (!Array.isArray(note.history)) {
              findings.push(`Sprint ${sprint.id} panel note ${panelKey} history must be an array.`);
            } else {
              for (const [index, entry] of note.history.entries()) {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                  findings.push(`Sprint ${sprint.id} panel note ${panelKey} history entry ${index} must be an object.`);
                  continue;
                }
                if (!String(entry.body ?? '').trim()) {
                  findings.push(`Sprint ${sprint.id} panel note ${panelKey} history entry ${index} is missing body.`);
                }
                if (entry.archivedAt && !isIsoDateTime(entry.archivedAt)) {
                  findings.push(`Sprint ${sprint.id} panel note ${panelKey} history entry ${index} has invalid archivedAt.`);
                }
              }
            }
          }
        }
      }
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
      if (audit.sourceDocument && isAbsolute(audit.sourceDocument)) {
        findings.push(`Task ${task.id} audit ${audit.id} must use a repo-relative sourceDocument, not an absolute path.`);
      }
    }
    if (task.auditState && !['Audit Found Mismatch', 'Audit Confirmed Done'].includes(task.auditState)) {
      findings.push(`Task ${task.id} has invalid auditState: ${task.auditState}`);
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
    if (prompt.sprintId || prompt.sprintPhaseId || prompt.sprintTaskId) {
      if (!prompt.sprintId || !prompt.sprintPhaseId || !prompt.sprintTaskId) {
        findings.push(`Sprint-linked prompt ${prompt.id} is missing exact sprint linkage fields.`);
      }
    }
    if (prompt.sprintTaskId) {
      const task = taskById.get(prompt.sprintTaskId);
      if (task && !(task.linkedPromptIds || []).includes(prompt.id)) {
        findings.push(`Prompt ${prompt.id} points to sprint task ${prompt.sprintTaskId} but the task does not link back`);
      }
    }
  }

  return { paths, registry, findings };
}

export function recomputeSprintRegistryState(root = process.cwd()) {
  const { registry } = readSprintRegistry(root);
  const { sprints } = buildSprintDashboardData(root);
  const sprintStateById = new Map(sprints.map(sprint => [sprint.id, sprint]));
  const phaseStateById = new Map();
  const taskStateById = new Map();

  for (const sprint of sprints) {
    for (const phase of sprint.phases) {
      phaseStateById.set(phase.id, phase);
      for (const task of phase.tasks) taskStateById.set(task.id, task);
    }
  }

  for (const sprint of registry.sprints) {
    const derived = sprintStateById.get(sprint.id);
    if (!derived) continue;
    sprint.panelNotes = normalizePanelNotes(sprint.panelNotes);
    sprint.auditRefs = (sprint.auditRefs || []).map(audit => ({
      ...audit,
      sourceDocument: normalizeRepoPath(root, audit.sourceDocument || ''),
    }));
    // Terminal statuses (Superseded, Retired) are manually set and must not
    // be overwritten by the derived status from prompt/audit lifecycle.
    if (!TERMINAL_SPRINT_STATUSES.has(sprint.status)) {
      sprint.status = derived.currentStatus;
    }
    sprint.normalizedStructure = derived.normalizedStructure;
    sprint.showNormalizationWarning = derived.showNormalizationWarning;
    sprint.showNextPromptPanel = derived.showNextPromptPanel;
    sprint.nextAvailablePhaseId = derived.nextAvailablePhase?.id || '';
    sprint.nextAvailablePhaseTitle = derived.nextAvailablePhase?.title || '';
    sprint.auditPromptTemplate = derived.auditPromptTemplateRendered;
    sprint.auditPromptTemplateDefault = derived.auditPromptTemplateDefault;
    sprint.nextPromptsTemplate = derived.nextPromptsTemplateRendered;
    sprint.nextPromptsTemplateDefault = derived.nextPromptsTemplateDefault;
    sprint.showMismatchPanel = derived.showMismatchPanel;
    sprint.mismatchFollowUpTemplate = derived.mismatchFollowUpTemplateRendered;
    sprint.mismatchFollowUpTemplateDefault = derived.mismatchFollowUpTemplateDefault;
    sprint.appendRequestTemplate = derived.appendRequestTemplateRendered;
    sprint.appendRequestTemplateDefault = derived.appendRequestTemplateDefault;
    sprint.unassignedPromptIds = derived.unassignedPromptIds;
    // updatedAt is only stamped on explicit mutations (e.g. panel save in server.mjs),
    // not here — recompute touches every sprint and would corrupt all timestamps.
  }

  for (const phase of registry.phases) {
    const derived = phaseStateById.get(phase.id);
    if (!derived) continue;
    phase.status = derived.currentStatus;
  }

  for (const task of registry.tasks) {
    const derived = taskStateById.get(task.id);
    if (!derived) continue;
    task.auditRefs = (task.auditRefs || []).map(audit => ({
      ...audit,
      sourceDocument: normalizeRepoPath(root, audit.sourceDocument || ''),
    }));
    task.auditSourceDocument = normalizeRepoPath(root, task.auditSourceDocument || '');
    task.status = derived.currentState;
    task.promptLifecycleState = derived._execution.promptLifecycleState;

    // Auto-clear mismatch state when all linked prompts have been reviewed and passed.
    // Allows the mismatch panel to update on dashboard refresh once follow-up work
    // is reviewed — without requiring a new manual audit for every task.
    if (
      task.auditState === 'Audit Found Mismatch' &&
      ['reviewed-passed', 'reviewed-with-notes'].includes(derived._execution.executionState)
    ) {
      task.auditState = '';
      task.auditSourceDocument = '';
      task.auditUpdatedAt = '';
    }
  }

  writeSprintRegistry(root, registry);
  return registry;
}
