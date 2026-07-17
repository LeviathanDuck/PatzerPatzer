import { h, type VNode } from 'snabbdom';

export function renderSettingsIcon(): VNode {
  return h('svg.settings-icon', {
    attrs: {
      viewBox: '0 0 24 24',
      width: '21',
      height: '21',
      fill: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
  }, [
    h('path', {
      attrs: {
        d: 'M9.7 3.4 10.3 2h3.4l.6 1.4 1.7.7 1.4-.6 2.4 2.4-.6 1.4.7 1.7 1.4.6v3.4l-1.4.6-.7 1.7.6 1.4-2.4 2.4-1.4-.6-1.7.7-.6 1.4h-3.4l-.6-1.4-1.7-.7-1.4.6-2.4-2.4.6-1.4-.7-1.7-1.4-.6V9.6L4.1 9l.7-1.7-.6-1.4 2.4-2.4 1.4.6 1.7-.7Z',
        stroke: 'currentColor',
        'stroke-width': '1.7',
        'stroke-linejoin': 'round',
      },
    }),
    h('circle', {
      attrs: { cx: '12', cy: '11.3', r: '3.1', stroke: 'currentColor', 'stroke-width': '1.7' },
    }),
  ]);
}
