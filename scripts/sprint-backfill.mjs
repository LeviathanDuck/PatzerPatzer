import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRegistry as readPromptRegistry, writeRegistry as writePromptRegistry } from './prompt-registry-lib.mjs';
import { readSprintRegistry, writeSprintRegistry, ensureSprintAllocator, reserveNextSprintId } from './sprint-registry-lib.mjs';

const root = process.cwd();
const SPRINTS_DIR = resolve(root, 'docs/mini-sprints');
const AUDIT_PATH = resolve(root, 'docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md');

const EXCLUDE_FILES = new Set([
  'SPRINT_REGISTRY_README.md',
  'SPRINT_CREATION_PROCESS.md',
  'SPRINT_PROGRESS_PROCESS.md',
  'SPRINT_AUDIT_PROCESS.md',
  'SPRINT_USER_GUIDE.md',
  'SPRINT_STATUS.md',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeKey(value) {
  return String(value ?? '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseMarkdownTable(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 2; i += 1) {
    if (!lines[i].startsWith('|') || !lines[i + 1].startsWith('|')) continue;
    if (!/\|\s*-/.test(lines[i + 1])) continue;
    const header = lines[i].split('|').slice(1, -1).map(cell => cell.trim());
    if (!header.some(cell => /status/i.test(cell))) continue;
    const rows = [];
    let j = i + 2;
    while (j < lines.length && lines[j].startsWith('|')) {
      const cells = lines[j].split('|').slice(1, -1).map(cell => cell.trim());
      if (cells.length === header.length) {
        rows.push(Object.fromEntries(header.map((key, idx) => [key, cells[idx] ?? ''])));
      }
      j += 1;
    }
    return { header, rows };
  }
  return null;
}

function parseAllMarkdownTables(text) {
  const lines = text.split('\n');
  const tables = [];
  for (let i = 0; i < lines.length - 2; i += 1) {
    if (!lines[i].startsWith('|') || !lines[i + 1].startsWith('|')) continue;
    if (!/\|\s*-/.test(lines[i + 1])) continue;
    const header = lines[i].split('|').slice(1, -1).map(cell => cell.trim());
    const rows = [];
    let j = i + 2;
    while (j < lines.length && lines[j].startsWith('|')) {
      const cells = lines[j].split('|').slice(1, -1).map(cell => cell.trim());
      if (cells.length === header.length) {
        rows.push(Object.fromEntries(header.map((key, idx) => [key, cells[idx] ?? ''])));
      }
      j += 1;
    }
    tables.push({ header, rows, startLine: i, endLine: j - 1 });
    i = j - 1;
  }
  return tables;
}

function parseSourceAudit(text) {
  const match = text.match(/^Source audit:\s+\[[^\]]+\]\(([^)]+)\)/m);
  return match ? match[1] : '';
}

function parseDocMeta(text) {
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Untitled Sprint';
  const statusLine = text.match(/^Status:\s+(.+)$/m)?.[1]?.trim() || '';
  const dateLine = text.match(/^Date:\s+(.+)$/m)?.[1]?.trim() || '';
  return { title, statusLine, dateLine, sourceAudit: parseSourceAudit(text) };
}

function mapTaskStatus(raw) {
  const text = normalizeKey(raw);
  if (!text) return 'planned';
  if (text.includes('done') || text.includes('complete') || text.includes('built') || text.includes('implemented')) {
    if (text.includes('passed review') || text.includes('all passed review')) return 'verified';
    return 'implemented';
  }
  if (text.includes('partial') || text.includes('code only') || text.includes('placeholder')) return 'implementation-partial';
  if (text.includes('broken') || text.includes('failed')) return 'broken';
  if (text.includes('blocked')) return 'blocked';
  if (text.includes('deferred')) return 'deferred';
  if (text.includes('not started') || text.includes('not implemented') || text.includes('not confirmed') || text.includes('unknown')) return 'not-started';
  return 'planned';
}

function mapSprintStatus(raw, fallbackTaskStatuses = []) {
  const text = normalizeKey(raw);
  if (text.includes('archived')) return 'archived';
  if (text.includes('complete') && text.includes('issue')) return 'completed-with-issues';
  if (text.includes('complete') && text.includes('minor regression')) return 'completed-with-issues';
  if (text.includes('complete')) return 'completed';
  if (text.includes('blocked') || text.includes('broken') || text.includes('failed')) return 'blocked';
  if (text.includes('needs review')) return 'needs-review';
  if (text.includes('partial') || text.includes('incomplete')) return 'implementation-partial';
  if (text.includes('active')) return 'active';
  if (text.includes('planned')) return 'planned';

  if (fallbackTaskStatuses.length) {
    if (fallbackTaskStatuses.every(status => status === 'verified')) return 'completed';
    if (fallbackTaskStatuses.every(status => status === 'verified' || status === 'implemented')) return 'completed-with-issues';
    if (fallbackTaskStatuses.some(status => status === 'broken' || status === 'blocked')) return 'blocked';
    if (fallbackTaskStatuses.some(status => status === 'implementation-partial' || status === 'implemented' || status === 'verified')) return 'implementation-partial';
    if (fallbackTaskStatuses.some(status => status === 'not-started' || status === 'planned')) return 'active';
  }

  return 'planned';
}

function buildTaskRowsFromTable(table) {
  const firstKey = table.header[0] || '';
  const unit = /phase/i.test(firstKey) ? 'phase'
    : /task/i.test(firstKey) ? 'task'
      : /sprint/i.test(firstKey) ? 'phase'
        : 'task';
  const descriptionKey = table.header.find(key => /description/i.test(key)) || table.header[1] || table.header[0];
  const statusKey = table.header.find(key => /status/i.test(key)) || 'Status';
  const notesKey = table.header.find(key => /notes/i.test(key)) || '';

  return {
    unit,
    rows: table.rows.map(row => {
      const anchor = row[firstKey] || row[descriptionKey] || 'Item';
      const title = row[descriptionKey] || row[firstKey] || 'Item';
      return {
        anchor,
        title,
        rawStatus: row[statusKey] || '',
        notes: notesKey ? row[notesKey] || '' : '',
      };
    }),
  };
}

function phaseHeadingRegex() {
  return /^#{2,3}\s+Phase\s+([0-9]+(?:\.[0-9]+)?)\s*[—:-]\s+(.+)$/gm;
}

function taskHeadingRegex() {
  return /^###\s+Task\s+([0-9]+(?:\.[0-9a-z]+)?)\s*[:—-]\s+(.+)$/gm;
}

function parsePhaseBlocks(text) {
  const matches = [...text.matchAll(phaseHeadingRegex())];
  if (!matches.length) return [];
  return matches.map((match, idx) => {
    const start = match.index ?? 0;
    const contentStart = start + match[0].length;
    const end = idx + 1 < matches.length ? (matches[idx + 1].index ?? text.length) : text.length;
    return {
      number: match[1],
      title: `Phase ${match[1]} — ${match[2].trim()}`,
      anchor: `Phase ${match[1]}`,
      body: text.slice(contentStart, end).trim(),
      order: idx + 1,
    };
  });
}

function parseTasksFromHeadings(phase) {
  const matches = [...phase.body.matchAll(taskHeadingRegex())];
  return matches.map(match => ({
    anchor: `Task ${match[1]}`,
    title: match[2].trim(),
    rawStatus: '',
    notes: '',
    promptId: '',
  }));
}

function parseTasksFromCcpBullets(phase) {
  const lines = phase.body.split('\n');
  return lines
    .map(line => line.trim())
    .filter(line => /^- CCP-\d+(?:-F\d+)?\s+[—-]\s+/.test(line))
    .map(line => {
      const match = line.match(/^- (CCP-\d+(?:-F\d+)?)\s+[—-]\s+(.+)$/);
      return {
        anchor: match ? match[1] : line,
        title: match ? match[2].trim() : line,
        rawStatus: '',
        notes: '',
        promptId: match ? match[1] : '',
      };
    });
}

function parseTasksFromCcpTables(phase) {
  const tables = parseAllMarkdownTables(phase.body);
  const tasks = [];
  for (const table of tables) {
    const ccpKey = table.header.find(key => /^CCP$/i.test(key));
    if (!ccpKey) continue;
    const titleKey = table.header.find(key => /^What$/i.test(key))
      || table.header.find(key => /^Prompt$/i.test(key))
      || table.header[1];
    const typeKey = table.header.find(key => /^Type$/i.test(key));
    for (const row of table.rows) {
      const promptId = row[ccpKey]?.trim();
      if (!promptId || !/^CCP-\d+(?:-F\d+)?$/i.test(promptId)) continue;
      const titleParts = [row[titleKey]?.trim() || '', typeKey ? row[typeKey]?.trim() || '' : ''].filter(Boolean);
      tasks.push({
        anchor: promptId,
        title: titleParts[0] || promptId,
        rawStatus: '',
        notes: '',
        promptId,
      });
    }
  }
  return tasks;
}

function parseStructuredPhasePlan(text) {
  const phases = parsePhaseBlocks(text);
  if (!phases.length) return null;

  const phaseRows = [];
  const taskRows = [];

  for (const phase of phases) {
    const tasks = parseTasksFromHeadings(phase);
    const bulletTasks = parseTasksFromCcpBullets(phase);
    const tableTasks = parseTasksFromCcpTables(phase);
    const fallbackTasks = tasks.length
      ? tasks
      : bulletTasks.length
        ? bulletTasks
        : tableTasks.length
          ? tableTasks
          : [{
              anchor: phase.anchor,
              title: phase.title,
              rawStatus: '',
              notes: '',
              promptId: '',
            }];
    phaseRows.push({
      anchor: phase.anchor,
      title: phase.title,
      rawStatus: '',
      notes: '',
      taskRows: fallbackTasks,
    });
    taskRows.push(...fallbackTasks.map(task => ({ ...task, phaseAnchor: phase.anchor, phaseTitle: phase.title })));
  }

  return { phaseRows, taskRows };
}

function parseAuditSections(text) {
  const sections = new Map();
  const regex = /###\s+\d+\.\s+(.+?)\s+\(`([^`]+)`\)\n([\s\S]*?)(?=\n---\n\n###\s+\d+\.|\n## Cross-Cutting Issues|\n## Summary: What's NOT Implemented Yet|\n## Documents That Need Updating|\n## Recommended Next Actions|$)/g;
  for (const match of text.matchAll(regex)) {
    const title = match[1].trim();
    const fileName = match[2].trim();
    const body = match[3];
    const table = parseMarkdownTable(body);
    const verdict = body.match(/\*\*Verdict:\s*([^*]+)\*\*/)?.[1]?.trim() || '';
    const rowMap = new Map();
    if (table) {
      const rows = buildTaskRowsFromTable(table);
      for (const row of rows.rows) {
        rowMap.set(normalizeKey(row.anchor), row);
      }
    }
    sections.set(fileName, {
      title,
      verdict,
      rows: rowMap,
    });
  }
  return sections;
}

function mentionedSprintDocs(text, selfFile) {
  const matches = [...text.matchAll(/\b([A-Z0-9_]+_SPRINT_[0-9-]+\.md|SPRINT_BACKGROUND_BULK_REVIEW\.md|MOBILE_ANALYSIS_USABILITY_SPRINT_[0-9-]+\.md|OPENINGS_PAGE_OPENINGTREE_IMPLEMENTATION_[0-9-]+\.md|PUZZLE_V1_PHASED_EXECUTION_[0-9-]+\.md)\b/g)]
    .map(match => match[1]);
  return [...new Set(matches.filter(name => name !== selfFile))];
}

function extractAnchorNumber(anchor, prefix) {
  const match = anchor.match(new RegExp(`${prefix}\\s+([0-9]+(?:\\.[0-9a-z]+)?)`, 'i'));
  return match ? match[1] : '';
}

function matchesPromptToAnchor(prompt, anchor) {
  const sourceStep = prompt.sourceStep || '';
  const promptTitle = prompt.title || '';
  if (anchor && anchor.includes(prompt.id)) return true;
  const phaseNumber = extractAnchorNumber(anchor, 'Phase');
  const taskNumber = extractAnchorNumber(anchor, 'Task');
  const sprintNumber = extractAnchorNumber(anchor, 'Sprint');

  if (taskNumber && new RegExp(`Task\\s+${taskNumber.replace('.', '\\.')}(?:\\b|\\s|\\u2014|-)`, 'i').test(sourceStep)) return true;
  if (phaseNumber && new RegExp(`Phase\\s+${phaseNumber.replace('.', '\\.')}(?:\\b|\\s|\\u2014|-)`, 'i').test(sourceStep)) return true;
  if (sprintNumber && new RegExp(`Sprint\\s+${sprintNumber.replace('.', '\\.')}(?:\\b|\\s|\\u2014|-)`, 'i').test(sourceStep)) return true;

  const baseAnchor = anchor.split('—')[0].split('-')[0].trim();
  if (baseAnchor && sourceStep.includes(baseAnchor)) return true;
  if (baseAnchor && promptTitle.includes(baseAnchor)) return true;
  return false;
}

function buildRecommendedSteps(tasks, sourceAudit) {
  const steps = [];
  const ranked = [...tasks].sort((a, b) => {
    const rank = status => {
      switch (status) {
        case 'broken': return 0;
        case 'blocked': return 1;
        case 'implementation-partial': return 2;
        case 'not-started': return 3;
        case 'planned': return 4;
        default: return 5;
      }
    };
    return rank(a.status) - rank(b.status);
  });

  for (const task of ranked) {
    if (!['broken', 'blocked', 'implementation-partial', 'not-started', 'planned'].includes(task.status)) continue;
    const prefix = task.status === 'broken' || task.status === 'blocked'
      ? 'Fix'
      : task.status === 'implementation-partial'
        ? 'Complete'
        : 'Implement';
    steps.push({
      id: `${task.id}-next`,
      title: `${prefix} ${task.title}`,
      reason: task.notes || `Audit marked this task as ${task.status.replace(/-/g, ' ')}.`,
      priority: task.status === 'broken' || task.status === 'blocked' ? 'high' : task.status === 'implementation-partial' ? 'normal' : 'low',
      sourceAudit,
      linkedTaskIds: [task.id],
      suggestedPromptIds: task.linkedPromptIds || [],
    });
  }
  return steps.slice(0, 5);
}

function collectSprintDocs() {
  return readdirSync(SPRINTS_DIR)
    .filter(file => file.endsWith('.md'))
    .filter(file => !EXCLUDE_FILES.has(file))
    .sort();
}

const auditText = readFileSync(AUDIT_PATH, 'utf8');
const auditSections = parseAuditSections(auditText);

const { registry: promptRegistry } = readPromptRegistry(root);
const { registry: sprintRegistry } = readSprintRegistry(root);
ensureSprintAllocator(sprintRegistry);

const existingSprintBySource = new Map(sprintRegistry.sprints.map(sprint => [sprint.sourceDocument, sprint]));
const existingPhaseByKey = new Map(sprintRegistry.phases.map(phase => [`${phase.sprintId}:${phase.sourceAnchor || phase.title}`, phase]));
const existingTaskByKey = new Map(sprintRegistry.tasks.map(task => [`${task.sprintId}:${task.phaseId}:${task.sourceAnchor || task.title}`, task]));

const docFiles = collectSprintDocs();
const newSprints = [];
const newPhases = [];
const newTasks = [];
const sprintIdsByFile = new Map();

for (const file of docFiles) {
  const sourceDocument = `docs/mini-sprints/${file}`;
  const text = readFileSync(resolve(SPRINTS_DIR, file), 'utf8');
  const meta = parseDocMeta(text);
  const audit = auditSections.get(file);
  const table = parseMarkdownTable(text);
  const rowInfo = table ? buildTaskRowsFromTable(table) : { unit: 'task', rows: [] };
  const structuredPlan = rowInfo.rows.length === 0 ? parseStructuredPhasePlan(text) : null;
  const existingSprint = existingSprintBySource.get(sourceDocument);
  const sprintId = existingSprint?.id || reserveNextSprintId(sprintRegistry);
  sprintIdsByFile.set(file, sprintId);

  let phases = [];
  let tasks = [];

  if (rowInfo.rows.length > 0 && rowInfo.unit === 'phase') {
    phases = rowInfo.rows.map((row, idx) => {
      const phaseKey = `${sprintId}:${row.anchor}`;
      const existingPhase = existingPhaseByKey.get(phaseKey);
      return {
        id: existingPhase?.id || `${sprintId}-P${idx + 1}`,
        sprintId,
        title: row.title,
        order: idx + 1,
        status: mapSprintStatus((audit?.rows.get(normalizeKey(row.anchor))?.rawStatus) || row.rawStatus),
        taskIds: [],
        dependencyPhaseIds: [],
        notes: row.notes || '',
        sourceAnchor: row.anchor,
      };
    });
    tasks = phases.map((phase, idx) => {
      const row = rowInfo.rows[idx];
      const phaseAudit = audit?.rows.get(normalizeKey(row.anchor));
      const taskKey = `${sprintId}:${phase.id}:${row.anchor}`;
      const existingTask = existingTaskByKey.get(taskKey);
      return {
        id: existingTask?.id || `${sprintId}-T${String(idx + 1).padStart(2, '0')}`,
        sprintId,
        phaseId: phase.id,
        title: row.title,
        status: mapTaskStatus(phaseAudit?.rawStatus || row.rawStatus),
        linkedPromptIds: [],
        dependencyTaskIds: [],
        auditRefs: [],
        notes: phaseAudit?.notes || row.notes || '',
        acceptance: '',
        sourceAnchor: row.anchor,
      };
    });
  } else if (rowInfo.rows.length > 0) {
    const phase = {
      id: `${sprintId}-P1`,
      sprintId,
      title: 'Tasks',
      order: 1,
      status: 'active',
      taskIds: [],
      dependencyPhaseIds: [],
      notes: '',
      sourceAnchor: 'Tasks',
    };
    phases = [phase];
    tasks = rowInfo.rows.map((row, idx) => {
      const taskKey = `${sprintId}:${phase.id}:${row.anchor}`;
      const existingTask = existingTaskByKey.get(taskKey);
      const auditRow = audit?.rows.get(normalizeKey(row.anchor));
      return {
        id: existingTask?.id || `${sprintId}-T${String(idx + 1).padStart(2, '0')}`,
        sprintId,
        phaseId: phase.id,
        title: row.title,
        status: mapTaskStatus(auditRow?.rawStatus || row.rawStatus),
        linkedPromptIds: [],
        dependencyTaskIds: [],
        auditRefs: [],
        notes: auditRow?.notes || row.notes || '',
        acceptance: '',
        sourceAnchor: row.anchor,
      };
    });
  } else if (structuredPlan?.phaseRows.length) {
    phases = structuredPlan.phaseRows.map((row, idx) => {
      const phaseKey = `${sprintId}:${row.anchor}`;
      const existingPhase = existingPhaseByKey.get(phaseKey);
      const auditRow = audit?.rows.get(normalizeKey(row.anchor));
      const childStatuses = row.taskRows.map(task => {
        const taskAudit = audit?.rows.get(normalizeKey(task.anchor));
        return mapTaskStatus(taskAudit?.rawStatus || auditRow?.rawStatus || task.rawStatus);
      });
      return {
        id: existingPhase?.id || `${sprintId}-P${idx + 1}`,
        sprintId,
        title: row.title,
        order: idx + 1,
        status: mapSprintStatus(auditRow?.rawStatus || row.rawStatus, childStatuses),
        taskIds: [],
        dependencyPhaseIds: [],
        notes: auditRow?.notes || row.notes || '',
        sourceAnchor: row.anchor,
      };
    });
    tasks = structuredPlan.taskRows.map((row, idx) => {
      const phase = phases.find(entry => entry.sourceAnchor === row.phaseAnchor);
      const taskKey = `${sprintId}:${phase.id}:${row.anchor}`;
      const existingTask = existingTaskByKey.get(taskKey);
      const taskAudit = audit?.rows.get(normalizeKey(row.anchor));
      const phaseAudit = audit?.rows.get(normalizeKey(row.phaseAnchor));
      return {
        id: existingTask?.id || `${sprintId}-T${String(idx + 1).padStart(2, '0')}`,
        sprintId,
        phaseId: phase.id,
        title: row.title,
        status: mapTaskStatus(taskAudit?.rawStatus || phaseAudit?.rawStatus || row.rawStatus),
        linkedPromptIds: [],
        dependencyTaskIds: [],
        auditRefs: [],
        notes: taskAudit?.notes || phaseAudit?.notes || row.notes || '',
        acceptance: '',
        sourceAnchor: row.anchor,
      };
    });
  } else {
    const phase = {
      id: `${sprintId}-P1`,
      sprintId,
      title: 'Implementation',
      order: 1,
      status: 'planned',
      taskIds: [],
      dependencyPhaseIds: [],
      notes: '',
      sourceAnchor: 'Implementation',
    };
    const task = {
      id: `${sprintId}-T01`,
      sprintId,
      phaseId: phase.id,
      title: meta.title,
      status: mapTaskStatus(audit?.verdict || meta.statusLine || 'planned'),
      linkedPromptIds: [],
      dependencyTaskIds: [],
      auditRefs: [],
      notes: '',
      acceptance: '',
      sourceAnchor: 'Implementation',
    };
    phases = [phase];
    tasks = [task];
  }

  for (const phase of phases) {
    phase.taskIds = tasks.filter(task => task.phaseId === phase.id).map(task => task.id);
  }

  const taskStatuses = tasks.map(task => task.status);
  const completionSummary = audit?.verdict || meta.statusLine || '';
  const sprint = {
    id: sprintId,
    title: meta.title,
    sourceDocument,
    status: mapSprintStatus(audit?.verdict || meta.statusLine, taskStatuses),
    createdAt: existingSprint?.createdAt || nowIso(),
    updatedAt: nowIso(),
    dependencySprintIds: [],
    phaseIds: phases.map(phase => phase.id),
    auditRefs: [],
    recommendedNextSteps: [],
    completionSummary,
    unassignedPromptIds: [],
    scope: text.match(/^Scope:\s+(.+)$/m)?.[1]?.trim() || '',
    date: meta.dateLine,
  };

  if (meta.sourceAudit) {
    sprint.auditRefs.push({
      id: `${sprintId}-audit-source`,
      sourceDocument: meta.sourceAudit,
      title: 'Source audit',
      type: 'audit',
      status: 'present',
      date: meta.dateLine || '',
    });
  }
  if (audit) {
    sprint.auditRefs.push({
      id: `${sprintId}-audit-bootstrap`,
      sourceDocument: 'docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md',
      title: audit.title,
      type: 'implementation-review',
      status: 'present',
      date: '2026-03-30',
    });
  }

  newSprints.push(sprint);
  newPhases.push(...phases);
  newTasks.push(...tasks);
}

for (const sprint of newSprints) {
  const file = sprint.sourceDocument.split('/').pop();
  const text = readFileSync(resolve(root, sprint.sourceDocument), 'utf8');
  const dependencies = mentionedSprintDocs(text, file).map(depFile => sprintIdsByFile.get(depFile)).filter(Boolean);
  sprint.dependencySprintIds = [...new Set(dependencies)];
}

for (const task of newTasks) {
  const promptsForSprint = promptRegistry.prompts.filter(prompt => prompt.sourceDocument === newSprints.find(sprint => sprint.id === task.sprintId)?.sourceDocument);
  const matched = promptsForSprint.filter(prompt => matchesPromptToAnchor(prompt, task.sourceAnchor || task.title));
  task.linkedPromptIds = [...new Set(matched.map(prompt => prompt.id))];
}

for (const sprint of newSprints) {
  const taskSet = new Set(newTasks.filter(task => task.sprintId === sprint.id).flatMap(task => task.linkedPromptIds));
  const sprintPrompts = promptRegistry.prompts.filter(prompt => prompt.sourceDocument === sprint.sourceDocument);
  sprint.unassignedPromptIds = sprintPrompts.map(prompt => prompt.id).filter(id => !taskSet.has(id));
  const sprintTasks = newTasks.filter(task => task.sprintId === sprint.id);
  sprint.recommendedNextSteps = buildRecommendedSteps(sprintTasks, 'docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md');
}

for (const prompt of promptRegistry.prompts) {
  prompt.sprintId = '';
  prompt.sprintPhaseId = '';
  prompt.sprintTaskId = '';
}

for (const sprint of newSprints) {
  const sprintPrompts = promptRegistry.prompts.filter(prompt => prompt.sourceDocument === sprint.sourceDocument);
  for (const prompt of sprintPrompts) {
    prompt.sprintId = sprint.id;
  }
}

for (const task of newTasks) {
  for (const promptId of task.linkedPromptIds) {
    const prompt = promptRegistry.prompts.find(entry => entry.id === promptId);
    if (!prompt) continue;
    prompt.sprintId = task.sprintId;
    prompt.sprintPhaseId = task.phaseId;
    prompt.sprintTaskId = task.id;
  }
}

sprintRegistry.sprints = newSprints;
sprintRegistry.phases = newPhases;
sprintRegistry.tasks = newTasks;

writeSprintRegistry(root, sprintRegistry);
writePromptRegistry(root, promptRegistry);

console.log(`Backfilled sprint registry for ${newSprints.length} sprint docs.`);
console.log('Running sprints:refresh...');
try {
  execSync('npm run sprints:refresh', { cwd: root, stdio: 'inherit' });
} catch {
  console.log('[sprint:backfill] sprints:refresh reported issues (may be pre-existing).');
}
