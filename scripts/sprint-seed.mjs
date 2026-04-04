import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRegistry as readPromptRegistry, writeRegistry as writePromptRegistry } from './prompt-registry-lib.mjs';
import {
  hasNormalizedSprintStructure,
  normalizeRepoPath,
  readSprintRegistry,
  writeSprintRegistry,
} from './sprint-registry-lib.mjs';

const root = process.cwd();
const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function nowIso() {
  return new Date().toISOString();
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

function normalizeKey(value) {
  return String(value ?? '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

function parseMarkdownTable(text) {
  return parseAllMarkdownTables(text).find(table => table.header.some(cell => /status/i.test(cell))) || null;
}

function parseDocMeta(text) {
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Untitled Sprint';
  const statusLine = text.match(/^Status:\s+(.+)$/m)?.[1]?.trim() || '';
  const dateLine = text.match(/^Date:\s+(.+)$/m)?.[1]?.trim() || '';
  return { title, statusLine, dateLine };
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
  return phase.body
    .split('\n')
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
    const headingTasks = parseTasksFromHeadings(phase);
    const bulletTasks = parseTasksFromCcpBullets(phase);
    const tableTasks = parseTasksFromCcpTables(phase);
    const fallbackTasks = headingTasks.length
      ? headingTasks
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

function buildSeededStructure(sprint, text, registry) {
  const meta = parseDocMeta(text);
  const table = parseMarkdownTable(text);
  const rowInfo = table ? buildTaskRowsFromTable(table) : { unit: 'task', rows: [] };
  const structuredPlan = rowInfo.rows.length === 0 ? parseStructuredPhasePlan(text) : null;
  const normalizedStructure = hasNormalizedSprintStructure(text);
  const existingPhaseByKey = new Map(
    registry.phases
      .filter(phase => phase.sprintId === sprint.id)
      .map(phase => [`${phase.sprintId}:${phase.sourceAnchor || phase.title}`, phase]),
  );
  const existingTaskByKey = new Map(
    registry.tasks
      .filter(task => task.sprintId === sprint.id)
      .map(task => [`${task.sprintId}:${task.phaseId}:${task.sourceAnchor || task.title}`, task]),
  );

  let phases = [];
  let tasks = [];

  if (rowInfo.rows.length > 0 && rowInfo.unit === 'phase') {
    phases = rowInfo.rows.map((row, idx) => {
      const phaseKey = `${sprint.id}:${row.anchor}`;
      const existingPhase = existingPhaseByKey.get(phaseKey);
      return {
        id: existingPhase?.id || `${sprint.id}-P${idx + 1}`,
        sprintId: sprint.id,
        title: row.title,
        order: idx + 1,
        status: mapSprintStatus(row.rawStatus),
        taskIds: [],
        dependencyPhaseIds: [],
        notes: row.notes || '',
        sourceAnchor: row.anchor,
      };
    });
    tasks = phases.map((phase, idx) => {
      const row = rowInfo.rows[idx];
      const taskKey = `${sprint.id}:${phase.id}:${row.anchor}`;
      const existingTask = existingTaskByKey.get(taskKey);
      return {
        id: existingTask?.id || `${sprint.id}-T${String(idx + 1).padStart(2, '0')}`,
        sprintId: sprint.id,
        phaseId: phase.id,
        title: row.title,
        status: mapTaskStatus(row.rawStatus),
        linkedPromptIds: [],
        dependencyTaskIds: [],
        auditRefs: existingTask?.auditRefs || [],
        auditState: existingTask?.auditState || '',
        auditSourceDocument: existingTask?.auditSourceDocument || '',
        auditUpdatedAt: existingTask?.auditUpdatedAt || '',
        notes: row.notes || existingTask?.notes || '',
        acceptance: existingTask?.acceptance || '',
        sourceAnchor: row.anchor,
      };
    });
  } else if (rowInfo.rows.length > 0) {
    const phase = {
      id: `${sprint.id}-P1`,
      sprintId: sprint.id,
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
      const taskKey = `${sprint.id}:${phase.id}:${row.anchor}`;
      const existingTask = existingTaskByKey.get(taskKey);
      return {
        id: existingTask?.id || `${sprint.id}-T${String(idx + 1).padStart(2, '0')}`,
        sprintId: sprint.id,
        phaseId: phase.id,
        title: row.title,
        status: mapTaskStatus(row.rawStatus),
        linkedPromptIds: [],
        dependencyTaskIds: [],
        auditRefs: existingTask?.auditRefs || [],
        auditState: existingTask?.auditState || '',
        auditSourceDocument: existingTask?.auditSourceDocument || '',
        auditUpdatedAt: existingTask?.auditUpdatedAt || '',
        notes: row.notes || existingTask?.notes || '',
        acceptance: existingTask?.acceptance || '',
        sourceAnchor: row.anchor,
      };
    });
  } else if (structuredPlan?.phaseRows.length) {
    phases = structuredPlan.phaseRows.map((row, idx) => {
      const phaseKey = `${sprint.id}:${row.anchor}`;
      const existingPhase = existingPhaseByKey.get(phaseKey);
      const childStatuses = row.taskRows.map(task => mapTaskStatus(task.rawStatus));
      return {
        id: existingPhase?.id || `${sprint.id}-P${idx + 1}`,
        sprintId: sprint.id,
        title: row.title,
        order: idx + 1,
        status: mapSprintStatus(row.rawStatus, childStatuses),
        taskIds: [],
        dependencyPhaseIds: [],
        notes: row.notes || existingPhase?.notes || '',
        sourceAnchor: row.anchor,
      };
    });
    tasks = structuredPlan.taskRows.map((row, idx) => {
      const phase = phases.find(entry => entry.sourceAnchor === row.phaseAnchor);
      const taskKey = `${sprint.id}:${phase.id}:${row.anchor}`;
      const existingTask = existingTaskByKey.get(taskKey);
      return {
        id: existingTask?.id || `${sprint.id}-T${String(idx + 1).padStart(2, '0')}`,
        sprintId: sprint.id,
        phaseId: phase.id,
        title: row.title,
        status: mapTaskStatus(row.rawStatus),
        linkedPromptIds: [],
        dependencyTaskIds: [],
        auditRefs: existingTask?.auditRefs || [],
        auditState: existingTask?.auditState || '',
        auditSourceDocument: existingTask?.auditSourceDocument || '',
        auditUpdatedAt: existingTask?.auditUpdatedAt || '',
        notes: row.notes || existingTask?.notes || '',
        acceptance: existingTask?.acceptance || '',
        sourceAnchor: row.anchor,
      };
    });
  } else {
    const phase = {
      id: `${sprint.id}-P1`,
      sprintId: sprint.id,
      title: 'Implementation',
      order: 1,
      status: 'planned',
      taskIds: [],
      dependencyPhaseIds: [],
      notes: '',
      sourceAnchor: 'Implementation',
    };
    const existingTask = existingTaskByKey.get(`${sprint.id}:${phase.id}:Implementation`);
    phases = [phase];
    tasks = [{
      id: existingTask?.id || `${sprint.id}-T01`,
      sprintId: sprint.id,
      phaseId: phase.id,
      title: meta.title,
      status: mapTaskStatus(meta.statusLine || 'planned'),
      linkedPromptIds: [],
      dependencyTaskIds: [],
      auditRefs: existingTask?.auditRefs || [],
      auditState: existingTask?.auditState || '',
      auditSourceDocument: existingTask?.auditSourceDocument || '',
      auditUpdatedAt: existingTask?.auditUpdatedAt || '',
      notes: existingTask?.notes || '',
      acceptance: existingTask?.acceptance || '',
      sourceAnchor: 'Implementation',
    }];
  }

  for (const phase of phases) {
    phase.taskIds = tasks.filter(task => task.phaseId === phase.id).map(task => task.id);
  }

  return {
    meta,
    normalizedStructure,
    phases,
    tasks,
  };
}

const sprintId = getFlag('--sprint-id');
if (!sprintId) {
  console.error('Usage: npm run sprint:seed -- --sprint-id SPR-###');
  process.exit(1);
}

try {
  const { registry: sprintRegistry } = readSprintRegistry(root);
  const { registry: promptRegistry } = readPromptRegistry(root);
  const sprint = sprintRegistry.sprints.find(entry => entry.id === sprintId);
  if (!sprint) throw new Error(`Unknown sprint: ${sprintId}`);
  if (!sprint.sourceDocument) throw new Error(`Sprint ${sprintId} is missing sourceDocument.`);

  const sprintDocPath = resolve(root, sprint.sourceDocument);
  const sprintDocText = readFileSync(sprintDocPath, 'utf8');
  if (!hasNormalizedSprintStructure(sprintDocText)) {
    throw new Error(`Sprint source document is not normalized to the current phase/task structure: ${sprint.sourceDocument}`);
  }

  const { meta, normalizedStructure, phases, tasks } = buildSeededStructure(sprint, sprintDocText, sprintRegistry);
  const sprintPrompts = promptRegistry.prompts.filter(prompt => prompt.sourceDocument === sprint.sourceDocument);

  for (const task of tasks) {
    const matched = sprintPrompts.filter(prompt => matchesPromptToAnchor(prompt, task.sourceAnchor || task.title));
    task.linkedPromptIds = [...new Set(matched.map(prompt => prompt.id))];
  }

  const assignedPromptIds = new Set(tasks.flatMap(task => task.linkedPromptIds));
  const file = sprint.sourceDocument.split('/').pop();
  const dependencySprintIds = mentionedSprintDocs(sprintDocText, file)
    .map(depFile => sprintRegistry.sprints.find(entry => entry.sourceDocument === `docs/mini-sprints/${depFile}`)?.id)
    .filter(Boolean);

  sprintRegistry.phases = sprintRegistry.phases.filter(phase => phase.sprintId !== sprintId);
  sprintRegistry.tasks = sprintRegistry.tasks.filter(task => task.sprintId !== sprintId);
  sprintRegistry.phases.push(...phases);
  sprintRegistry.tasks.push(...tasks);

  for (const prompt of sprintPrompts) {
    prompt.sprintId = '';
    prompt.sprintPhaseId = '';
    prompt.sprintTaskId = '';
  }
  for (const task of tasks) {
    for (const promptId of task.linkedPromptIds) {
      const prompt = promptRegistry.prompts.find(entry => entry.id === promptId);
      if (!prompt) continue;
      prompt.sprintId = sprintId;
      prompt.sprintPhaseId = task.phaseId;
      prompt.sprintTaskId = task.id;
    }
  }

  sprint.title = meta.title;
  sprint.phaseIds = phases.map(phase => phase.id);
  sprint.status = mapSprintStatus(meta.statusLine, tasks.map(task => task.status));
  sprint.scope = sprintDocText.match(/^Scope:\s+(.+)$/m)?.[1]?.trim() || sprint.scope || '';
  sprint.date = meta.dateLine || sprint.date || '';
  sprint.dependencySprintIds = [...new Set(dependencySprintIds)];
  sprint.unassignedPromptIds = sprintPrompts
    .filter(prompt => !isSupervisoryPrompt(prompt))
    .map(prompt => prompt.id)
    .filter(id => !assignedPromptIds.has(id));
  sprint.normalizedStructure = normalizedStructure;
  sprint.updatedAt = nowIso();

  writeSprintRegistry(root, sprintRegistry);
  writePromptRegistry(root, promptRegistry);

  console.log(`${sprintId} → seeded from ${normalizeRepoPath(root, sprint.sourceDocument)}`);
  console.log('Running sprint:recompute...');
  execSync('npm run sprint:recompute', { cwd: root, stdio: 'inherit' });
  console.log('Running sprints:refresh...');
  try {
    execSync('npm run sprints:refresh', { cwd: root, stdio: 'inherit' });
  } catch {
    console.log('[sprint:seed] sprints:refresh reported issues (may be pre-existing).');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
