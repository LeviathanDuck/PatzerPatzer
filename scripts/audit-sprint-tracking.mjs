import { readFileSync } from 'node:fs';
import { buildSprintDashboardData, sprintRegistryPaths, validateSprintRegistry, renderSprintStatus } from './sprint-registry-lib.mjs';

const root = process.cwd();
const { paths, registry, findings } = validateSprintRegistry(root);
const generatedStatus = renderSprintStatus(root);
const statusText = readFileSync(paths.status, 'utf8');
const dashboardPath = sprintRegistryPaths(root).root + '/docs/prompts/dashboard.html';
let dashboardText = '';
try {
  dashboardText = readFileSync(dashboardPath, 'utf8');
} catch {
  findings.push(`Dashboard missing: ${dashboardPath}`);
}

if (statusText !== generatedStatus) findings.push(`Generated sprint status doc does not match ${paths.status}`);
if (dashboardText && !dashboardText.includes('Sprints')) findings.push('Generated dashboard is missing sprint tab content.');

const data = buildSprintDashboardData(root);
const totalTasks = registry.tasks.length;
const active = data.sprints.filter(sprint => ['active', 'implementation-partial', 'needs-review', 'blocked'].includes(sprint.status)).length;
const completed = data.sprints.filter(sprint => ['completed', 'completed-with-issues', 'archived'].includes(sprint.status)).length;

console.log('Sprint tracking audit');
console.log(`- sprint ids: ${registry.sprints.length}`);
console.log(`- phase ids: ${registry.phases.length}`);
console.log(`- task ids: ${totalTasks}`);
console.log(`- active/problem sprints: ${active}`);
console.log(`- completed/archived sprints: ${completed}`);

if (!findings.length) {
  console.log('\nNo sprint-tracking inconsistencies found.');
  process.exit(0);
}

for (const finding of findings) console.log(`- ${finding}`);
process.exit(1);
