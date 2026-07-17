import { validateTeachingRegistry, type TeachingTipDefinition } from './teachingHelp';

const DEFINITIONS: readonly TeachingTipDefinition[] = [
  {
    featureId: 'advanced-appearance',
    tipVersion: 1,
    targetId: 'settings-advanced-appearance',
    title: 'Make Patzer yours',
    body: 'Open every visual preference in one place, including boards, graphs, lists, and help.',
    route: '*',
    completionEvent: 'patzer:teaching:advanced-appearance-opened',
    eligible: () => true,
  },
  {
    featureId: 'games-filter',
    tipVersion: 1,
    targetId: 'games-filter-controls',
    title: 'Focus your game library',
    body: 'Combine filters to isolate the games you want to study next.',
    route: '/games',
    completionEvent: 'patzer:teaching:games-filter-applied',
    eligible: context => context.route === '/games',
  },
];

export const TEACHING_TIPS = validateTeachingRegistry(DEFINITIONS);
