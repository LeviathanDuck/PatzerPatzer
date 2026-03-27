import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { generatedDocs, registryPaths } from './prompt-registry-lib.mjs';

const root = process.cwd();
const { paths, queue, log, history } = generatedDocs(root);

mkdirSync(dirname(paths.queue), { recursive: true });
writeFileSync(paths.queue, queue);
writeFileSync(paths.log, log);
writeFileSync(paths.history, history);

console.log('Generated prompt tracking docs:');
console.log(`- ${paths.queue}`);
console.log(`- ${paths.log}`);
console.log(`- ${paths.history}`);
