export interface VersionedPullRecoveryResponse {
  ok?: boolean;
  code?: string;
  error?: string;
  fullPullRequired?: boolean;
  latestVersion?: number;
}

export interface VersionedApplyCursorResult {
  ok: boolean;
  latestAppliedVersion: number;
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function shouldRunFullVersionedPull(response: VersionedPullRecoveryResponse): boolean {
  return response.fullPullRequired === true
    || response.code === 'cursor-too-old'
    || response.error === 'cursor-too-old';
}

export function cursorAfterVersionedApply(
  result: VersionedApplyCursorResult,
  responseLatestVersion: unknown,
): number {
  const latestAppliedVersion = validVersion(result.latestAppliedVersion)
    ? result.latestAppliedVersion
    : 0;
  if (!result.ok) return latestAppliedVersion;
  const latestResponseVersion = validVersion(responseLatestVersion)
    ? responseLatestVersion
    : 0;
  return Math.max(latestAppliedVersion, latestResponseVersion);
}
