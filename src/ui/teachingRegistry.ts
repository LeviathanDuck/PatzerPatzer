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
  {
    featureId: 'study-save',
    tipVersion: 1,
    targetId: 'study-save-control',
    title: 'Keep this work',
    body: 'Save the current position or game to Study so you can return to it later.',
    route: '/analysis',
    completionEvent: 'patzer:teaching:study-saved',
    eligible: context => context.route === '/analysis',
  },
  {
    featureId: 'opening-explorer',
    tipVersion: 1,
    targetId: 'opening-explorer-control',
    title: 'Compare real games',
    body: 'Open the explorer with a database selected to compare what players chose here.',
    route: '/analysis',
    completionEvent: 'patzer:teaching:opening-explorer-ready',
    eligible: context => context.route === '/analysis',
  },
];

export const TEACHING_TIPS = validateTeachingRegistry(DEFINITIONS);
