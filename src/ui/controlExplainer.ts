import { h, type VNode } from 'snabbdom';

export interface ControlExplainer {
  label: string;
  description?: string;
}

const LABEL_ATTR = 'data-control-explainer-label';
const DESCRIPTION_ATTR = 'data-control-explainer-description';
const TRIGGER_SELECTOR = `[${LABEL_ATTR}]`;
const TOOLTIP_ID = 'pp-control-explainer';
const HOVER_DELAY_MS = 400;
const VIEWPORT_MARGIN_PX = 8;
const TARGET_GAP_PX = 8;

let installedCleanup: (() => void) | null = null;

function normalizedExplainer(explainer: ControlExplainer): ControlExplainer {
  const label = explainer.label.trim();
  if (!label) throw new TypeError('A control explainer label must not be blank.');
  const description = explainer.description?.trim();
  return description ? { label, description } : { label };
}

export function controlExplainerAttrs(explainer: ControlExplainer): Record<string, string> {
  const normalized = normalizedExplainer(explainer);
  return {
    [LABEL_ATTR]: normalized.label,
    ...(normalized.description ? { [DESCRIPTION_ATTR]: normalized.description } : {}),
  };
}

export function iconControlExplainerAttrs(explainer: ControlExplainer): Record<string, string> {
  const normalized = normalizedExplainer(explainer);
  return {
    ...controlExplainerAttrs(normalized),
    'aria-label': normalized.label,
  };
}

export function renderDisabledControlExplainer(explainer: ControlExplainer, control: VNode): VNode {
  const normalized = normalizedExplainer(explainer);
  if (!normalized.description) {
    throw new TypeError('A disabled control explainer must include the reason it is unavailable.');
  }

  return h(
    'span.control-explainer-disabled',
    {
      attrs: {
        ...controlExplainerAttrs(normalized),
        tabindex: '0',
        role: 'button',
        'aria-disabled': 'true',
        'aria-label': normalized.label,
      },
    },
    [
      h(
        'span.control-explainer-disabled__visual',
        { attrs: { 'aria-hidden': 'true', inert: '' } },
        [control],
      ),
    ],
  );
}

function explainerTarget(candidate: EventTarget | null): HTMLElement | null {
  return candidate instanceof Element ? candidate.closest<HTMLElement>(TRIGGER_SELECTOR) : null;
}

function containsEventTarget(container: HTMLElement, candidate: EventTarget | null): boolean {
  return candidate instanceof Element && container.contains(candidate);
}

function addDescribedBy(target: HTMLElement): void {
  const ids = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(TOOLTIP_ID);
  target.setAttribute('aria-describedby', [...ids].join(' '));
}

function removeDescribedBy(target: HTMLElement): void {
  const ids = (target.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(id => id && id !== TOOLTIP_ID);
  if (ids.length) target.setAttribute('aria-describedby', ids.join(' '));
  else target.removeAttribute('aria-describedby');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Install the single delegated control-explainer controller.
 *
 * The returned cleanup is primarily for tests and future route-shell teardown. Calling init again
 * first removes the earlier controller, so duplicate document listeners and tooltip nodes cannot
 * accumulate.
 */
export function initControlExplainers(): () => void {
  installedCleanup?.();

  const tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.className = 'pp-control-explainer';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;

  const labelNode = document.createElement('div');
  labelNode.className = 'pp-control-explainer__label';
  const descriptionNode = document.createElement('div');
  descriptionNode.className = 'pp-control-explainer__description';
  tooltip.appendChild(labelNode);
  tooltip.appendChild(descriptionNode);
  document.body.appendChild(tooltip);

  let activeTarget: HTMLElement | null = null;
  let hoveredTarget: HTMLElement | null = null;
  let focusedTarget: HTMLElement | null = null;
  let pendingTarget: HTMLElement | null = null;
  let pointerInsideTooltip = false;
  let inputModality: 'keyboard' | 'mouse' | 'touch' = 'keyboard';
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverGeneration = 0;

  const cancelPending = (): void => {
    hoverGeneration += 1;
    pendingTarget = null;
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    hoverTimer = null;
  };

  const positionTooltip = (): void => {
    if (!activeTarget || tooltip.hidden) return;
    const targetRect = activeTarget.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maxLeft = window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN_PX;
    const centeredLeft = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
    const left = clamp(centeredLeft, VIEWPORT_MARGIN_PX, maxLeft);

    const below = targetRect.bottom + TARGET_GAP_PX;
    const above = targetRect.top - tooltipRect.height - TARGET_GAP_PX;
    const preferredTop = below + tooltipRect.height <= window.innerHeight - VIEWPORT_MARGIN_PX
      ? below
      : above;
    const maxTop = window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN_PX;
    const top = clamp(preferredTop, VIEWPORT_MARGIN_PX, maxTop);

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  };

  const updateCopy = (): boolean => {
    if (!activeTarget) return false;
    const label = activeTarget.getAttribute(LABEL_ATTR)?.trim() || '';
    if (!label) return false;
    const description = activeTarget.getAttribute(DESCRIPTION_ATTR)?.trim() || '';
    labelNode.textContent = label;
    descriptionNode.textContent = description;
    descriptionNode.hidden = !description;
    return true;
  };

  const hide = (): void => {
    cancelPending();
    if (activeTarget) removeDescribedBy(activeTarget);
    activeTarget = null;
    tooltip.hidden = true;
    tooltip.classList.remove('pp-control-explainer--pointer');
    labelNode.textContent = '';
    descriptionNode.textContent = '';
  };

  const show = (target: HTMLElement, source: 'focus' | 'pointer'): void => {
    if (!target.isConnected) return;
    cancelPending();
    if (activeTarget && activeTarget !== target) removeDescribedBy(activeTarget);
    activeTarget = target;
    if (!updateCopy()) {
      hide();
      return;
    }
    addDescribedBy(target);
    if (source === 'pointer') tooltip.classList.add('pp-control-explainer--pointer');
    else tooltip.classList.remove('pp-control-explainer--pointer');
    tooltip.hidden = false;
    positionTooltip();
  };

  const scheduleHover = (target: HTMLElement): void => {
    cancelPending();
    if (activeTarget && activeTarget !== target) {
      removeDescribedBy(activeTarget);
      activeTarget = null;
      tooltip.hidden = true;
    }
    pendingTarget = target;
    const generation = hoverGeneration;
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      if (generation !== hoverGeneration || pendingTarget !== target || hoveredTarget !== target) return;
      pendingTarget = null;
      show(target, 'pointer');
    }, HOVER_DELAY_MS);
  };

  const onPointerDown = (event: PointerEvent): void => {
    inputModality = event.pointerType === 'touch' ? 'touch' : 'mouse';
    if (inputModality === 'touch') {
      hoveredTarget = null;
      pointerInsideTooltip = false;
      hide();
    }
  };

  const onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    inputModality = 'mouse';
    if (containsEventTarget(tooltip, event.target)) {
      pointerInsideTooltip = true;
      return;
    }
    const target = explainerTarget(event.target);
    if (!target) return;
    if (containsEventTarget(target, event.relatedTarget)) return;
    hoveredTarget = target;
    if (activeTarget === target && !tooltip.hidden) {
      tooltip.classList.add('pp-control-explainer--pointer');
      updateCopy();
      positionTooltip();
    } else scheduleHover(target);
  };

  const onPointerOut = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    if (containsEventTarget(tooltip, event.target)) {
      if (containsEventTarget(tooltip, event.relatedTarget)) return;
      pointerInsideTooltip = false;
      if (!hoveredTarget && focusedTarget !== activeTarget) hide();
      return;
    }

    const target = explainerTarget(event.target);
    if (!target || containsEventTarget(target, event.relatedTarget)) return;
    if (hoveredTarget === target) hoveredTarget = null;
    if (pendingTarget === target) cancelPending();
    if (containsEventTarget(tooltip, event.relatedTarget)) {
      pointerInsideTooltip = true;
      return;
    }
    if (activeTarget === target && focusedTarget !== target) hide();
  };

  const onFocusIn = (event: FocusEvent): void => {
    const target = explainerTarget(event.target);
    if (!target) return;
    if (inputModality !== 'keyboard') {
      // Pointer-origin focus must not retain a tooltip after the pointer leaves. Mouse hover owns
      // its own delayed/persistent lifetime; touch focus remains entirely suppressed.
      focusedTarget = null;
      return;
    }
    focusedTarget = target;
    show(target, 'focus');
  };

  const onFocusOut = (event: FocusEvent): void => {
    const target = explainerTarget(event.target);
    if (!target) return;
    const nextTarget = explainerTarget(event.relatedTarget);
    focusedTarget = nextTarget;
    if (nextTarget) {
      if (inputModality === 'keyboard') show(nextTarget, 'focus');
      return;
    }
    if (activeTarget === target && hoveredTarget !== target && !pointerInsideTooltip) hide();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    inputModality = 'keyboard';
    if (event.key === 'Escape' && (!tooltip.hidden || hoverTimer !== null)) hide();
  };

  const onViewportChange = (): void => positionTooltip();

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerover', onPointerOver);
  document.addEventListener('pointerout', onPointerOut);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);

  const observer = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(records => {
      // Updating the tooltip's own text creates child-list records. Ignore those records so the
      // observer cannot recursively call updateCopy()/positionTooltip forever.
      const relevant = records.some(record => {
        if (record.target instanceof Element && tooltip.contains(record.target)) return false;
        if (record.type === 'attributes') return record.target === activeTarget || record.target === pendingTarget;
        return record.type === 'childList';
      });
      if (!relevant) return;
      if (pendingTarget && !pendingTarget.isConnected) cancelPending();
      if (!activeTarget) return;
      if (!activeTarget.isConnected || !updateCopy()) hide();
      else positionTooltip();
    });
  observer?.observe(document.body, {
    attributes: true,
    attributeFilter: [LABEL_ATTR, DESCRIPTION_ATTR],
    childList: true,
    subtree: true,
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    cancelPending();
    if (activeTarget) removeDescribedBy(activeTarget);
    observer?.disconnect();
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
    tooltip.remove();
    if (installedCleanup === cleanup) installedCleanup = null;
  };

  installedCleanup = cleanup;
  return cleanup;
}
