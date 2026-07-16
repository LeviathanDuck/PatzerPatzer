import type { ControlHelpController, ControlHelpState, TeachingCadence } from './controlHelpPreferences';
import { controlExplainerAttrs, iconControlExplainerAttrs } from './controlExplainer';

export const TEACHING_SNOOZE_MS = 12 * 60 * 60 * 1000;

export interface TeachingContext {
  route: string;
}

export interface TeachingTipDefinition {
  featureId: string;
  tipVersion: number;
  targetId: string;
  title: string;
  body: string;
  route?: string;
  completionEvent: string;
  eligible(context: TeachingContext): boolean;
}

export interface TeachingPresentationActions {
  notNow(): void;
  dismiss(): void;
}

export interface TeachingPresenter {
  show(tip: TeachingTipDefinition, actions: TeachingPresentationActions): () => void;
}

type TeachingPreferences = Pick<
  ControlHelpController,
  'getState' | 'subscribe' | 'markLearned' | 'isLearned' | 'snooze' | 'snoozedUntil'
>;

export interface CreateTeachingHelpControllerOptions {
  preferences: TeachingPreferences;
  registry: readonly TeachingTipDefinition[];
  now?: () => number;
  currentRoute(): string;
  targetAvailable(targetId: string): boolean;
  presentationSuppressed(): boolean;
  presenter: TeachingPresenter;
}

export interface TeachingHelpController {
  evaluate(): void;
  complete(eventName: string): void;
  snoozeActive(): void;
  dismissActive(): void;
  handleEscape(): void;
  activeTip(): TeachingTipDefinition | null;
  destroy(): void;
}

const CADENCE: Readonly<Record<TeachingCadence, { perSession: number; minimumGapMs: number }>> = Object.freeze({
  gentle: { perSession: 1, minimumGapMs: 24 * 60 * 60 * 1000 },
  balanced: { perSession: 2, minimumGapMs: 10 * 60 * 1000 },
  frequent: { perSession: 4, minimumGapMs: 3 * 60 * 1000 },
});

function nonBlank(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`Teaching tip ${name} must not be blank.`);
  return normalized;
}

export function validateTeachingRegistry(
  definitions: readonly TeachingTipDefinition[],
): readonly TeachingTipDefinition[] {
  const identities = new Set<string>();
  return Object.freeze(definitions.map(definition => {
    const featureId = nonBlank(definition.featureId, 'feature ID');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(featureId)) {
      throw new TypeError('Teaching feature IDs must use lowercase kebab-case.');
    }
    if (!Number.isInteger(definition.tipVersion) || definition.tipVersion < 1) {
      throw new TypeError('Teaching tip version must be a positive integer.');
    }
    const identity = `${featureId}.${definition.tipVersion}`;
    if (identities.has(identity)) throw new TypeError(`Duplicate Teaching tip identity: ${identity}.`);
    identities.add(identity);
    if (typeof definition.eligible !== 'function') throw new TypeError(`Teaching tip ${identity} needs an eligibility predicate.`);
    return Object.freeze({
      ...definition,
      featureId,
      targetId: nonBlank(definition.targetId, 'target ID'),
      title: nonBlank(definition.title, 'title'),
      body: nonBlank(definition.body, 'body'),
      completionEvent: nonBlank(definition.completionEvent, 'completion event'),
    });
  }));
}

function routeMatches(definition: TeachingTipDefinition, route: string): boolean {
  return !definition.route || definition.route === '*' || definition.route === route;
}

export function createTeachingHelpController({
  preferences,
  registry: uncheckedRegistry,
  now = Date.now,
  currentRoute,
  targetAvailable,
  presentationSuppressed,
  presenter,
}: CreateTeachingHelpControllerOptions): TeachingHelpController {
  const registry = validateTeachingRegistry(uncheckedRegistry);
  let active: TeachingTipDefinition | null = null;
  let removePresentation: (() => void) | null = null;
  let shownCount = 0;
  let lastShownAt = Number.NEGATIVE_INFINITY;
  let destroyed = false;

  const context = (): TeachingContext => ({ route: currentRoute() });
  const available = (tip: TeachingTipDefinition, at = now()): boolean => {
    const nextContext = context();
    return routeMatches(tip, nextContext.route)
      && tip.eligible(nextContext)
      && targetAvailable(tip.targetId)
      && !preferences.isLearned(tip.featureId, tip.tipVersion)
      && preferences.snoozedUntil(tip.featureId, tip.tipVersion) <= at;
  };
  const hide = (): void => {
    const cleanup = removePresentation;
    removePresentation = null;
    active = null;
    cleanup?.();
  };

  const onPreferences = (state: ControlHelpState): void => {
    if (!active) return;
    if (state.mode !== 'teaching' || !state.ready || !available(active)) hide();
  };
  const unsubscribe = preferences.subscribe(onPreferences);

  const controller: TeachingHelpController = {
    evaluate(): void {
      if (destroyed) return;
      if (active) {
        if (!available(active)) hide();
        else return;
      }
      const state = preferences.getState();
      if (!state.ready || state.mode !== 'teaching' || presentationSuppressed()) return;
      const cadence = CADENCE[state.teachingCadence];
      const at = now();
      if (shownCount >= cadence.perSession || at - lastShownAt < cadence.minimumGapMs) return;
      const next = registry.find(tip => available(tip, at));
      if (!next) return;
      active = next;
      shownCount += 1;
      lastShownAt = at;
      removePresentation = presenter.show(next, {
        notNow: () => controller.snoozeActive(),
        dismiss: () => controller.dismissActive(),
      });
    },

    complete(eventName): void {
      for (const tip of registry) {
        if (tip.completionEvent !== eventName || preferences.isLearned(tip.featureId, tip.tipVersion)) continue;
        preferences.markLearned(tip.featureId, tip.tipVersion, now());
      }
      if (active?.completionEvent === eventName) hide();
    },

    snoozeActive(): void {
      if (!active) return;
      preferences.snooze(active.featureId, active.tipVersion, now() + TEACHING_SNOOZE_MS);
      hide();
    },

    dismissActive(): void { hide(); },
    handleEscape(): void { controller.snoozeActive(); },
    activeTip: () => active,

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      hide();
    },
  };

  return controller;
}

function visibleTarget(target: HTMLElement | null): target is HTMLElement {
  if (!target || !target.isConnected || target.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(target);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function positionTeachingCard(card: HTMLElement, target: HTMLElement): void {
  const margin = 12;
  const gap = 10;
  const targetRect = target.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const maximumLeft = Math.max(margin, window.innerWidth - cardRect.width - margin);
  const left = Math.min(maximumLeft, Math.max(margin, targetRect.left + (targetRect.width - cardRect.width) / 2));
  const below = targetRect.bottom + gap;
  const above = targetRect.top - cardRect.height - gap;
  const top = below + cardRect.height <= window.innerHeight - margin ? below : Math.max(margin, above);
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}

function createBrowserPresenter(): TeachingPresenter {
  return {
    show(tip, actions): () => void {
      const target = document.querySelector<HTMLElement>(`[data-teaching-target="${tip.targetId}"]`);
      if (!target) return () => {};
      const card = document.createElement('section');
      const titleId = `pp-teaching-title-${tip.featureId}-${tip.tipVersion}`;
      card.className = 'pp-teaching-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'false');
      card.setAttribute('aria-labelledby', titleId);
      card.dataset.teachingFeature = tip.featureId;

      const header = document.createElement('div');
      header.className = 'pp-teaching-card__header';
      const title = document.createElement('h2');
      title.id = titleId;
      title.textContent = tip.title;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'pp-teaching-card__close';
      Object.entries(iconControlExplainerAttrs({
        label: `Dismiss ${tip.title}`,
        description: 'Close this teaching card without marking the feature as learned.',
      })).forEach(([name, value]) => close.setAttribute(name, value));
      close.textContent = '×';
      close.addEventListener('click', actions.dismiss);
      header.append(title, close);

      const body = document.createElement('p');
      body.className = 'pp-teaching-card__body';
      body.textContent = tip.body;
      const actionsRow = document.createElement('div');
      actionsRow.className = 'pp-teaching-card__actions';
      const notNow = document.createElement('button');
      notNow.type = 'button';
      notNow.className = 'pp-teaching-card__not-now';
      Object.entries(controlExplainerAttrs({
        label: 'Not now',
        description: 'Hide this teaching card for twelve hours.',
        tier: 'more-help',
      })).forEach(([name, value]) => notNow.setAttribute(name, value));
      notNow.textContent = 'Not now';
      notNow.addEventListener('click', actions.notNow);
      actionsRow.appendChild(notNow);
      card.append(header, body, actionsRow);
      document.body.appendChild(card);
      positionTeachingCard(card, target);
      return () => card.remove();
    },
  };
}

export function initBrowserTeachingHelp(
  preferences: TeachingPreferences,
  registry: readonly TeachingTipDefinition[],
): () => void {
  const targetFor = (targetId: string): HTMLElement | null => (
    document.querySelector<HTMLElement>(`[data-teaching-target="${targetId}"]`)
  );
  const controller = createTeachingHelpController({
    preferences,
    registry,
    currentRoute: () => `/${window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'analysis'}`,
    targetAvailable: targetId => visibleTarget(targetFor(targetId)),
    presentationSuppressed: () => Boolean(document.querySelector(
      '.global-menu__dropdown, .detection-modal, .sync-menu, [aria-modal="true"], .context-menu',
    )),
    presenter: createBrowserPresenter(),
  });
  let evaluationQueued = false;
  const queueEvaluation = (): void => {
    if (evaluationQueued) return;
    evaluationQueued = true;
    queueMicrotask(() => {
      evaluationQueued = false;
      controller.evaluate();
    });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && controller.activeTip()) controller.handleEscape();
  };
  const completionListeners = new Map<string, EventListener>();
  for (const eventName of new Set(registry.map(tip => tip.completionEvent))) {
    const listener = () => controller.complete(eventName);
    completionListeners.set(eventName, listener);
    window.addEventListener(eventName, listener);
  }
  window.addEventListener('hashchange', queueEvaluation);
  document.addEventListener('keydown', onKeyDown);
  const observer = new MutationObserver(queueEvaluation);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  queueEvaluation();
  return () => {
    observer.disconnect();
    window.removeEventListener('hashchange', queueEvaluation);
    document.removeEventListener('keydown', onKeyDown);
    for (const [eventName, listener] of completionListeners) window.removeEventListener(eventName, listener);
    controller.destroy();
  };
}
