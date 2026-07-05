export interface AnalysisDesktopLayoutPrefs {
  topSlotPct: number;
}

const ANALYSIS_LAYOUT_STORAGE_KEY = 'patzer.analysis.layout.v1';
const ANALYSIS_LAYOUT_DEFAULT: AnalysisDesktopLayoutPrefs = {
  topSlotPct: 40,
};
const ANALYSIS_TOP_MIN_PX = 190;
const ANALYSIS_CONTEXT_MIN_PX = 220;

function clampAnalysisTopSlotPct(pct: number): number {
  if (!Number.isFinite(pct)) return ANALYSIS_LAYOUT_DEFAULT.topSlotPct;
  return Math.max(24, Math.min(76, Math.round(pct * 10) / 10));
}

function readAnalysisDesktopLayoutPrefs(): AnalysisDesktopLayoutPrefs {
  try {
    const raw = localStorage.getItem(ANALYSIS_LAYOUT_STORAGE_KEY);
    if (!raw) return { ...ANALYSIS_LAYOUT_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<AnalysisDesktopLayoutPrefs>;
    return {
      topSlotPct: clampAnalysisTopSlotPct(Number(parsed.topSlotPct)),
    };
  } catch {
    return { ...ANALYSIS_LAYOUT_DEFAULT };
  }
}

let _analysisDesktopLayout = readAnalysisDesktopLayoutPrefs();

function persistAnalysisDesktopLayoutPrefs(): void {
  try {
    localStorage.setItem(ANALYSIS_LAYOUT_STORAGE_KEY, JSON.stringify(_analysisDesktopLayout));
  } catch {
    // Keep the current-session layout usable even when localStorage is unavailable.
  }
}

export function analysisDesktopLayoutVars(pct = _analysisDesktopLayout.topSlotPct): string {
  const top = clampAnalysisTopSlotPct(pct);
  const context = Math.max(0, 100 - top);
  return `---analysis-top-slot-fr:${top}fr;---analysis-context-slot-fr:${context}fr;`;
}

function analysisSplitHeight(workspace: HTMLElement): number {
  const stack = workspace.querySelector('.analyse__right-layout') as HTMLElement | null;
  return stack?.getBoundingClientRect().height ?? workspace.getBoundingClientRect().height;
}

function clampAnalysisTopSlotPctForWorkspace(pct: number, workspace: HTMLElement | null): number {
  if (!workspace) return clampAnalysisTopSlotPct(pct);
  const height = analysisSplitHeight(workspace);
  if (height <= 0) return clampAnalysisTopSlotPct(pct);
  const handle = workspace.querySelector('.analyse__split-handle') as HTMLElement | null;
  const handleHeight = handle?.getBoundingClientRect().height ?? 10;
  const available = Math.max(1, height - handleHeight);
  const minPct = Math.min(48, (ANALYSIS_TOP_MIN_PX / available) * 100);
  const maxPct = Math.max(52, 100 - (ANALYSIS_CONTEXT_MIN_PX / available) * 100);
  if (minPct >= maxPct) return 50;
  return Math.round(Math.max(minPct, Math.min(maxPct, pct)) * 10) / 10;
}

function applyAnalysisDesktopLayoutVars(workspace: HTMLElement, pct = _analysisDesktopLayout.topSlotPct): void {
  const top = clampAnalysisTopSlotPctForWorkspace(pct, workspace);
  workspace.style.setProperty('---analysis-top-slot-fr', `${top}fr`);
  workspace.style.setProperty('---analysis-context-slot-fr', `${Math.max(0, 100 - top)}fr`);
}

function setAnalysisTopSlotPct(
  pct: number,
  redraw: () => void,
  workspace: HTMLElement | null = null,
): void {
  _analysisDesktopLayout = {
    topSlotPct: clampAnalysisTopSlotPctForWorkspace(pct, workspace),
  };
  persistAnalysisDesktopLayoutPrefs();
  if (workspace) applyAnalysisDesktopLayoutVars(workspace);
  redraw();
}

function analysisTopPctFromPointer(clientY: number, workspace: HTMLElement): number {
  const stack = workspace.querySelector('.analyse__right-layout') as HTMLElement | null;
  const rect = (stack ?? workspace).getBoundingClientRect();
  const handle = workspace.querySelector('.analyse__split-handle') as HTMLElement | null;
  const handleHeight = handle?.getBoundingClientRect().height ?? 10;
  const available = Math.max(1, rect.height - handleHeight);
  const rawTopPx = clientY - rect.top - (handleHeight / 2);
  return clampAnalysisTopSlotPctForWorkspace((rawTopPx / available) * 100, workspace);
}

export function beginAnalysisDesktopSplitResize(event: PointerEvent, redraw: () => void): void {
  if (event.button !== 0) return;
  const handle = event.currentTarget as HTMLElement | null;
  const workspace = handle?.closest('.analyse__tools') as HTMLElement | null;
  if (!handle || !workspace) return;
  event.preventDefault();
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('analysis-layout-resizing');

  const move = (moveEvent: PointerEvent) => {
    const pct = analysisTopPctFromPointer(moveEvent.clientY, workspace);
    _analysisDesktopLayout = { topSlotPct: pct };
    applyAnalysisDesktopLayoutVars(workspace, pct);
  };

  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    document.body.classList.remove('analysis-layout-resizing');
    persistAnalysisDesktopLayoutPrefs();
    redraw();
  };

  move(event);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

export function handleAnalysisDesktopSplitKeydown(event: KeyboardEvent, redraw: () => void): void {
  const delta = event.key === 'ArrowUp' ? -2 : event.key === 'ArrowDown' ? 2 : 0;
  if (delta === 0) return;
  event.preventDefault();
  const workspace = (event.currentTarget as HTMLElement | null)?.closest('.analyse__tools') as HTMLElement | null;
  setAnalysisTopSlotPct(_analysisDesktopLayout.topSlotPct + delta, redraw, workspace);
}
