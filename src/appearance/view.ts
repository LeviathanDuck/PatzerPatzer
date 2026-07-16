import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs } from '../ui/controlExplainer';
import type { AppearanceController, AppearancePreference } from './index';

const APPEARANCE_CHOICES: readonly {
  value: AppearancePreference;
  label: string;
  description: string;
}[] = [
  { value: 'dark', label: 'Dark', description: 'Always use the dark color theme.' },
  { value: 'light', label: 'Light', description: 'Always use the light color theme.' },
  { value: 'system', label: 'System', description: "Match your device's color-scheme preference." },
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
          ...controlExplainerAttrs({ label: `${choice.label} appearance`, description: choice.description }),
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
