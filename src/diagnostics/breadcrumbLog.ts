import { getSessionId, newEventId } from './id';
import { putEventWithEviction } from './idbStore';
import {
  Severity,
  type DiagnosticEvent,
  type LifecycleBreadcrumb,
  type RouteBreadcrumb,
  type ToolModeBreadcrumb,
} from './types';

type DurableBreadcrumb = RouteBreadcrumb | LifecycleBreadcrumb | ToolModeBreadcrumb;

function eventKindForBreadcrumb(breadcrumb: DurableBreadcrumb): DiagnosticEvent['kind'] {
  return breadcrumb.type === 'route-transition' ? 'route' : 'lifecycle';
}

function messageForBreadcrumb(breadcrumb: DurableBreadcrumb): string {
  switch (breadcrumb.type) {
    case 'route-transition':
      return `Route transition: ${breadcrumb.from} -> ${breadcrumb.to}`;
    case 'lifecycle-change':
      return breadcrumb.event;
    case 'tool-mode-change':
      return breadcrumb.mode
        ? `Tool mode changed: ${breadcrumb.tool} -> ${breadcrumb.mode}`
        : `Tool mode changed: ${breadcrumb.tool}`;
  }
}

function routeForBreadcrumb(breadcrumb: DurableBreadcrumb): string {
  return breadcrumb.type === 'route-transition' ? breadcrumb.to : '';
}

function eventForBreadcrumb(breadcrumb: DurableBreadcrumb): DiagnosticEvent {
  return {
    eventId: newEventId(),
    sessionId: getSessionId(),
    timestamp: breadcrumb.timestamp,
    kind: eventKindForBreadcrumb(breadcrumb),
    severity: Severity.Info,
    route: routeForBreadcrumb(breadcrumb),
    source: 'diagnostics.breadcrumb',
    message: messageForBreadcrumb(breadcrumb),
    metadata: {
      breadcrumbType: breadcrumb.type,
    },
    redactionClass: 'safe',
    breadcrumbs: [breadcrumb],
  };
}

export function appendDurableBreadcrumb(breadcrumb: DurableBreadcrumb): void {
  putEventWithEviction(eventForBreadcrumb(breadcrumb)).catch(() => {
    // Diagnostics persistence must not throw into app code.
  });
}
