
















// Ported from Notebook Navigator (GPL-3.0-only, Copyright (c) 2025-2026 Johan Sanneblad), per the



















export type PaneResizeOrientation = 'horizontal' | 'vertical';

export interface PaneResizeConfig {
  /** Which pointer axis drives the resize — clientX for a side-by-side (horizontal) split,
   * clientY for a stacked (vertical) split. Also selects the RTL sign-flip behavior (horizontal
   * only, matching useResizablePane's own `orientation === 'horizontal' && isRTL` guard). */
  orientation: PaneResizeOrientation;
  /** Initial size in px, used when no persisted value exists yet. */
  defaultSize: number;
  /** Minimum size in px — the one documented floor (design doc §1.5). No ceiling is enforced
   * beyond the window itself, matching NN's own model. */
  minSize: number;
  /** localStorage key this size persists under. Per-orientation by design (NN's own
   * `navigationPaneWidthKey` / `navigationPaneHeightKey`) — a caller supporting both orientations
   * for the same logical pane should use two PaneResizeController instances, one per key. */
  storageKey: string;
  /** The CSS custom property this controller writes directly to the DOM during an active drag
   * (e.g. `---study-nav-pane-width`), mirroring `src/openings/view.ts`'s
   * `applyOpeningTreeSlotVars` — avoids a full Snabbdom `patch()` on every pointermove. */
  cssVar: string;
  /** CSS selector, resolved via the divider element's own `closest()`, for the ancestor element
   * whose inline style carries `cssVar`. */
  targetSelector: string;
  /** UI-scale factor the drag delta is divided by, matching `useResizablePane`'s own `scale`
   * param. T5-D08 (appearance settings, not yet built) will supply the real global UI-scale slider
   * value here; omit to use 1 (no scaling). */
  getScale?: () => number;
  /** Body-level class toggled for the duration of an active drag (global cursor + user-select
   * override) — mirrors `body.openings-column-resizing`. Omit for no body-level effect. */
  bodyClassDuringDrag?: string;
}

function readPersistedSize(storageKey: string, minSize: number): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(minSize, parsed) : null;
  } catch {
    return null; // localStorage unavailable (private browsing, etc.) — fall back to the default.
  }
}

function persistSize(storageKey: string, size: number): void {
  try {
    window.localStorage.setItem(storageKey, String(Math.round(size)));
  } catch {
    // Best-effort only: a failed write just means the size resets to default next mount.
  }
}

/**
 * One resizable-divider controller instance per divider. The Study Navigator shell
 * (`navigatorShellView.ts`) owns a single module-level instance for the nav-pane/item-list
 * divider; a future second divider (e.g. a mobile vertical split) would own its own instance.
 */
export class PaneResizeController {
  private readonly config: PaneResizeConfig;
  private _size: number;
  private _dragging = false;

  constructor(config: PaneResizeConfig) {
    this.config = config;
    this._size = readPersistedSize(config.storageKey, config.minSize) ?? config.defaultSize;
  }

  size(): number {
    return this._size;
  }

  isDragging(): boolean {
    return this._dragging;
  }

  /** CSS custom-property declaration string for the current size (e.g. `---study-nav-pane-width:
   * 240px;`), for baking into an element's `attrs.style` on every render — the steady-state path;
   * direct DOM mutation during an active drag is handled by `startDrag` below. */
  styleDeclaration(): string {
    return `${this.config.cssVar}:${Math.round(this._size)}px;`;
  }

  /** Clears the persisted size so the divider snaps back to its default — the "Reset pane
   * separator" action named in the design doc §1.5 (an Advanced-settings action, T5-D08; not
   * wired to any UI in this slice, exposed so a later slice can call it without touching this
   * controller's internals). */
  reset(redraw: () => void): void {
    try { window.localStorage.removeItem(this.config.storageKey); } catch { /* best-effort */ }
    this._size = this.config.defaultSize;
    redraw();
  }

  /**
   * Pointerdown handler for the divider element. Mirrors `useResizablePane`'s
   * `handleResizePointerDown`: primary-button-only, starting position + size capture, RTL sign
   * flip, scale-compensated live updates during the drag. Mechanically follows
   * `src/openings/view.ts`'s `beginOpeningTreeColumnResize`: the live CSS custom property is
   * written directly to the DOM on every pointermove (no `redraw()` per move, avoiding a full
   * Snabbdom patch while dragging); a single `redraw()` runs at drag-end so Snabbdom reconciles
   * the divider's own `--dragging` class and the final persisted size together.
   */
  startDrag(event: PointerEvent, redraw: () => void): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement | null;
    const target = handle?.closest(this.config.targetSelector) as HTMLElement | null;
    if (!handle || !target) return;
    event.preventDefault();

    const pointerId = event.pointerId;
    const { orientation, minSize, cssVar, storageKey, bodyClassDuringDrag } = this.config;
    const startPosition = orientation === 'horizontal' ? event.clientX : event.clientY;
    const startSize = this._size;
    const isRTL = orientation === 'horizontal' && document.documentElement.dir === 'rtl';
    let currentSize = startSize;

    this._dragging = true;
    handle.setPointerCapture?.(pointerId);
    if (bodyClassDuringDrag) document.body.classList.add(bodyClassDuringDrag);
    const badge = handle.querySelector('.divider-badge');
    if (badge) {
      badge.classList.add('--show');
      badge.textContent = `${Math.round(currentSize)}px`;
    }

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const currentPosition = orientation === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      let delta = currentPosition - startPosition;
      if (isRTL) delta = -delta;
      const scale = this.config.getScale?.() ?? 1;
      const scaleFactor = Number.isFinite(scale) && scale > 0 ? scale : 1;
      currentSize = Math.max(minSize, startSize + delta / scaleFactor);
      this._size = currentSize;
      target.style.setProperty(cssVar, `${Math.round(currentSize)}px`);
      if (badge) badge.textContent = `${Math.round(currentSize)}px`;
    };
    const endDrag = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (bodyClassDuringDrag) document.body.classList.remove(bodyClassDuringDrag);
      if (badge) badge.classList.remove('--show');
      this._dragging = false;
      persistSize(storageKey, currentSize);
      redraw();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }
}
