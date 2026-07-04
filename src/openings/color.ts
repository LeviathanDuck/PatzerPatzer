export type OpeningsTreeColor = 'white' | 'black';

export const DEFAULT_OPENINGS_TREE_COLOR: OpeningsTreeColor = 'white';
export const OPENINGS_TARGET_COLORS_KEY = 'patzer.openings.targetColors.v1';

export interface OpeningsColorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function runtimeStorage(): OpeningsColorStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function isOpeningsTreeColor(value: unknown): value is OpeningsTreeColor {
  return value === 'white' || value === 'black';
}

export function normalizeOpeningsTreeColor(
  value: unknown,
  fallback: OpeningsTreeColor = DEFAULT_OPENINGS_TREE_COLOR,
): OpeningsTreeColor {
  if (isOpeningsTreeColor(value)) return value;
  if (value === 'both') return DEFAULT_OPENINGS_TREE_COLOR;
  return fallback;
}

export function openingsTargetColorKey(kind: 'account' | 'collection', id: string): string {
  return `${kind}:${id}`;
}

export function readOpeningsTargetColorMap(
  storage: OpeningsColorStorage | null = runtimeStorage(),
): Record<string, OpeningsTreeColor> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(OPENINGS_TARGET_COLORS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, OpeningsTreeColor> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key !== 'string' || key.length === 0) continue;
      if (!isOpeningsTreeColor(value)) continue;
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function readOpeningsTargetColor(
  targetKey: string | null | undefined,
  fallback: OpeningsTreeColor = DEFAULT_OPENINGS_TREE_COLOR,
  storage: OpeningsColorStorage | null = runtimeStorage(),
): OpeningsTreeColor {
  if (!targetKey) return fallback;
  const map = readOpeningsTargetColorMap(storage);
  return normalizeOpeningsTreeColor(map[targetKey], fallback);
}

export function writeOpeningsTargetColor(
  targetKey: string | null | undefined,
  color: OpeningsTreeColor,
  storage: OpeningsColorStorage | null = runtimeStorage(),
): void {
  if (!storage || !targetKey) return;
  try {
    const map = readOpeningsTargetColorMap(storage);
    map[targetKey] = color;
    storage.setItem(OPENINGS_TARGET_COLORS_KEY, JSON.stringify(map));
  } catch {
    // Best-effort preference persistence; the active session state remains valid.
  }
}

export function resolveOpeningsSessionColor(
  sessionColor: unknown,
  targetKey: string | null | undefined,
  storage: OpeningsColorStorage | null = runtimeStorage(),
): OpeningsTreeColor {
  const storedColor = readOpeningsTargetColor(targetKey, DEFAULT_OPENINGS_TREE_COLOR, storage);
  return sessionColor === undefined
    ? storedColor
    : normalizeOpeningsTreeColor(sessionColor, storedColor);
}

export function resolveOpeningsRouteColor(
  routeColor: unknown,
  colorExplicit: boolean,
  targetKey: string | null | undefined,
  storage: OpeningsColorStorage | null = runtimeStorage(),
): OpeningsTreeColor {
  return colorExplicit
    ? normalizeOpeningsTreeColor(routeColor)
    : readOpeningsTargetColor(targetKey, DEFAULT_OPENINGS_TREE_COLOR, storage);
}
