import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const queuePath = resolve(root, 'docs/prompts/CLAUDE_PROMPT_QUEUE.md');
const logPath = resolve(root, 'docs/prompts/CLAUDE_PROMPT_LOG.md');
const historyPath = resolve(root, 'docs/prompts/CLAUDE_PROMPT_HISTORY.md');

const queue = readFileSync(queuePath, 'utf8');
const log = readFileSync(logPath, 'utf8');
const history = readFileSync(historyPath, 'utf8');

const uniq = values => [...new Set(values)];
const sorted = values => [...values].sort();
const matches = (text, regex) => [...text.matchAll(regex)].map(m => m[1]);
const difference = (a, b) => sorted(a.filter(id => !b.includes(id)));
const intersection = (a, b) => sorted(a.filter(id => b.includes(id)));

const queueIndexIds = uniq(matches(queue, /^- \[(?: |x)\] (CCP-[A-Z0-9-]+): /gm));
const queueBlockIds = uniq(matches(queue, /^## (CCP-[A-Z0-9-]+) - /gm));
const logChecklistChecked = uniq(matches(log, /^- \[x\] (CCP-[A-Z0-9-]+) - /gm));
const logChecklistPending = uniq(matches(log, /^- \[ \] (CCP-[A-Z0-9-]+) - /gm));
const historyIds = uniq(matches(history, /^## (CCP-[A-Z0-9-]+) — /gm));

const logSections = log.split(/^## /gm).slice(1);
const logDetailIds = [];
const logDetailReviewed = [];
const logPendingOutcomeIds = [];

for (const section of logSections) {
  const line = section.split('\n', 1)[0];
  const idMatch = line.match(/^(CCP-[A-Z0-9-]+) - /);
  if (!idMatch) continue;
  const id = idMatch[1];
  logDetailIds.push(id);
  if (/- \[x\] Reviewed/.test(section)) logDetailReviewed.push(id);
  if (/  - Review outcome: pending/m.test(section)) logPendingOutcomeIds.push(id);
}

const findings = [];
const addFinding = (label, ids) => {
  if (!ids.length) return;
  findings.push({ label, ids });
};

addFinding('Queue index ids missing matching queue blocks', difference(queueIndexIds, queueBlockIds));
addFinding('Queue blocks missing matching queue index ids', difference(queueBlockIds, queueIndexIds));
addFinding('Reviewed prompts still present in queue', intersection(logChecklistChecked, queueBlockIds));
addFinding('Queue prompts missing from log detail entries', difference(queueBlockIds, logDetailIds));
addFinding('Queue prompts not marked pending in log checklist', difference(queueBlockIds, logChecklistPending));
addFinding('Checked-off prompts whose detailed log block is still unchecked', difference(logChecklistChecked, logDetailReviewed));
addFinding('Checked-off prompts whose detailed log outcome is still pending', intersection(logChecklistChecked, logPendingOutcomeIds));
addFinding('Reviewed prompts missing history entries', difference(logChecklistChecked, historyIds));

console.log('Prompt tracking audit');
console.log(`- queue index ids: ${queueIndexIds.length}`);
console.log(`- queue block ids: ${queueBlockIds.length}`);
console.log(`- log checked ids: ${logChecklistChecked.length}`);
console.log(`- log pending ids: ${logChecklistPending.length}`);
console.log(`- log detail ids: ${logDetailIds.length}`);
console.log(`- history ids: ${historyIds.length}`);

if (!findings.length) {
  console.log('\nNo prompt-tracking inconsistencies found.');
  process.exit(0);
}

for (const finding of findings) {
  console.log(`\n${finding.label}:`);
  for (const id of finding.ids) console.log(`- ${id}`);
}

process.exit(1);
