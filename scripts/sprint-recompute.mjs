import { recomputeSprintRegistryState } from './sprint-registry-lib.mjs';
import { readRegistry, writeRegistry } from './prompt-registry-lib.mjs';

const root = process.cwd();

try {
  const { registry: promptRegistry } = readRegistry(root);
  let cleared = 0;
  for (const prompt of promptRegistry.prompts) {
    const hasPartial = !!(prompt.sprintId || prompt.sprintPhaseId || prompt.sprintTaskId)
      && !(prompt.sprintId && prompt.sprintPhaseId && prompt.sprintTaskId);
    if (hasPartial) {
      prompt.sprintId = '';
      prompt.sprintPhaseId = '';
      prompt.sprintTaskId = '';
      cleared += 1;
    }
  }
  if (cleared > 0) writeRegistry(root, promptRegistry);
  const registry = recomputeSprintRegistryState(root);
  console.log(`Recomputed sprint registry state for ${registry.sprints.length} sprints.${cleared > 0 ? ` Cleared ${cleared} partial prompt sprint links.` : ''}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
