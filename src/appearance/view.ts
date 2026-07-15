import { h, type VNode } from 'snabbdom';
import type { AppearanceController, AppearancePreference } from './index';

const APPEARANCE_CHOICES: readonly { value: AppearancePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export function renderAppearanceSettings(controller: AppearanceController): VNode {
  const selected = controller.getState().preference;
  return h('fieldset.global-menu__item.global-menu__appearance', [
    h('legend', 'Appearance'),
    ...APPEARANCE_CHOICES.map(choice => h('label.global-menu__appearance-choice', [
      h('input', {
        attrs: {
          id: `global-appearance-${choice.value}`,
          type: 'radio',
          name: 'global-appearance',
          value: choice.value,
        },
        props: { checked: selected === choice.value },
        on: {
          change: (event: Event) => {
            if ((event.target as HTMLInputElement).checked) controller.setPreference(choice.value);
          },
        },
      }),
      h('span', choice.label),
    ])),
  ]);
}
