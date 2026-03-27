import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROMPTS_DIR,
  ITEMS_DIR,
  REGISTRY_PATH,
  QUEUE_PATH,
  LOG_PATH,
  HISTORY_PATH,
} from './prompt-registry-lib.mjs';

const root = process.cwd();
const queue = readFileSync(resolve(root, QUEUE_PATH), 'utf8');
const log = readFileSync(resolve(root, LOG_PATH), 'utf8');
const history = readFileSync(resolve(root, HISTORY_PATH), 'utf8');

const itemsDir = resolve(root, ITEMS_DIR);
mkdirSync(itemsDir, { recursive: true });

const uniq = values => [...new Set(values)];

function parseSectionMap(text, headingRegex) {
  const sections = new Map();
  const parts = text.split(/^## /gm);
  for (const part of parts.slice(1)) {
    const whole = `## ${part}`;
    const firstLine = part.split('\n', 1)[0];
    const match = firstLine.match(headingRegex);
    if (!match) continue;
    sections.set(match[1], whole);
  }
  return sections;
}

function parseField(block, label) {
  const match = block.match(new RegExp(`^- ${label}: (.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function parseIndentedField(block, label) {
  const match = block.match(new RegExp(`^  - ${label}: (.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function stripTicks(value) {
  if (!value) return value;
  return value.replace(/^`|`$/g, '');
}

function parseBatchIds(value) {
  if (!value || value === 'none') return [];
  return [...value.matchAll(/`([^`]+)`/g)].map(m => m[1]);
}

function extractPromptBody(section) {
  const match = section.match(/```[\r\n]+([\s\S]*?)```/);
  return match ? match[1].replace(/\s+$/, '') : null;
}

const queueIndexOrder = [...queue.matchAll(/^- \[(?: |x)\] (CCP-[A-Z0-9-]+): /gm)].map(m => m[1]);
const logIndexOrder = [...log.matchAll(/^- \[(?: |x)\] (CCP-[A-Z0-9-]+) - /gm)].map(m => m[1]);
const historyOrder = [...history.matchAll(/^## (CCP-[A-Z0-9-]+) — /gm)].map(m => m[1]);

const queueSections = parseSectionMap(queue, /^(CCP-[A-Z0-9-]+) - /);
const logSections = parseSectionMap(log, /^(CCP-[A-Z0-9-]+) - /);
const historySections = parseSectionMap(history, /^(CCP-[A-Z0-9-]+) — /);

const queueStateMap = new Map([...queue.matchAll(/^- \[( |x)\] (CCP-[A-Z0-9-]+): /gm)].map(m => [m[2], m[1] === 'x' ? 'queued-run' : 'queued-pending']));

const allIds = uniq([...logIndexOrder, ...queueIndexOrder, ...historyOrder]);
const prompts = [];

for (const id of allIds) {
  const logSection = logSections.get(id) ?? '';
  const historySection = historySections.get(id) ?? '';
  const queueSection = queueSections.get(id) ?? '';

  const logTitle = (logSection.match(/^## [A-Z0-9-]+ - (.+)$/m) ?? [])[1];
  const queueTitle = (queueSection.match(/^## [A-Z0-9-]+ - (.+)$/m) ?? [])[1];
  const historyTask = parseField(historySection, 'Task');
  const title = logTitle ?? queueTitle ?? historyTask ?? id;

  const reviewMarked = /- \[x\] Reviewed/.test(logSection);
  const reviewOutcome = parseIndentedField(logSection, 'Review outcome') ?? 'pending';
  const reviewIssues = parseIndentedField(logSection, 'Review issues') ?? 'none';
  const claudeUsed = (parseIndentedField(logSection, 'Claude used') ?? 'no') === 'yes';
  const task = parseIndentedField(logSection, 'Task') ?? historyTask ?? title;
  const taskId = stripTicks(parseIndentedField(logSection, 'Task ID') ?? parseField(historySection, 'Task ID') ?? id);
  const parentPromptIdRaw = parseIndentedField(logSection, 'Parent prompt ID') ?? parseField(historySection, 'Parent prompt ID') ?? 'none';
  const parentPromptId = parentPromptIdRaw === 'none' ? null : stripTicks(parentPromptIdRaw);
  const batchPromptIds = parseBatchIds(parseIndentedField(logSection, 'Batch prompt IDs') ?? 'none');
  const sourceDocument = stripTicks(parseIndentedField(logSection, 'Source document') ?? parseField(historySection, 'Source document') ?? 'inferred from prior workflow');
  const sourceStep = stripTicks(parseIndentedField(logSection, 'Source step') ?? parseField(historySection, 'Source step') ?? 'unknown');
  const executionTarget = stripTicks(parseIndentedField(logSection, 'Execution target') ?? (extractPromptBody(historySection)?.match(/^Execution Target:\s*(.+)$/m)?.[1] ?? 'Claude Code'));
  const commit = stripTicks(parseField(historySection, 'Commit') ?? 'unknown');
  const notes = parseField(historySection, 'Notes') ?? 'none';
  const queueState = queueStateMap.get(id) ?? 'not-queued';
  const status = reviewMarked || reviewOutcome !== 'pending' ? 'reviewed' : 'created';
  const kind = batchPromptIds.length ? 'manager' : (id.includes('-F') ? 'follow-up' : 'normal');

  const promptBody = extractPromptBody(historySection)
    ?? extractPromptBody(queueSection)
    ?? `Original prompt text was not recovered for ${id}.`;

  const promptFile = `${ITEMS_DIR}/${id}.md`;
  writeFileSync(resolve(root, promptFile), promptBody.endsWith('\n') ? promptBody : `${promptBody}\n`);

  let queueSummary = 'queued prompt';
  const queueIndexMatch = [...queue.matchAll(new RegExp(`^- \\[(?: |x)\\] ${id}: [^\\n]+\\n  - (.+)$`, 'gm'))][0];
  if (queueIndexMatch) queueSummary = queueIndexMatch[1];
  else if (kind === 'manager' && batchPromptIds.length) queueSummary = `execute batch manager for ${batchPromptIds.map(x => `\`${x}\``).join(', ')}.`;
  else queueSummary = task.charAt(0).toLowerCase() + task.slice(1) + '.';

  prompts.push({
    id,
    title,
    taskId,
    parentPromptId,
    batchPromptIds,
    sourceDocument,
    sourceStep,
    task,
    executionTarget,
    claudeUsed,
    status,
    reviewOutcome,
    reviewIssues,
    queueState,
    queueSummary,
    promptFile,
    commit,
    notes,
    kind,
  });
}

const registry = { version: 1, prompts };
writeFileSync(resolve(root, REGISTRY_PATH), `${JSON.stringify(registry, null, 2)}\n`);

console.log(`Wrote ${resolve(root, REGISTRY_PATH)}`);
console.log(`Wrote ${prompts.length} prompt files into ${itemsDir}`);
