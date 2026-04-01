import { readRegistry } from './prompt-registry-lib.mjs';

const root = process.cwd();
const { registry } = readRegistry(root);

const args = process.argv.slice(2);
const afterIdx = args.indexOf('--after');
const afterId = afterIdx !== -1 ? args[afterIdx + 1] : 'CCP-457';
const minNumericId = Number((afterId ?? 'CCP-457').match(/^CCP-(\d+)/)?.[1] ?? '457');

const prompts = registry.prompts
  .filter(p => {
    const match = p.id?.match(/^CCP-(\d+)/);
    return match && Number(match[1]) > minNumericId;
  })
  .filter(p => p.queueState !== 'queued-pending')
  .sort((a, b) => Number(a.id.match(/^CCP-(\d+)/)?.[1] ?? '0') - Number(b.id.match(/^CCP-(\d+)/)?.[1] ?? '0'));

const unresolved = prompts.filter(p => p.status !== 'reviewed');
const suspiciousReviewed = prompts.filter(p => p.status === 'reviewed' && p.queueState !== 'not-queued');
const missingProvenance = prompts.filter(p => p.status === 'reviewed' && (!p.reviewedBy || !p.reviewMethod));

const buckets = new Map();
for (const prompt of prompts) {
  const key = `${prompt.status}|${prompt.reviewOutcome}|${prompt.queueState}`;
  buckets.set(key, (buckets.get(key) ?? 0) + 1);
}

console.log(`Post-${afterId} review campaign status`);
console.log(`- eligible prompts: ${prompts.length}`);
console.log(`- unresolved prompts: ${unresolved.length}`);
console.log(`- suspicious reviewed prompts: ${suspiciousReviewed.length}`);
console.log(`- reviewed prompts missing provenance: ${missingProvenance.length}`);
console.log('');
console.log('State summary:');
for (const [key, count] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}\t${key}`);
}

if (unresolved.length) {
  console.log('');
  console.log('Unresolved prompts:');
  for (const prompt of unresolved) {
    console.log(`  ${prompt.id}\t${prompt.queueState}\t${prompt.title}`);
  }
}

if (suspiciousReviewed.length) {
  console.log('');
  console.log('Suspicious reviewed prompts:');
  for (const prompt of suspiciousReviewed) {
    console.log(`  ${prompt.id}\t${prompt.reviewOutcome}\t${prompt.queueState}\t${prompt.title}`);
  }
}

if (missingProvenance.length) {
  console.log('');
  console.log('Reviewed prompts missing provenance:');
  for (const prompt of missingProvenance) {
    console.log(`  ${prompt.id}\t${prompt.reviewOutcome}\t${prompt.queueState}\t${prompt.title}`);
  }
}
