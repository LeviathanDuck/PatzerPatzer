import type { StoredNodeEntry } from '../idb';
import type { TreeNode, TreePath } from '../tree/types';

export type AnalysisRestoreSkipReason = 'missing-path' | 'non-mainline-path' | 'fen-mismatch';

export interface AnalysisRestoreSkippedSample {
  path: TreePath;
  reason: AnalysisRestoreSkipReason;
}

export interface AnalysisRestoreValidationDiagnostics {
  totalRows: number;
  acceptedRows: number;
  skippedRows: number;
  skipReasons: Record<AnalysisRestoreSkipReason, number>;
  skippedSamples: AnalysisRestoreSkippedSample[];
  sampleLimit: number;
}

export interface AnalysisRestoreValidationResult {
  acceptedEntries: StoredNodeEntry[];
  diagnostics: AnalysisRestoreValidationDiagnostics;
}

export const ANALYSIS_RESTORE_SKIP_SAMPLE_LIMIT = 5;

function currentMainlineFenByPath(mainline: readonly TreeNode[]): Map<TreePath, string> {
  const byPath = new Map<TreePath, string>();
  // The root position is a legitimate keyed entry under path '' (mirrors buildAnalysisNodes'
  // root serialization) — map it so a persisted root eval validates as mainline rather than
  // being dropped as non-mainline (BUG-2026-07-10-035).
  const root = mainline[0];
  if (root) byPath.set('', root.fen);
  let path = '';
  for (let index = 1; index < mainline.length; index++) {
    const node = mainline[index]!;
    path += node.id;
    byPath.set(path, node.fen);
  }
  return byPath;
}

function emptySkipReasons(): Record<AnalysisRestoreSkipReason, number> {
  return {
    'missing-path':     0,
    'non-mainline-path': 0,
    'fen-mismatch':     0,
  };
}

function recordSkip(
  diagnostics: AnalysisRestoreValidationDiagnostics,
  entry: StoredNodeEntry,
  reason: AnalysisRestoreSkipReason,
): void {
  diagnostics.skippedRows++;
  diagnostics.skipReasons[reason]++;
  if (diagnostics.skippedSamples.length >= diagnostics.sampleLimit) return;
  diagnostics.skippedSamples.push({
    path: entry.path || '(missing)',
    reason,
  });
}

export function validateStoredAnalysisRestoreRows(
  nodes: Record<string, StoredNodeEntry>,
  currentMainline: readonly TreeNode[],
  sampleLimit = ANALYSIS_RESTORE_SKIP_SAMPLE_LIMIT,
): AnalysisRestoreValidationResult {
  const currentFenByPath = currentMainlineFenByPath(currentMainline);
  const acceptedEntries: StoredNodeEntry[] = [];
  const diagnostics: AnalysisRestoreValidationDiagnostics = {
    totalRows: Object.keys(nodes).length,
    acceptedRows: 0,
    skippedRows: 0,
    skipReasons: emptySkipReasons(),
    skippedSamples: [],
    sampleLimit,
  };

  for (const entry of Object.values(nodes)) {
    // Skip only pre-migration node.id-keyed records (no path field). The root's path is the
    // empty string '' (falsy but legitimate) — keep it so a persisted root eval restores
    // (BUG-2026-07-10-035), so ply-1 mistake candidates survive reload.
    if (typeof entry.path !== 'string') {
      recordSkip(diagnostics, entry, 'missing-path');
      continue;
    }
    const currentFen = currentFenByPath.get(entry.path);
    if (currentFen === undefined) {
      recordSkip(diagnostics, entry, 'non-mainline-path');
      continue;
    }
    if (entry.fen !== currentFen) {
      recordSkip(diagnostics, entry, 'fen-mismatch');
      continue;
    }
    acceptedEntries.push(entry);
  }

  diagnostics.acceptedRows = acceptedEntries.length;
  return { acceptedEntries, diagnostics };
}
