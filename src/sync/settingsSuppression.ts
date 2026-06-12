let remoteApplyDepth = 0;

export function isSettingsRemoteApplySuppressed(): boolean {
  return remoteApplyDepth > 0;
}

export function withSettingsRemoteApplySuppressed<T>(fn: () => T): T {
  remoteApplyDepth += 1;
  try {
    return fn();
  } finally {
    remoteApplyDepth = Math.max(0, remoteApplyDepth - 1);
  }
}
