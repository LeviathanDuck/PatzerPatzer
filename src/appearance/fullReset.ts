export interface ClearLocalDataResetDependencies {
  confirmReset(): boolean;
  clearAppearancePreference(): void;
  clearRemainingLocalData(): Promise<void>;
  reload(): void;
}

/**
 * Runs the explicit Clear Local Data sequence through injectable effects so its ordering can be
 * verified without duplicating the orchestration in a test. Account logout intentionally does not
 * use this helper because logout preserves the device-local appearance choice.
 */
export async function runClearLocalDataReset({
  confirmReset,
  clearAppearancePreference,
  clearRemainingLocalData,
  reload,
}: ClearLocalDataResetDependencies): Promise<boolean> {
  if (!confirmReset()) return false;
  clearAppearancePreference();
  await clearRemainingLocalData();
  reload();
  return true;
}
