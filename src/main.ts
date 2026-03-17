import { init, classModule, attributesModule, h, type VNode } from 'snabbdom';
import { current, onChange, type Route } from './router';

console.log('Patzer Pro');

const patch = init([classModule, attributesModule]);

function view(route: Route): VNode {
  switch (route.name) {
    case 'analysis-game':
      return h('div', [h('h1', `Analysis Game: ${route.params['id']}`)]);
    case 'analysis':
      return h('div', [h('h1', 'Analysis Page')]);
    case 'puzzles':
      return h('div', [h('h1', 'Puzzles Page')]);
    default:
      return h('div', [h('h1', 'Home')]);
  }
}

const app = document.getElementById('app')!;
let vnode = patch(app, view(current()));

onChange(route => {
  vnode = patch(vnode, view(route));
});
