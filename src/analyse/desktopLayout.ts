export interface AnalysisDesktopLayoutPrefs {
  movesSlotPct: number;
}

// V2 semantics: the split divides the shared middle area (move list above,
// Book/LFYM content below) inside .analyse__moves-stack. The obsolete
// patzer.analysis.layout.v1 key (top-vs-context split) is intentionally ignored.
const ANALYSIS_LAYOUT_STORAGE_KEY = 'patzer.analysis.layout.v2';
const ANALYSIS_LAYOUT_DEFAULT: AnalysisDesktopLayoutPrefs = {
  movesSlotPct: 40,
};
const ANALYSIS_MOVES_MIN_PX = 120;
const ANALYSIS_LOWER_MIN_PX = 160;

function clampAnalysisMovesSlotPct(pct: number): number {
  if (!Number.isFinite(pct)) return ANALYSIS_LAYOUT_DEFAULT.movesSlotPct;
  return Math.max(20, Math.min(80, Math.round(pct * 10) / 10));
}

function readAnalysisDesktopLayoutPrefs(): AnalysisDesktopLayoutPrefs {
  try {
    const raw = localStorage.getItem(ANALYSIS_LAYOUT_STORAGE_KEY);
    if (!raw) return { ...ANALYSIS_LAYOUT_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<AnalysisDesktopLayoutPrefs>;
    return {
      movesSlotPct: clampAnalysisMovesSlotPct(Number(parsed.movesSlotPct)),
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

export function analysisDesktopLayoutVars(pct = _analysisDesktopLayout.movesSlotPct): string {
  const moves = clampAnalysisMovesSlotPct(pct);
  const lower = Math.max(0, 100 - moves);
  return `---analysis-moves-slot-fr:${moves}fr;---analysis-lower-slot-fr:${lower}fr;`;
}

function analysisSplitContainer(workspace: HTMLElement): HTMLElement {
  return (workspace.querySelector('.analyse__moves-stack') as HTMLElement | null) ?? workspace;
}

function clampAnalysisMovesSlotPctForWorkspace(pct: number, workspace: HTMLElement | null): number {
  if (!workspace) return clampAnalysisMovesSlotPct(pct);
  const height = analysisSplitContainer(workspace).getBoundingClientRect().height;
  if (height <= 0) return clampAnalysisMovesSlotPct(pct);
  const handle = workspace.querySelector('.analyse__split-handle') as HTMLElement | null;
  const handleHeight = handle?.getBoundingClientRect().height ?? 10;
  const available = Math.max(1, height - handleHeight);
  const minPct = Math.min(48, (ANALYSIS_MOVES_MIN_PX / available) * 100);
  const maxPct = Math.max(52, 100 - (ANALYSIS_LOWER_MIN_PX / available) * 100);
  if (minPct >= maxPct) return 50;
  return Math.round(Math.max(minPct, Math.min(maxPct, pct)) * 10) / 10;
}

function applyAnalysisDesktopLayoutVars(workspace: HTMLElement, pct = _analysisDesktopLayout.movesSlotPct): void {
  const moves = clampAnalysisMovesSlotPctForWorkspace(pct, workspace);
  workspace.style.setProperty('---analysis-moves-slot-fr', `${moves}fr`);
  workspace.style.setProperty('---analysis-lower-slot-fr', `${Math.max(0, 100 - moves)}fr`);
}

function setAnalysisMovesSlotPct(
  pct: number,
  redraw: () => void,
  workspace: HTMLElement | null = null,
): void {
  _analysisDesktopLayout = {
    movesSlotPct: clampAnalysisMovesSlotPctForWorkspace(pct, workspace),
  };
  persistAnalysisDesktopLayoutPrefs();
  if (workspace) applyAnalysisDesktopLayoutVars(workspace);
  redraw();
}

function analysisMovesPctFromPointer(clientY: number, workspace: HTMLElement): number {
  const rect = analysisSplitContainer(workspace).getBoundingClientRect();
  const handle = workspace.querySelector('.analyse__split-handle') as HTMLElement | null;
  const handleHeight = handle?.getBoundingClientRect().height ?? 10;
  const available = Math.max(1, rect.height - handleHeight);
  const rawTopPx = clientY - rect.top - (handleHeight / 2);
  return clampAnalysisMovesSlotPctForWorkspace((rawTopPx / available) * 100, workspace);
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
    const pct = analysisMovesPctFromPointer(moveEvent.clientY, workspace);
    _analysisDesktopLayout = { movesSlotPct: pct };
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
  setAnalysisMovesSlotPct(_analysisDesktopLayout.movesSlotPct + delta, redraw, workspace);
}
