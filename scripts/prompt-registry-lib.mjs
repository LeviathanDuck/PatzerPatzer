import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export const PROMPTS_DIR = 'docs/prompts';
export const REGISTRY_PATH = `${PROMPTS_DIR}/prompt-registry.json`;
export const ITEMS_DIR = `${PROMPTS_DIR}/items`;
export const QUEUE_PATH = `${PROMPTS_DIR}/CLAUDE_PROMPT_QUEUE.md`;
export const LOG_PATH = `${PROMPTS_DIR}/CLAUDE_PROMPT_LOG.md`;
export const HISTORY_PATH = `${PROMPTS_DIR}/CLAUDE_PROMPT_HISTORY.md`;
export const DASHBOARD_PATH = `${PROMPTS_DIR}/dashboard.html`;

const VALID_QUEUE_STATES = new Set(['not-queued', 'queued-pending', 'queued-started', 'queued-run']);
const VALID_REVIEW_OUTCOMES = new Set(['pending', 'passed', 'passed with notes', 'issues found', 'needs rework']);
const VALID_STATUS = new Set(['created', 'reviewed']);

export function registryPaths(root = process.cwd()) {
  return {
    root,
    registry: resolve(root, REGISTRY_PATH),
    itemsDir: resolve(root, ITEMS_DIR),
    queue: resolve(root, QUEUE_PATH),
    log: resolve(root, LOG_PATH),
    history: resolve(root, HISTORY_PATH),
    dashboard: resolve(root, DASHBOARD_PATH),
  };
}

export function readRegistry(root = process.cwd()) {
  const paths = registryPaths(root);
  const raw = JSON.parse(readFileSync(paths.registry, 'utf8'));
  if (raw.version !== 1) throw new Error(`Unsupported prompt registry version: ${raw.version}`);
  if (!Array.isArray(raw.prompts)) throw new Error('Prompt registry "prompts" must be an array');
  return { paths, registry: raw };
}

export function parseBatchPromptIds(value) {
  if (!value || value === 'none') return [];
  return [...value.matchAll(/`([^`]+)`/g)].map(m => m[1]);
}

export function formatBatchPromptIds(ids) {
  return ids.length ? ids.map(id => `\`${id}\``).join(', ') : 'none';
}

export function promptFileBody(root, prompt) {
  const path = resolve(root, prompt.promptFile);
  return readFileSync(path, 'utf8').replace(/\s+$/, '');
}

function isIsoDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function validateRegistry(root = process.cwd()) {
  const { paths, registry } = readRegistry(root);
  const findings = [];
  const ids = new Set();
  const promptById = new Map();

  for (const prompt of registry.prompts) {
    if (!prompt.id) findings.push('Prompt missing id');
    if (prompt.id && ids.has(prompt.id)) findings.push(`Duplicate prompt id: ${prompt.id}`);
    if (prompt.id) ids.add(prompt.id);
    if (!prompt.title) findings.push(`Prompt ${prompt.id} missing title`);
    if (!prompt.taskId) findings.push(`Prompt ${prompt.id} missing taskId`);
    if (!VALID_QUEUE_STATES.has(prompt.queueState)) findings.push(`Prompt ${prompt.id} has invalid queueState: ${prompt.queueState}`);
    if (!VALID_REVIEW_OUTCOMES.has(prompt.reviewOutcome)) findings.push(`Prompt ${prompt.id} has invalid reviewOutcome: ${prompt.reviewOutcome}`);
    if (!VALID_STATUS.has(prompt.status)) findings.push(`Prompt ${prompt.id} has invalid status: ${prompt.status}`);
    if (!prompt.promptFile) findings.push(`Prompt ${prompt.id} missing promptFile`);
    else if (!existsSync(resolve(root, prompt.promptFile))) findings.push(`Prompt ${prompt.id} prompt file missing: ${prompt.promptFile}`);
    if (prompt.createdAt && !isIsoDateTime(prompt.createdAt)) findings.push(`Prompt ${prompt.id} has invalid createdAt: ${prompt.createdAt}`);
    if (prompt.startedAt && !isIsoDateTime(prompt.startedAt)) findings.push(`Prompt ${prompt.id} has invalid startedAt: ${prompt.startedAt}`);
    if (prompt.queueState === 'not-queued' && prompt.status !== 'reviewed' && prompt.kind !== 'manager') {
      findings.push(`Prompt ${prompt.id} is not queued but is not reviewed`);
    }
    if (prompt.reviewOutcome === 'pending' && prompt.status === 'reviewed') {
      findings.push(`Prompt ${prompt.id} is reviewed but still has pending review outcome`);
    }
    if (prompt.reviewOutcome !== 'pending' && prompt.status !== 'reviewed') {
      findings.push(`Prompt ${prompt.id} has review outcome ${prompt.reviewOutcome} but status ${prompt.status}`);
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
    const mark = prompt.queueState === 'queued-started' || prompt.queueState === 'queued-run' ? 'x' : ' ';
    lines.push(`- [${mark}] ${prompt.id}: ${prompt.title}`);
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
    lines.push(`  - Task ID: \`${prompt.taskId}\``);
    lines.push(`  - Parent prompt ID: ${prompt.parentPromptId ? `\`${prompt.parentPromptId}\`` : 'none'}`);
    lines.push(`  - Batch prompt IDs: ${formatBatchPromptIds(prompt.batchPromptIds ?? [])}`);
    lines.push(`  - Source document: \`${prompt.sourceDocument}\``);
    lines.push(`  - Source step: \`${prompt.sourceStep}\``);
    lines.push(`  - Task: ${prompt.task}`);
    lines.push(`  - Created by: ${prompt.createdBy ? `\`${prompt.createdBy}\`` : 'unknown'}`);
    lines.push(`  - Created at: ${prompt.createdAt ? `\`${prompt.createdAt}\`` : 'unknown'}`);
    lines.push(`  - Started at: ${prompt.startedAt ? `\`${prompt.startedAt}\`` : 'not started'}`);
    lines.push(`  - Claude used: ${prompt.claudeUsed ? 'yes' : 'no'}`);
    lines.push(`  - Review outcome: ${prompt.reviewOutcome}`);
    lines.push(`  - Review issues: ${prompt.reviewIssues || 'none'}`);
    if (prompt.executionTarget) lines.push(`  - Execution target: \`${prompt.executionTarget}\``);
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
    const headingStatus = prompt.status === 'reviewed' ? 'Reviewed' : 'Created';
    lines.push(`## ${prompt.id} — ${headingStatus}`, '');
    lines.push(`- Task: ${prompt.task}`);
    lines.push(`- Task ID: \`${prompt.taskId}\``);
    lines.push(`- Parent prompt ID: ${prompt.parentPromptId ? `\`${prompt.parentPromptId}\`` : 'none'}`);
    lines.push(`- Source document: \`${prompt.sourceDocument}\``);
    lines.push(`- Source step: \`${prompt.sourceStep}\``);
    lines.push(`- Created by: ${prompt.createdBy ? `\`${prompt.createdBy}\`` : 'unknown'}`);
    lines.push(`- Created at: ${prompt.createdAt ? `\`${prompt.createdAt}\`` : 'unknown'}`);
    lines.push(`- Started at: ${prompt.startedAt ? `\`${prompt.startedAt}\`` : 'not started'}`);
    lines.push(`- Status: ${prompt.status}`);
    lines.push(`- Review outcome: ${prompt.reviewOutcome}`);
    lines.push(`- Commit: ${prompt.commit || 'unknown'}`);
    lines.push(`- Notes: ${prompt.notes || 'none'}`, '', '```');
    lines.push(promptFileBody(root, prompt));
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
