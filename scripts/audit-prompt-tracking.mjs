import { readFileSync } from 'node:fs';
import { generatedDocs, registryPaths, validateRegistry } from './prompt-registry-lib.mjs';

const root = process.cwd();
const { paths, registry, findings } = validateRegistry(root);
const generated = generatedDocs(root);

const queueText = readFileSync(paths.queue, 'utf8');
const logText = readFileSync(paths.log, 'utf8');
const historyText = readFileSync(paths.history, 'utf8');
const dashboardText = readFileSync(paths.dashboard, 'utf8');

if (queueText !== generated.queue) findings.push(`Generated queue doc does not match ${paths.queue}`);
if (logText !== generated.log) findings.push(`Generated log doc does not match ${paths.log}`);
if (historyText !== generated.history) findings.push(`Generated history doc does not match ${paths.history}`);
if (!dashboardText.includes('Prompt Tracking Dashboard')) findings.push(`Generated dashboard doc looks invalid: ${paths.dashboard}`);

const queueIndexIds = registry.prompts.filter(p => p.queueState !== 'not-queued').length;
const logCheckedIds = registry.prompts.filter(p => p.status === 'reviewed').length;
const logPendingIds = registry.prompts.filter(p => p.status !== 'reviewed').length;
const startedIds = registry.prompts.filter(p => p.queueState === 'queued-started' || p.queueState === 'queued-run').length;

console.log('Prompt tracking audit');
console.log(`- registry ids: ${registry.prompts.length}`);
console.log(`- queue ids: ${queueIndexIds}`);
console.log(`- started ids: ${startedIds}`);
console.log(`- reviewed ids: ${logCheckedIds}`);
console.log(`- pending ids: ${logPendingIds}`);

if (!findings.length) {
  console.log('\nNo prompt-tracking inconsistencies found.');
  process.exit(0);
}

for (const finding of findings) console.log(`- ${finding}`);
process.exit(1);
