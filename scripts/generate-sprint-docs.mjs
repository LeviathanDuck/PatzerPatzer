import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderSprintStatus, sprintRegistryPaths } from './sprint-registry-lib.mjs';

const root = process.cwd();
const paths = sprintRegistryPaths(root);
const status = renderSprintStatus(root);

mkdirSync(dirname(paths.status), { recursive: true });
writeFileSync(paths.status, status);

console.log('Generated sprint tracking docs:');
console.log(`- ${paths.status}`);
