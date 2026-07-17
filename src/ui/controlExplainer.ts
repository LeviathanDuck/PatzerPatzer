import { h, type VNode } from 'snabbdom';
import type { ControlHelpController, ControlHelpMode } from './controlHelpPreferences';

export type ControlHelpTier = 'essential' | 'more-help';

export interface ControlExplainer {
  label: string;
  description?: string;
  tier?: ControlHelpTier;
}

const LABEL_ATTR = 'data-control-explainer-label';
const DESCRIPTION_ATTR = 'data-control-explainer-description';
const TIER_ATTR = 'data-control-help-tier';
const TRIGGER_SELECTOR = `[${LABEL_ATTR}]`;
const TOOLTIP_ID = 'pp-control-explainer';
const FALLBACK_HOVER_DELAY_MS = 650;
const VIEWPORT_MARGIN_PX = 8;
const TARGET_GAP_PX = 8;

let installedCleanup: (() => void) | null = null;

function normalizedExplainer(explainer: ControlExplainer): ControlExplainer {
  const label = explainer.label.trim();
  if (!label) throw new TypeError('A control explainer label must not be blank.');
  const description = explainer.description?.trim();
  // Text controls with authored explanations belong to the opt-in richer-help layer by default.
  // Icon-only and disabled controls override this below because their essential meaning/reason
  // must remain discoverable without making ordinary navigation chatter on hover.
  const tier = explainer.tier ?? 'more-help';
  if (tier !== 'essential' && tier !== 'more-help') {
    throw new TypeError('A control explainer tier must be essential or more-help.');
  }
  return description ? { label, description, tier } : { label, tier };
}

export function controlNameAttrs(label: string): Record<string, string> {
  const normalized = label.trim();
  if (!normalized) throw new TypeError('A control accessible name must not be blank.');
  return { 'aria-label': normalized };
}

export function controlExplainerAttrs(explainer: ControlExplainer): Record<string, string> {
  const normalized = normalizedExplainer(explainer);
  return {
    [LABEL_ATTR]: normalized.label,
    ...(normalized.description ? { [DESCRIPTION_ATTR]: normalized.description } : {}),
    [TIER_ATTR]: normalized.tier!,
  };
}

export function iconControlExplainerAttrs(explainer: ControlExplainer): Record<string, string> {
  const normalized = normalizedExplainer(explainer);
  return {
    [LABEL_ATTR]: normalized.label,
    ...(normalized.description ? { [DESCRIPTION_ATTR]: normalized.description } : {}),
    [TIER_ATTR]: 'essential',
    'aria-label': normalized.label,
  };
}

type SemanticVNode = {
  vnode: VNode;
  role: string;
};

function vnodeTagName(vnode: VNode): string {
  return vnode.sel?.match(/^[^.#]+/)?.[0]?.toLowerCase() ?? '';
}

function vnodeAttr(vnode: VNode, name: string): unknown {
  return vnode.data?.attrs?.[name];
}

function vnodeProp(vnode: VNode, name: string): unknown {
  return vnode.data?.props?.[name];
}

function inputRole(vnode: VNode): string {
  const type = String(vnodeAttr(vnode, 'type') ?? vnodeProp(vnode, 'type') ?? 'text').toLowerCase();
  if (type === 'checkbox') return 'checkbox';
  if (type === 'radio') return 'radio';
  if (type === 'range') return 'slider';
  if (type === 'number') return 'spinbutton';
  if (type === 'search') return 'searchbox';
  if (['button', 'submit', 'reset', 'image', 'file'].includes(type)) return 'button';
  return 'textbox';
}

function implicitRole(vnode: VNode): string | null {
  const tag = vnodeTagName(vnode);
  if (tag === 'button') return 'button';
  if (tag === 'input') return inputRole(vnode);
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') {
    const multiple = vnodeAttr(vnode, 'multiple') !== undefined || Boolean(vnodeProp(vnode, 'multiple'));
    const size = Number(vnodeAttr(vnode, 'size') ?? vnodeProp(vnode, 'size') ?? 0);
    return multiple || size > 1 ? 'listbox' : 'combobox';
  }
  if (tag === 'a' && vnodeAttr(vnode, 'href') !== undefined) return 'link';
  return null;
}

function semanticVNode(vnode: VNode): SemanticVNode | null {
  const explicitRole = String(vnodeAttr(vnode, 'role') ?? '').trim();
  if (explicitRole) return { vnode, role: explicitRole };
  const role = implicitRole(vnode);
  if (role) return { vnode, role };
  for (const child of vnode.children ?? []) {
    if (typeof child === 'string' || child == null) continue;
    const semantic = semanticVNode(child);
    if (semantic) return semantic;
  }
  return null;
}

function stringState(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value === true ? 'true' : String(value);
}

function copiedAriaState(vnode: VNode, role: string): Record<string, string> {
  const roleStateAttrs: Record<string, readonly string[]> = {
    button: ['aria-expanded', 'aria-haspopup', 'aria-pressed'],
    checkbox: ['aria-checked', 'aria-readonly'],
    combobox: ['aria-autocomplete', 'aria-description', 'aria-expanded', 'aria-haspopup', 'aria-invalid', 'aria-readonly', 'aria-required'],
    listbox: ['aria-description', 'aria-multiselectable', 'aria-orientation', 'aria-required'],
    menuitemcheckbox: ['aria-checked'],
    menuitemradio: ['aria-checked'],
    option: ['aria-checked', 'aria-selected'],
    radio: ['aria-checked', 'aria-readonly'],
    slider: ['aria-orientation', 'aria-readonly', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext'],
    spinbutton: ['aria-readonly', 'aria-required', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext'],
    searchbox: ['aria-autocomplete', 'aria-description', 'aria-invalid', 'aria-placeholder', 'aria-readonly', 'aria-required'],
    switch: ['aria-checked', 'aria-readonly'],
    tab: ['aria-selected'],
    textbox: ['aria-autocomplete', 'aria-description', 'aria-invalid', 'aria-multiline', 'aria-placeholder', 'aria-readonly', 'aria-required'],
  };
  const state: Record<string, string> = {};
  for (const name of roleStateAttrs[role] ?? []) {
    const value = stringState(vnodeAttr(vnode, name));
    if (value !== undefined) state[name] = value;
  }

  if (['checkbox', 'radio', 'switch'].includes(role) && state['aria-checked'] === undefined) {
    const checked = vnodeProp(vnode, 'checked') ?? vnodeAttr(vnode, 'checked');
    if (checked !== undefined) state['aria-checked'] = checked === false ? 'false' : 'true';
  }
  if (['slider', 'spinbutton'].includes(role)) {
    for (const [ariaName, nativeName] of [
      ['aria-valuemin', 'min'],
      ['aria-valuemax', 'max'],
      ['aria-valuenow', 'value'],
    ] as const) {
      if (state[ariaName] !== undefined) continue;
      const value = stringState(vnodeProp(vnode, nativeName) ?? vnodeAttr(vnode, nativeName));
      if (value !== undefined) state[ariaName] = value;
    }
  }
  if (role === 'textbox' || role === 'searchbox') {
    const readonly = vnodeProp(vnode, 'readOnly') ?? vnodeAttr(vnode, 'readonly');
    if (readonly !== undefined && state['aria-readonly'] === undefined) state['aria-readonly'] = readonly === false ? 'false' : 'true';
    const placeholder = stringState(vnodeProp(vnode, 'placeholder') ?? vnodeAttr(vnode, 'placeholder'));
    if (placeholder && state['aria-placeholder'] === undefined) state['aria-placeholder'] = placeholder;
    if (vnodeTagName(vnode) === 'textarea' && state['aria-multiline'] === undefined) state['aria-multiline'] = 'true';
  }
  if (['combobox', 'listbox', 'textbox', 'searchbox'].includes(role)) {
    const value = stringState(vnodeProp(vnode, 'value') ?? vnodeAttr(vnode, 'value'));
    if (value !== undefined) {
      const currentValueDescription = value ? `Current value: ${value}.` : 'Current value: empty.';
      state['aria-description'] = state['aria-description']
        ? `${state['aria-description']} ${currentValueDescription}`
        : currentValueDescription;
    }
  }
  return state;
}

export function renderDisabledControlExplainer(explainer: ControlExplainer, control: VNode): VNode {
  const normalized = normalizedExplainer(explainer);
  if (!normalized.description) {
    throw new TypeError('A disabled control explainer must include the reason it is unavailable.');
  }

  const semantic = semanticVNode(control);
  const role = semantic?.role ?? 'button';
  const state = semantic ? copiedAriaState(semantic.vnode, role) : {};

  const wrapper = h(
    'span.control-explainer-disabled',
    {
      attrs: {
        ...controlExplainerAttrs({
          label: normalized.label,
          description: normalized.description,
          tier: 'essential',
        }),
        tabindex: '0',
        role,
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
  Object.assign(wrapper.data!.attrs!, state);
  return wrapper;
}

function targetTier(target: HTMLElement): ControlHelpTier | null {
  const tier = target.getAttribute(TIER_ATTR)?.trim();
  if (!tier) return 'more-help'; // Compatibility for pre-tier authored explainers.
  return tier === 'essential' || tier === 'more-help' ? tier : null;
}

function tierVisible(mode: ControlHelpMode, tier: ControlHelpTier): boolean {
  if (mode === 'off') return false;
  if (tier === 'essential') return true;
  return mode === 'more-help';
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
export function initControlExplainers(helpController?: Pick<ControlHelpController, 'getState' | 'subscribe'>): () => void {
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

  const currentMode = (): ControlHelpMode => helpController?.getState().mode ?? 'essential';
  const currentHoverDelay = (): number => helpController?.getState().hoverDelayMs ?? FALLBACK_HOVER_DELAY_MS;
  const repeatsVisibleLabel = (target: HTMLElement): boolean => {
    if (target.getAttribute(DESCRIPTION_ATTR)?.trim()) return false;
    const label = target.getAttribute(LABEL_ATTR)?.trim().replace(/\s+/g, ' ') ?? '';
    const visibleText = target.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    return Boolean(label && visibleText && label.localeCompare(visibleText, undefined, { sensitivity: 'accent' }) === 0);
  };
  const eligible = (target: HTMLElement): boolean => {
    const tier = targetTier(target);
    return tier !== null && tierVisible(currentMode(), tier) && !repeatsVisibleLabel(target);
  };

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
    if (!target.isConnected || !eligible(target)) {
      if (activeTarget === target) hide();
      return;
    }
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
    }, currentHoverDelay());
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
    if (!eligible(target)) {
      if (activeTarget === target) hide();
      return;
    }
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
    if (!eligible(target)) {
      focusedTarget = null;
      if (activeTarget === target) hide();
      return;
    }
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
  const unsubscribeHelp = helpController?.subscribe(() => {
    cancelPending();
    if (activeTarget && !eligible(activeTarget)) hide();
    else if (activeTarget) {
      updateCopy();
      positionTooltip();
    }
  }) ?? (() => {});

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
    attributeFilter: [LABEL_ATTR, DESCRIPTION_ATTR, TIER_ATTR],
    childList: true,
    subtree: true,
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    cancelPending();
    if (activeTarget) removeDescribedBy(activeTarget);
    unsubscribeHelp();
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
