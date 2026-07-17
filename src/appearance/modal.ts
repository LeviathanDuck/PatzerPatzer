import { h, type VNode } from 'snabbdom';
import type { AppearanceController, AppearancePreference } from './index';
import type { AppearanceSection, InterfaceMotion, InterfaceMotionController } from './model';
import type { ControlHelpController, ControlHelpMode, TeachingCadence } from '../ui/controlHelpPreferences';
import { controlExplainerAttrs, iconControlExplainerAttrs } from '../ui/controlExplainer';

const SECTIONS: readonly AppearanceSection[] = ['interface', 'help', 'chessboards', 'graphs-lists'];

type FocusableOpener = { focus(): void };

export interface AdvancedAppearanceController {
  open(section?: AppearanceSection, opener?: FocusableOpener): void;
  close(): void;
  isOpen(): boolean;
  activeSection(): AppearanceSection;
  setActiveSection(section: AppearanceSection): void;
}

export function createAdvancedAppearanceController({
  redraw,
  dispatch = name => window.dispatchEvent(new CustomEvent(name)),
}: {
  redraw: () => void;
  dispatch?: (eventName: string) => void;
}): AdvancedAppearanceController {
  let open = false;
  let section: AppearanceSection = 'interface';
  let opener: FocusableOpener | null = null;
  return {
    open(nextSection = 'interface', nextOpener): void {
      if (!SECTIONS.includes(nextSection)) nextSection = 'interface';
      if (!open && nextOpener) opener = nextOpener;
      open = true;
      section = nextSection;
      dispatch('patzer:teaching:advanced-appearance-opened');
      redraw();
    },
    close(): void {
      if (!open) return;
      open = false;
      const restore = opener;
      opener = null;
      redraw();
      queueMicrotask(() => restore?.focus());
    },
    isOpen: () => open,
    activeSection: () => section,
    setActiveSection(nextSection): void {
      if (!SECTIONS.includes(nextSection) || section === nextSection) return;
      section = nextSection;
      redraw();
    },
  };
}

const THEME_OPTIONS: readonly { value: AppearancePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];
const MOTION_OPTIONS: readonly { value: InterfaceMotion; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
];
const HELP_OPTIONS: readonly { value: ControlHelpMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'essential', label: 'Essential' },
  { value: 'teaching', label: 'Teaching' },
  { value: 'more-help', label: 'More Help' },
];
const CADENCE_OPTIONS: readonly { value: TeachingCadence; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'frequent', label: 'Frequent' },
];

function segmented<T extends string>(
  label: string,
  options: readonly { value: T; label: string }[],
  selected: T,
  setValue: (value: T) => void,
  redraw: () => void,
): VNode {
  return h('fieldset.advanced-appearance__field', [
    h('legend', label),
    h('div.advanced-appearance__segments', options.map(option => h('button.advanced-appearance__segment', {
      class: { active: option.value === selected },
      attrs: {
        type: 'button',
        'aria-pressed': String(option.value === selected),
        ...controlExplainerAttrs({ label: `${label}: ${option.label}`, tier: 'more-help' }),
      },
      on: { click: () => { setValue(option.value); redraw(); } },
    }, option.label))),
  ]);
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )).filter(element => !element.hasAttribute('hidden'));
}

function handleDialogKeydown(event: KeyboardEvent, controller: AdvancedAppearanceController): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    controller.close();
    return;
  }
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget as HTMLElement;
  const focusable = focusableElements(dialog);
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function sectionCard(id: AppearanceSection, title: string, children: Array<VNode | string | null>): VNode {
  return h('section.advanced-appearance__section', {
    attrs: { id: `advanced-appearance-${id}`, 'data-appearance-section': id },
  }, [h('h3', title), ...children]);
}

export function renderAdvancedAppearanceModal({
  controller,
  appearance,
  motion,
  help,
  redraw,
  renderChessboards,
  renderGraphsAndLists,
  resetAppearance,
  confirmReset = () => window.confirm(
    'Reset appearance and help settings? Games, studies, puzzles, analysis, accounts, and sync data will not be changed.',
  ),
}: {
  controller: AdvancedAppearanceController;
  appearance: Pick<AppearanceController, 'getState' | 'setPreference'>;
  motion: Pick<InterfaceMotionController, 'getState' | 'setPreference'>;
  help: Pick<ControlHelpController, 'getState' | 'setMode' | 'setHoverDelayMs' | 'setTeachingCadence' | 'resetTeachingTips' | 'learnedCount'>;
  redraw: () => void;
  renderChessboards: () => VNode;
  renderGraphsAndLists: () => VNode;
  resetAppearance: () => Promise<void> | void;
  confirmReset?: () => boolean;
}): VNode | null {
  if (!controller.isOpen()) return null;
  const appearanceState = appearance.getState();
  const motionState = motion.getState();
  const helpState = help.getState();
  const learnedCount = help.learnedCount();
  const activeSection = controller.activeSection();
  const jump = (section: AppearanceSection) => {
    controller.setActiveSection(section);
    queueMicrotask(() => document.getElementById(`advanced-appearance-${section}`)?.scrollIntoView({ block: 'start' }));
  };
  return h('div.advanced-appearance', { attrs: { role: 'presentation' } }, [
    h('button.advanced-appearance__backdrop', {
      attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Close Advanced Appearance' }) },
      on: { click: () => controller.close() },
    }),
    h('div.advanced-appearance__dialog', {
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'advanced-appearance-title',
      },
      on: { keydown: (event: KeyboardEvent) => handleDialogKeydown(event, controller) },
      hook: {
        insert: vnode => {
          const dialog = vnode.elm as HTMLElement;
          requestAnimationFrame(() => {
            dialog.querySelector<HTMLElement>(`[data-appearance-section="${activeSection}"]`)?.scrollIntoView({ block: 'start' });
            dialog.querySelector<HTMLElement>('.advanced-appearance__close')?.focus();
          });
        },
      },
    }, [
      h('header.advanced-appearance__header', [
        h('div', [
          h('p.advanced-appearance__eyebrow', 'Settings'),
          h('h2#advanced-appearance-title', 'Advanced Appearance'),
        ]),
        h('button.advanced-appearance__close', {
          attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Close Advanced Appearance' }) },
          on: { click: () => controller.close() },
        }, '×'),
      ]),
      h('nav.advanced-appearance__nav', { attrs: { 'aria-label': 'Appearance sections' } }, [
        ...([
          ['interface', 'Interface'],
          ['help', 'Help & tooltips'],
          ['chessboards', 'Chessboards'],
          ['graphs-lists', 'Graphs & lists'],
        ] as const).map(([section, label]) => h('button.advanced-appearance__nav-item', {
          class: { active: activeSection === section },
          attrs: { type: 'button', ...controlExplainerAttrs({ label, tier: 'more-help' }) },
          on: { click: () => jump(section) },
        }, label)),
      ]),
      h('div.advanced-appearance__body', [
        sectionCard('interface', 'Interface', [
          segmented('Color theme', THEME_OPTIONS, appearanceState.preference, value => appearance.setPreference(value), redraw),
          segmented('Interface motion', MOTION_OPTIONS, motionState.preference, value => motion.setPreference(value), redraw),
        ]),
        sectionCard('help', 'Help & tooltips', [
          segmented('Explanation mode', HELP_OPTIONS, helpState.mode, value => help.setMode(value), redraw),
          h('div.advanced-appearance__field', [
            h('label', { attrs: { for: 'control-help-hover-delay' } }, 'Pointer hover delay'),
            h('div.advanced-appearance__range', [
              h('input#control-help-hover-delay', {
                attrs: {
                  type: 'range', min: 250, max: 1500, step: 50, value: helpState.hoverDelayMs,
                  ...controlExplainerAttrs({ label: 'Pointer hover delay', tier: 'more-help' }),
                },
                on: { input: (event: Event) => { help.setHoverDelayMs(Number((event.target as HTMLInputElement).value)); redraw(); } },
              }),
              h('output', `${helpState.hoverDelayMs} ms`),
            ]),
          ]),
          segmented('Teaching cadence', CADENCE_OPTIONS, helpState.teachingCadence, value => help.setTeachingCadence(value), redraw),
          h('div.advanced-appearance__learned', [
            h('span', `${learnedCount} learned ${learnedCount === 1 ? 'tip' : 'tips'}`),
            h('button', {
              attrs: { type: 'button', ...controlExplainerAttrs({
                label: 'Show Teaching tips again',
                description: 'Make completed Teaching tips eligible again without changing games or other data.',
              }) },
              on: { click: () => { help.resetTeachingTips(); redraw(); } },
            }, 'Show Teaching tips again'),
          ]),
        ]),
        sectionCard('chessboards', 'Chessboards', [renderChessboards()]),
        sectionCard('graphs-lists', 'Graphs & lists', [renderGraphsAndLists()]),
      ]),
      h('footer.advanced-appearance__footer', [
        h('button.advanced-appearance__reset', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Reset appearance settings',
            description: 'Restore appearance and help defaults without changing games, studies, puzzles, analysis, accounts, or sync data.',
          }) },
          on: { click: () => {
            if (!confirmReset()) return;
            void Promise.resolve(resetAppearance()).then(redraw);
          } },
        }, 'Reset appearance settings'),
        h('button.advanced-appearance__done', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Done', tier: 'more-help' }) },
          on: { click: () => controller.close() },
        }, 'Done'),
      ]),
    ]),
  ]);
}
