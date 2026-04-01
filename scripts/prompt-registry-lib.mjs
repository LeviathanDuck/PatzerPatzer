import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

export const PROMPTS_DIR = 'docs/prompts';
export const REGISTRY_PATH = `${PROMPTS_DIR}/prompt-registry.json`;
export const ITEMS_DIR = `${PROMPTS_DIR}/items`;
export const QUEUE_PATH = `${PROMPTS_DIR}/CLAUDE_PROMPT_QUEUE.md`;
export const LOG_PATH = `${PROMPTS_DIR}/CLAUDE_PROMPT_LOG.md`;
export const HISTORY_PATH = `${PROMPTS_DIR}/CLAUDE_PROMPT_HISTORY.md`;
export const DASHBOARD_PATH = `${PROMPTS_DIR}/dashboard.html`;
export const LOCK_PATH = `${PROMPTS_DIR}/prompt-registry.lock`;

const VALID_QUEUE_STATES = new Set(['not-queued', 'queued-pending', 'queued-started', 'queued-run']);
const VALID_REVIEW_OUTCOMES = new Set(['pending', 'passed', 'passed with notes', 'issues found', 'needs rework', 'issues resolved']);
const VALID_STATUS = new Set(['reserved', 'created', 'reviewed']);
const VALID_PRIORITIES = new Set(['critical', 'high', 'normal', 'low']);
const VALID_CATEGORIES = new Set(['bugfix', 'typecheck', 'wiring', 'feature', 'refactor', 'research', 'manager', 'polish']);
const VALID_REVIEWERS = new Set(['Codex', 'Claude', 'User', 'Unknown']);
const VALID_REVIEW_METHODS = new Set(['full-review', 'manager-plus-children', 'manager-only', 'spot-check', 'follow-up-recheck']);
const ROOT_ID_RE = /^CCP-(\d+)$/;
const ANY_ID_RE = /^CCP-(\d+)(?:-F(\d+))?$/;
const REMOVED_PROMPT_DOC_RE = /\/docs\/prompts\/(README\.md|CODEX_PROMPT_INSTRUCTIONS\.md|code-review\.md|manager-batch\.md|codexinstructionstopromptclaude(?:\.archived-v1)?\.md)\b/g;

export function registryPaths(root = process.cwd()) {
  return {
    root,
    registry: resolve(root, REGISTRY_PATH),
    itemsDir: resolve(root, ITEMS_DIR),
    queue: resolve(root, QUEUE_PATH),
    log: resolve(root, LOG_PATH),
    history: resolve(root, HISTORY_PATH),
    dashboard: resolve(root, DASHBOARD_PATH),
    lock: resolve(root, LOCK_PATH),
  };
}

export function readRegistry(root = process.cwd()) {
  const paths = registryPaths(root);
  const raw = JSON.parse(readFileSync(paths.registry, 'utf8'));
  if (raw.version !== 1) throw new Error(`Unsupported prompt registry version: ${raw.version}`);
  if (!Array.isArray(raw.prompts)) throw new Error('Prompt registry "prompts" must be an array');
  return { paths, registry: raw };
}

export function writeRegistry(root, registry) {
  const paths = registryPaths(root);
  writeFileSync(paths.registry, JSON.stringify(registry, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

export async function withRegistryLock(root = process.cwd(), fn, options = {}) {
  const { paths } = readRegistry(root);
  const timeoutMs = options.timeoutMs ?? 5000;
  const retryMs = options.retryMs ?? 50;
  const startedAt = Date.now();
  let fd = null;

  while (true) {
    try {
      fd = openSync(paths.lock, 'wx');
      const metadata = {
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      };
      writeFileSync(paths.lock, JSON.stringify(metadata, null, 2) + '\n');
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
        throw new Error(`Timed out waiting for prompt registry lock at ${paths.lock}.${lockHint}`);
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
        // Ignore lock cleanup races after the critical section exits.
      }
    }
  }
}

export async function mutateRegistryLocked(root = process.cwd(), mutator, options = {}) {
  return withRegistryLock(root, async () => {
    const { registry } = readRegistry(root);
    ensureAllocator(registry);
    const result = await mutator(registry);
    if (result?.write !== false) writeRegistry(root, registry);
    return result;
  }, options);
}

export function parseBatchPromptIds(value) {
  if (!value || value === 'none') return [];
  return [...value.matchAll(/`([^`]+)`/g)].map(m => m[1]);
}

export function formatBatchPromptIds(ids) {
  return ids.length ? ids.map(id => `\`${id}\``).join(', ') : 'none';
}

export function promptFileBody(root, prompt) {
  if (!prompt?.promptFile) throw new Error(`Prompt ${prompt?.id ?? 'unknown'} has no prompt file`);
  const path = resolve(root, prompt.promptFile);
  return readFileSync(path, 'utf8').replace(/\s+$/, '');
}

export function safePromptFileBody(root, prompt) {
  try {
    return promptFileBody(root, prompt);
  } catch {
    return '(prompt body not created yet)';
  }
}

export function validatePromptBodyText(body, { id } = {}) {
  const findings = [];
  const text = String(body ?? '');
  if (!text.includes('Read and follow:')) {
    findings.push(`Prompt body${id ? ` for ${id}` : ''} is missing the required "Read and follow" header.`);
  }
  if (!text.includes('/CLAUDE.md')) {
    findings.push(`Prompt body${id ? ` for ${id}` : ''} does not reference CLAUDE.md.`);
  }
  if (!text.includes('/AGENTS.md')) {
    findings.push(`Prompt body${id ? ` for ${id}` : ''} does not reference AGENTS.md.`);
  }
  const removedRefs = [...text.matchAll(REMOVED_PROMPT_DOC_RE)].map(match => match[1]);
  if (removedRefs.length) {
    findings.push(`Prompt body${id ? ` for ${id}` : ''} references removed prompt docs: ${[...new Set(removedRefs)].join(', ')}`);
  }
  if (!text.includes('## Lifecycle')) {
    findings.push(`Prompt body${id ? ` for ${id}` : ''} is missing the required ## Lifecycle section.`);
  } else if (id) {
    if (!text.includes(`npm run prompt:start -- ${id}`)) {
      findings.push(`Prompt body for ${id} is missing the exact prompt:start command in ## Lifecycle.`);
    }
    if (!text.includes(`npm run prompt:complete -- ${id}`)) {
      findings.push(`Prompt body for ${id} is missing the exact prompt:complete command in ## Lifecycle.`);
    }
  }
  return findings;
}

export function findPrompt(registry, id) {
  return registry.prompts.find(prompt => prompt.id === id);
}

export function requirePrompt(registry, id) {
  const prompt = findPrompt(registry, id);
  if (!prompt) throw new Error(`Prompt ${id} not found in registry.`);
  return prompt;
}

export function isReleasedReservation(prompt) {
  return prompt?.status === 'reserved' && !!prompt?.reservationReleasedAt;
}

export function ensureNotReserved(prompt, actionLabel) {
  if (prompt.status !== 'reserved') return;
  if (isReleasedReservation(prompt)) {
    throw new Error(`Prompt ${prompt.id} is a released reservation and cannot be used for ${actionLabel}.`);
  }
  throw new Error(`Prompt ${prompt.id} is still reserved and must be finalized before ${actionLabel}.`);
}

function isIsoDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseRootNumber(id) {
  const match = String(id ?? '').match(ANY_ID_RE);
  return match ? Number(match[1]) : null;
}

function parseFollowupNumber(id, taskId) {
  const match = String(id ?? '').match(new RegExp(`^${taskId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}-F(\\d+)$`));
  return match ? Number(match[1]) : null;
}

function formatRootId(number) {
  return `CCP-${String(number).padStart(3, '0')}`;
}

export function ensureAllocator(registry) {
  const currentMax = registry.prompts.reduce((max, prompt) => {
    const n = parseRootNumber(prompt.id);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  if (!registry.allocator || typeof registry.allocator !== 'object') {
    registry.allocator = { nextRootNumber: currentMax + 1 };
    return registry.allocator;
  }
  if (!Number.isInteger(registry.allocator.nextRootNumber) || registry.allocator.nextRootNumber <= currentMax) {
    registry.allocator.nextRootNumber = currentMax + 1;
  }
  return registry.allocator;
}

export function reserveNextRootId(registry) {
  const allocator = ensureAllocator(registry);
  const id = formatRootId(allocator.nextRootNumber);
  allocator.nextRootNumber += 1;
  return id;
}

export function reserveNextFollowupId(registry, taskId) {
  const familyRoot = requirePrompt(registry, taskId);
  const familyTaskId = familyRoot.taskId || taskId;
  if (familyTaskId !== taskId) {
    throw new Error(`Base prompt ${taskId} is not a root task family id.`);
  }
  const maxSuffix = registry.prompts.reduce((max, prompt) => {
    const suffix = parseFollowupNumber(prompt.id, taskId);
    return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
  }, 0);
  return `${taskId}-F${maxSuffix + 1}`;
}

export function makeReservedPromptRecord({
  id,
  taskId,
  parentPromptId = '',
  title,
  kind = 'feature',
  createdBy = 'Unknown',
  notes = '',
  executionTarget = 'Claude Code',
}) {
  const now = new Date().toISOString();
  return {
    id,
    title: title || `Reserved ${id}`,
    taskId,
    parentPromptId,
    batchPromptIds: [],
    sourceDocument: 'reserved',
    sourceStep: 'reserved',
    task: 'Reserved prompt slot',
    executionTarget,
    createdBy,
    createdAt: now,
    startedAt: '',
    claudeUsed: false,
    status: 'reserved',
    reviewOutcome: 'pending',
    reviewIssues: '',
    queueState: 'not-queued',
    queueSummary: 'Reserved prompt slot',
    promptFile: '',
    commit: '',
    notes: notes || 'Reserved by allocator',
    kind,
    priority: 'normal',
    category: kind === 'manager' ? 'manager' : '',
    completedAt: '',
    manualChecklist: [],
    reviewedAt: '',
    fixesPromptId: '',
    reviewedBy: '',
    reviewMethod: '',
    reviewScope: '',
    reservationReleasedAt: '',
    sprintId: '',
    sprintPhaseId: '',
    sprintTaskId: '',
  };
}

export function validateRegistry(root = process.cwd()) {
  const { paths, registry } = readRegistry(root);
  const findings = [];
  const ids = new Set();
  const promptById = new Map();
  const currentMax = registry.prompts.reduce((max, prompt) => {
    const n = parseRootNumber(prompt.id);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);

  if (registry.allocator) {
    if (typeof registry.allocator !== 'object' || !Number.isInteger(registry.allocator.nextRootNumber)) {
      findings.push('Registry allocator is invalid.');
    } else if (registry.allocator.nextRootNumber <= currentMax) {
      findings.push(`Registry allocator nextRootNumber ${registry.allocator.nextRootNumber} must be greater than current max root id ${currentMax}`);
    }
  }

  for (const prompt of registry.prompts) {
    if (!prompt.id) findings.push('Prompt missing id');
    if (prompt.id && ids.has(prompt.id)) findings.push(`Duplicate prompt id: ${prompt.id}`);
    if (prompt.id) ids.add(prompt.id);
    if (!prompt.title) findings.push(`Prompt ${prompt.id} missing title`);
    if (!prompt.taskId) findings.push(`Prompt ${prompt.id} missing taskId`);
    if (!VALID_QUEUE_STATES.has(prompt.queueState)) findings.push(`Prompt ${prompt.id} has invalid queueState: ${prompt.queueState}`);
    if (!VALID_REVIEW_OUTCOMES.has(prompt.reviewOutcome)) findings.push(`Prompt ${prompt.id} has invalid reviewOutcome: ${prompt.reviewOutcome}`);
    if (!VALID_STATUS.has(prompt.status)) findings.push(`Prompt ${prompt.id} has invalid status: ${prompt.status}`);
    if (prompt.status === 'reserved') {
      if (prompt.queueState !== 'not-queued') findings.push(`Reserved prompt ${prompt.id} must use queueState not-queued`);
      if (prompt.reviewOutcome !== 'pending') findings.push(`Reserved prompt ${prompt.id} must keep reviewOutcome pending`);
      if (prompt.startedAt) findings.push(`Reserved prompt ${prompt.id} must not have startedAt`);
      if (prompt.completedAt) findings.push(`Reserved prompt ${prompt.id} must not have completedAt`);
      if (prompt.reviewedAt) findings.push(`Reserved prompt ${prompt.id} must not have reviewedAt`);
      if (prompt.promptFile && !existsSync(resolve(root, prompt.promptFile))) {
        findings.push(`Reserved prompt ${prompt.id} prompt file missing: ${prompt.promptFile}`);
      }
      if (prompt.reservationReleasedAt && !isIsoDateTime(prompt.reservationReleasedAt)) {
        findings.push(`Prompt ${prompt.id} has invalid reservationReleasedAt: ${prompt.reservationReleasedAt}`);
      }
    } else {
      if (!prompt.promptFile) findings.push(`Prompt ${prompt.id} missing promptFile`);
      else if (!existsSync(resolve(root, prompt.promptFile))) findings.push(`Prompt ${prompt.id} prompt file missing: ${prompt.promptFile}`);
    }
    if (prompt.createdAt && !isIsoDateTime(prompt.createdAt)) findings.push(`Prompt ${prompt.id} has invalid createdAt: ${prompt.createdAt}`);
    if (prompt.startedAt && !isIsoDateTime(prompt.startedAt)) findings.push(`Prompt ${prompt.id} has invalid startedAt: ${prompt.startedAt}`);
    if (prompt.completedAt && !isIsoDateTime(prompt.completedAt)) findings.push(`Prompt ${prompt.id} has invalid completedAt: ${prompt.completedAt}`);
    if (prompt.reviewedAt && !isIsoDateTime(prompt.reviewedAt)) findings.push(`Prompt ${prompt.id} has invalid reviewedAt: ${prompt.reviewedAt}`);
    if (prompt.priority && !VALID_PRIORITIES.has(prompt.priority)) findings.push(`Prompt ${prompt.id} has invalid priority: ${prompt.priority}`);
    if (prompt.category && !VALID_CATEGORIES.has(prompt.category)) findings.push(`Prompt ${prompt.id} has invalid category: ${prompt.category}`);
    if (prompt.reviewedBy && !VALID_REVIEWERS.has(prompt.reviewedBy)) findings.push(`Prompt ${prompt.id} has invalid reviewedBy: ${prompt.reviewedBy}`);
    if (prompt.reviewMethod && !VALID_REVIEW_METHODS.has(prompt.reviewMethod)) findings.push(`Prompt ${prompt.id} has invalid reviewMethod: ${prompt.reviewMethod}`);
    if (prompt.sprintId && typeof prompt.sprintId !== 'string') findings.push(`Prompt ${prompt.id} has invalid sprintId`);
    if (prompt.sprintPhaseId && typeof prompt.sprintPhaseId !== 'string') findings.push(`Prompt ${prompt.id} has invalid sprintPhaseId`);
    if (prompt.sprintTaskId && typeof prompt.sprintTaskId !== 'string') findings.push(`Prompt ${prompt.id} has invalid sprintTaskId`);
    if (prompt.queueState === 'not-queued' && prompt.status !== 'reviewed' && prompt.status !== 'reserved' && prompt.kind !== 'manager') {
      findings.push(`Prompt ${prompt.id} is not queued but is not reviewed`);
    }
    if (prompt.reviewOutcome === 'pending' && prompt.status === 'reviewed') {
      findings.push(`Prompt ${prompt.id} is reviewed but still has pending review outcome`);
    }
    if (prompt.reviewOutcome !== 'pending' && prompt.status !== 'reviewed') {
      findings.push(`Prompt ${prompt.id} has review outcome ${prompt.reviewOutcome} but status ${prompt.status}`);
    }
    if (prompt.status === 'reviewed' && !prompt.reviewedAt) {
      findings.push(`Prompt ${prompt.id} is reviewed but missing reviewedAt`);
    }
    promptById.set(prompt.id, prompt);
  }

  for (const prompt of registry.prompts) {
    if (prompt.parentPromptId && prompt.parentPromptId !== 'none' && !promptById.has(prompt.parentPromptId)) {
      findings.push(`Prompt ${prompt.id} references missing parentPromptId ${prompt.parentPromptId}`);
    }
    for (const childId of prompt.batchPromptIds ?? []) {
      if (!promptById.has(childId)) findings.push(`Prompt ${prompt.id} references missing batch child ${childId}`);
    }
    if ((prompt.batchPromptIds?.length ?? 0) > 0 && prompt.status === 'reviewed') {
      const unreviewed = prompt.batchPromptIds.filter(id => promptById.get(id)?.status !== 'reviewed');
      if (unreviewed.length) findings.push(`Manager prompt ${prompt.id} reviewed while child prompts remain unreviewed: ${unreviewed.join(', ')}`);
    }
  }

  return { paths, registry, findings };
}

export function renderQueue(root = process.cwd(), registryArg = null) {
  const { registry } = registryArg ?? readRegistry(root);
  const prompts = registry.prompts.filter(p => p.queueState !== 'not-queued');
  const lines = [
    '# Claude Prompt Queue',
    '',
    '> Generated from `docs/prompts/prompt-registry.json` and `docs/prompts/items/`. Do not hand-edit this file.',
    '',
    'Use this file to store Claude Code prompts that are available for future use and have not yet been reviewed.',
    '',
    '## Queue Index',
    '',
  ];

  for (const prompt of prompts) {
    const isRun = prompt.queueState === 'queued-run';
    const isStarted = prompt.queueState === 'queued-started';
    const mark = isRun || isStarted ? 'x' : ' ';
    const suffix = isRun && prompt.completionErrors ? ' [COMPLETED WITH ERRORS]' : isRun ? ' [COMPLETED]' : '';
    lines.push(`- [${mark}] ${prompt.id}: ${prompt.title}${suffix}`);
    lines.push(`  - ${prompt.queueSummary}`);
    lines.push('');
  }

  lines.push('## Queue', '');

  for (const prompt of prompts) {
    lines.push(`## ${prompt.id} - ${prompt.title}`, '', '```');
    lines.push(promptFileBody(root, prompt));
    lines.push('```', '');
  }

  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

export function renderLog(root = process.cwd(), registryArg = null) {
  const { registry } = registryArg ?? readRegistry(root);
  const lines = [
    '# Claude Prompt Log',
    '',
    '> Generated from `docs/prompts/prompt-registry.json`. Do not hand-edit this file.',
    '',
    'Use this file to track Claude Code prompts from creation through review.',
    '',
    '## Prompt Index',
    '',
  ];

  for (const prompt of registry.prompts) {
    const mark = prompt.status === 'reviewed' ? 'x' : ' ';
    lines.push(`- [${mark}] ${prompt.id} - ${prompt.title}`);
  }

  lines.push('', '## Detailed Log', '');

  for (const prompt of registry.prompts) {
    const reviewedMark = prompt.status === 'reviewed' ? 'x' : ' ';
    lines.push(`## ${prompt.id} - ${prompt.title}`, '', '```');
    lines.push(`- [${reviewedMark}] Reviewed`);
    lines.push(`  - ID: \`${prompt.id}\``);
    lines.push(`  - Status: \`${prompt.status}\``);
    lines.push(`  - Task ID: \`${prompt.taskId}\``);
    lines.push(`  - Parent prompt ID: ${prompt.parentPromptId ? `\`${prompt.parentPromptId}\`` : 'none'}`);
    lines.push(`  - Batch prompt IDs: ${formatBatchPromptIds(prompt.batchPromptIds ?? [])}`);
    lines.push(`  - Source document: \`${prompt.sourceDocument}\``);
    lines.push(`  - Source step: \`${prompt.sourceStep}\``);
    lines.push(`  - Task: ${prompt.task}`);
    lines.push(`  - Created by: ${prompt.createdBy ? `\`${prompt.createdBy}\`` : 'unknown'}`);
    lines.push(`  - Created at: ${prompt.createdAt ? `\`${prompt.createdAt}\`` : 'unknown'}`);
    lines.push(`  - Started at: ${prompt.startedAt ? `\`${prompt.startedAt}\`` : 'not started'}`);
    if (prompt.reservationReleasedAt) lines.push(`  - Reservation released at: \`${prompt.reservationReleasedAt}\``);
    lines.push(`  - Claude used: ${prompt.claudeUsed ? 'yes' : 'no'}`);
    lines.push(`  - Review outcome: ${prompt.reviewOutcome}`);
    lines.push(`  - Review issues: ${prompt.reviewIssues || 'none'}`);
    lines.push(`  - Reviewed at: ${prompt.reviewedAt ? `\`${prompt.reviewedAt}\`` : 'not reviewed'}`);
    lines.push(`  - Reviewed by: ${prompt.reviewedBy ? `\`${prompt.reviewedBy}\`` : 'unknown'}`);
    lines.push(`  - Review method: ${prompt.reviewMethod ? `\`${prompt.reviewMethod}\`` : 'unknown'}`);
    lines.push(`  - Review scope: ${prompt.reviewScope || 'none'}`);
    if (prompt.fixesPromptId) lines.push(`  - Fixes prompt: \`${prompt.fixesPromptId}\` (this prompt resolves issues found in that review)`);
    if (prompt.fixedByPromptId) lines.push(`  - Fixed by prompt: \`${prompt.fixedByPromptId}\` (issues from this review were resolved by that prompt)`);
    if (prompt.fixPromptSuggestion) {
      lines.push(`  - Prompt this to start fix:`);
      lines.push(`    \`\`\``);
      for (const line of prompt.fixPromptSuggestion.split('\n')) lines.push(`    ${line}`);
      lines.push(`    \`\`\``);
    }
    if (prompt.executionTarget) lines.push(`  - Execution target: \`${prompt.executionTarget}\``);
    if (prompt.sprintId) lines.push(`  - Sprint ID: \`${prompt.sprintId}\``);
    if (prompt.sprintPhaseId) lines.push(`  - Sprint phase ID: \`${prompt.sprintPhaseId}\``);
    if (prompt.sprintTaskId) lines.push(`  - Sprint task ID: \`${prompt.sprintTaskId}\``);
    if (prompt.completedAt) lines.push(`  - Completed at: \`${prompt.completedAt}\``);
    if (prompt.completionErrors) lines.push(`  - Completion errors: ${prompt.completionErrors}`);
    if (prompt.manualChecklist && prompt.manualChecklist.length > 0) {
      lines.push(`  - Manual checklist:`);
      for (const item of prompt.manualChecklist) lines.push(`    ${item}`);
    }
    lines.push('```', '');
  }

  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

export function renderHistory(root = process.cwd(), registryArg = null) {
  const { registry } = registryArg ?? readRegistry(root);
  const lines = [
    '# Claude Prompt History',
    '',
    '> Generated from `docs/prompts/prompt-registry.json` and `docs/prompts/items/`. Do not hand-edit this file.',
    '',
    'Use this file to archive the full text of Claude Code prompts generated from Codex for Patzer Pro work.',
    '',
    '## History',
    '',
  ];

  for (const prompt of registry.prompts) {
    const headingStatus = prompt.status === 'reviewed' ? 'Reviewed' : prompt.status === 'reserved' ? 'Reserved' : 'Created';
    lines.push(`## ${prompt.id} — ${headingStatus}`, '');
    lines.push(`- Task: ${prompt.task}`);
    lines.push(`- Task ID: \`${prompt.taskId}\``);
    lines.push(`- Parent prompt ID: ${prompt.parentPromptId ? `\`${prompt.parentPromptId}\`` : 'none'}`);
    lines.push(`- Source document: \`${prompt.sourceDocument}\``);
    lines.push(`- Source step: \`${prompt.sourceStep}\``);
    lines.push(`- Created by: ${prompt.createdBy ? `\`${prompt.createdBy}\`` : 'unknown'}`);
    lines.push(`- Created at: ${prompt.createdAt ? `\`${prompt.createdAt}\`` : 'unknown'}`);
    lines.push(`- Started at: ${prompt.startedAt ? `\`${prompt.startedAt}\`` : 'not started'}`);
    if (prompt.reservationReleasedAt) lines.push(`- Reservation released at: \`${prompt.reservationReleasedAt}\``);
    lines.push(`- Status: ${prompt.status}`);
    lines.push(`- Review outcome: ${prompt.reviewOutcome}`);
    lines.push(`- Reviewed at: ${prompt.reviewedAt ? `\`${prompt.reviewedAt}\`` : 'not reviewed'}`);
    lines.push(`- Reviewed by: ${prompt.reviewedBy ? `\`${prompt.reviewedBy}\`` : 'unknown'}`);
    lines.push(`- Review method: ${prompt.reviewMethod ? `\`${prompt.reviewMethod}\`` : 'unknown'}`);
    lines.push(`- Review scope: ${prompt.reviewScope || 'none'}`);
    lines.push(`- Fixes prompt: ${prompt.fixesPromptId ? `\`${prompt.fixesPromptId}\`` : 'none'}`);
    lines.push(`- Fixed by prompt: ${prompt.fixedByPromptId ? `\`${prompt.fixedByPromptId}\`` : 'none'}`);
    lines.push(`- Batch prompt IDs: ${formatBatchPromptIds(prompt.batchPromptIds ?? [])}`);
    lines.push(`- Sprint ID: ${prompt.sprintId ? `\`${prompt.sprintId}\`` : 'none'}`);
    lines.push(`- Sprint phase ID: ${prompt.sprintPhaseId ? `\`${prompt.sprintPhaseId}\`` : 'none'}`);
    lines.push(`- Sprint task ID: ${prompt.sprintTaskId ? `\`${prompt.sprintTaskId}\`` : 'none'}`);
    lines.push(`- Queue state: ${prompt.queueState}`);
    lines.push(`- Prompt file: ${prompt.promptFile ? `\`${prompt.promptFile}\`` : 'not created yet'}`);
    lines.push(`- Notes: ${prompt.notes || 'none'}`, '', '```');
    lines.push(safePromptFileBody(root, prompt));
    lines.push('```', '');
  }

  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

export function generatedDocs(root = process.cwd()) {
  const data = readRegistry(root);
  return {
    ...data,
    queue: renderQueue(root, data),
    log: renderLog(root, data),
    history: renderHistory(root, data),
  };
}
