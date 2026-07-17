import type { AppearanceSection } from './model';

export const ADVANCED_APPEARANCE_REQUEST_EVENT = 'patzer:advanced-appearance-request';

export interface AdvancedAppearanceRequestDetail {
  section: AppearanceSection;
  opener?: { focus(): void };
}

export function requestAdvancedAppearance(
  section: AppearanceSection,
  opener?: { focus(): void },
  target: Pick<EventTarget, 'dispatchEvent'> = window,
): void {
  target.dispatchEvent(new CustomEvent<AdvancedAppearanceRequestDetail>(ADVANCED_APPEARANCE_REQUEST_EVENT, {
    detail: { section, ...(opener ? { opener } : {}) },
  }));
}
