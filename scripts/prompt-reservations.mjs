import { readRegistry } from './prompt-registry-lib.mjs';

const root = process.cwd();
const includeReleased = process.argv.slice(2).includes('--all');

try {
  const { registry } = readRegistry(root);
  const reservations = registry.prompts
    .filter(prompt => prompt.status === 'reserved' && (includeReleased || !prompt.reservationReleasedAt))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  if (!reservations.length) {
    console.log(includeReleased ? 'No reserved prompts found.' : 'No active reservations found.');
    process.exit(0);
  }

  for (const prompt of reservations) {
    const released = prompt.reservationReleasedAt ? ` released=${prompt.reservationReleasedAt}` : '';
    console.log(`${prompt.id} | created=${prompt.createdAt || 'unknown'} | by=${prompt.createdBy || 'Unknown'} | title=${prompt.title}${released}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
