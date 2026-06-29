declare const __PATZER_RELEASE__: string;
declare const __PATZER_VERSION__: string;
declare const __PATZER_BUILD_ID__: string;
declare const __PATZER_COMMIT__: string;
declare const __PATZER_SHORT_COMMIT__: string;
declare const __PATZER_BRANCH__: string;
declare const __PATZER_COMMIT_TIMESTAMP__: string;
declare const __PATZER_COMMIT_MESSAGE__: string;
declare const __PATZER_BUILT_AT__: string;

export interface ReleaseIdentity {
  app: string;
  release: string;
  version: string;
  buildId: string;
  commit?: string;
  shortCommit?: string;
  branch?: string;
  commitTimestamp?: string;
  commitMessage?: string;
  builtAt?: string;
  deployedAt?: string;
}

let liveIdentity: ReleaseIdentity | null = null;
let liveIdentityRequested = false;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}

function compileTimeIdentity(): ReleaseIdentity {
  const version = requiredString(typeof __PATZER_VERSION__ === 'string' ? __PATZER_VERSION__ : undefined, 'unknown');
  const buildId = requiredString(typeof __PATZER_BUILD_ID__ === 'string' ? __PATZER_BUILD_ID__ : undefined, 'unknown');
  const commit = optionalString(typeof __PATZER_COMMIT__ === 'string' ? __PATZER_COMMIT__ : undefined);
  const shortCommit = optionalString(typeof __PATZER_SHORT_COMMIT__ === 'string' ? __PATZER_SHORT_COMMIT__ : undefined);
  const branch = optionalString(typeof __PATZER_BRANCH__ === 'string' ? __PATZER_BRANCH__ : undefined);
  const commitTimestamp = optionalString(
    typeof __PATZER_COMMIT_TIMESTAMP__ === 'string' ? __PATZER_COMMIT_TIMESTAMP__ : undefined,
  );
  const commitMessage = optionalString(
    typeof __PATZER_COMMIT_MESSAGE__ === 'string' ? __PATZER_COMMIT_MESSAGE__ : undefined,
  );
  const builtAt = optionalString(typeof __PATZER_BUILT_AT__ === 'string' ? __PATZER_BUILT_AT__ : undefined);
  return {
    app: 'patzer-pro',
    release: requiredString(
      typeof __PATZER_RELEASE__ === 'string' ? __PATZER_RELEASE__ : undefined,
      `patzer-pro@${version}+${buildId}`,
    ),
    version,
    buildId,
    ...(commit ? { commit } : {}),
    ...(shortCommit ? { shortCommit } : {}),
    ...(branch ? { branch } : {}),
    ...(commitTimestamp ? { commitTimestamp } : {}),
    ...(commitMessage ? { commitMessage } : {}),
    ...(builtAt ? { builtAt } : {}),
  };
}

function normalizeLiveIdentity(value: unknown): ReleaseIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const version = optionalString(data.version);
  const release = optionalString(data.release);
  const buildId = optionalString(data.shortCommit) ?? optionalString(data.buildId);
  if (!version || !release || !buildId) return null;
  const commit = optionalString(data.commit);
  const shortCommit = optionalString(data.shortCommit) ?? buildId;
  const branch = optionalString(data.branch);
  const commitTimestamp = optionalString(data.commitTimestamp);
  const commitMessage = optionalString(data.commitMessage);
  const builtAt = optionalString(data.builtAt);
  const deployedAt = optionalString(data.deployedAt);

  return {
    app: optionalString(data.app) ?? 'patzer-pro',
    release,
    version,
    buildId,
    shortCommit,
    ...(commit ? { commit } : {}),
    ...(branch ? { branch } : {}),
    ...(commitTimestamp ? { commitTimestamp } : {}),
    ...(commitMessage ? { commitMessage } : {}),
    ...(builtAt ? { builtAt } : {}),
    ...(deployedAt ? { deployedAt } : {}),
  };
}

export function getCompileTimeReleaseIdentity(): ReleaseIdentity {
  return compileTimeIdentity();
}

export function getVisibleReleaseIdentity(): ReleaseIdentity {
  return liveIdentity ?? compileTimeIdentity();
}

export function loadLiveReleaseIdentity(onLoaded?: () => void): void {
  if (liveIdentityRequested || typeof fetch !== 'function') return;
  liveIdentityRequested = true;

  fetch('/version.json', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      const parsed = normalizeLiveIdentity(data);
      if (!parsed) return;
      liveIdentity = parsed;
      onLoaded?.();
    })
    .catch(() => {
      // Local dev and file previews may not have a deploy-time version.json.
    });
}

export function releaseProductLabel(identity: ReleaseIdentity = getVisibleReleaseIdentity()): string {
  return `Patzer Pro v${identity.version}`;
}

export function releaseDeployLabel(identity: ReleaseIdentity = getVisibleReleaseIdentity()): string {
  return `Deploy ${identity.shortCommit ?? identity.buildId}`;
}

function formatReleaseTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function releaseCommitTimestampLabel(identity: ReleaseIdentity = getVisibleReleaseIdentity()): string | null {
  return identity.commitTimestamp ? `Committed ${formatReleaseTimestamp(identity.commitTimestamp)}` : null;
}

export function releaseTooltip(identity: ReleaseIdentity = getVisibleReleaseIdentity()): string {
  const lines = [
    identity.release,
    identity.commit ? `Commit: ${identity.commit}` : null,
    identity.commitTimestamp ? `Committed: ${identity.commitTimestamp}` : null,
    identity.branch ? `Branch: ${identity.branch}` : null,
    identity.deployedAt ? `Deployed: ${identity.deployedAt}` : null,
    identity.builtAt && !identity.deployedAt ? `Built: ${identity.builtAt}` : null,
    identity.commitMessage ? `Message: ${identity.commitMessage}` : null,
  ].filter((line): line is string => line !== null);
  return lines.join('\n');
}
