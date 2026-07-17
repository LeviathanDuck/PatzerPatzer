import type { AppearanceController } from './index';
import type { InterfaceMotionController } from './model';
import {
  CONTROL_HELP_DEFAULT_DELAY_MS,
  CONTROL_HELP_LEARNED_PREFIX,
  CONTROL_HELP_SNOOZED_PREFIX,
  type ControlHelpController,
} from '../ui/controlHelpPreferences';
import { resetBoardAppearancePreferences } from '../board/cosmetics';
import { resetEvalGraphAppearancePreferences } from '../analyse/graphSettings';
import { resetGamesAppearancePreferences } from '../games/view';
import { resetNavigatorAppearancePreferences } from '../study/navigatorSettings';

function removePrefixedKeys(prefixes: readonly string[]): void {
  const removals: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && prefixes.some(prefix => key.startsWith(prefix))) removals.push(key);
  }
  for (const key of removals) localStorage.removeItem(key);
}

export function resetAppearanceAndHelpPreferences({
  appearance,
  motion,
  help,
}: {
  appearance: Pick<AppearanceController, 'clearPreference'>;
  motion: Pick<InterfaceMotionController, 'clearPreference'>;
  help: Pick<ControlHelpController, 'setMode' | 'setHoverDelayMs' | 'setTeachingCadence' | 'resetTeachingTips'>;
}): void {
  appearance.clearPreference();
  motion.clearPreference();
  resetBoardAppearancePreferences();
  resetEvalGraphAppearancePreferences();
  resetGamesAppearancePreferences();
  resetNavigatorAppearancePreferences();
  removePrefixedKeys([CONTROL_HELP_LEARNED_PREFIX, CONTROL_HELP_SNOOZED_PREFIX]);
  help.setMode('essential');
  help.setHoverDelayMs(CONTROL_HELP_DEFAULT_DELAY_MS);
  help.setTeachingCadence('balanced');
  help.resetTeachingTips();
}
