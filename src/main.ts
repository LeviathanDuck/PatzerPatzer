import { init, classModule, attributesModule, h, type VNode } from 'snabbdom';
import { current, onChange, type Route } from './router';

console.log('Patzer Pro');

const patch = init([classModule, attributesModule]);

// Derive the active section from the first path segment
function activeSection(route: Route): string {
  switch (route.name) {
    case 'analysis':
    case 'analysis-game':
      return 'analysis';
    case 'puzzles':
      return 'puzzles';
    case 'openings':
      return 'openings';
    case 'stats':
      return 'stats';
    default:
      return '';
  }
}

const navLinks: { label: string; href: string; section: string }[] = [
  { label: 'Analysis', href: '#/analysis', section: 'analysis' },
  { label: 'Puzzles',  href: '#/puzzles',  section: 'puzzles'  },
  { label: 'Openings', href: '#/openings', section: 'openings' },
  { label: 'Stats',    href: '#/stats',    section: 'stats'    },
];

function renderNav(route: Route): VNode {
  const active = activeSection(route);
  return h('nav', navLinks.map(({ label, href, section }) =>
    h('a', { attrs: { href }, class: { active: active === section } }, label)
  ));
}

function routeContent(route: Route): VNode {
  switch (route.name) {
    case 'analysis-game':
      return h('h1', `Analysis Game: ${route.params['id']}`);
    case 'analysis':
      return h('h1', 'Analysis Page');
    case 'puzzles':
      return h('h1', 'Puzzles Page');
    case 'openings':
      return h('h1', 'Openings Page');
    case 'stats':
      return h('h1', 'Stats Page');
    default:
      return h('h1', 'Home');
  }
}

function view(route: Route): VNode {
  return h('div#shell', [
    h('header', [h('span', 'Patzer Pro'), renderNav(route)]),
    h('main', [routeContent(route)]),
  ]);
}

const app = document.getElementById('app')!;
let vnode = patch(app, view(current()));

onChange(route => {
  vnode = patch(vnode, view(route));
});
