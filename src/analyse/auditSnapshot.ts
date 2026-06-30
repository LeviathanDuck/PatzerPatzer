import { pgnToTree } from '../tree/pgn';
import { mainlineNodeList } from '../tree/ops';
import type { StoredAnalysis, StoredNodeEntry } from '../idb';
import type { Fen, San, TreePath, Uci } from '../tree/types';

export type AuditSnapshotScore =
  | { kind: 'cp'; cp: number }
  | { kind: 'mate'; mate: number }
  | { kind: 'unknown' };

export type AuditSnapshotMoveLabel =
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'none'
  | 'unknown';

export type AuditSnapshotSide = 'white' | 'black';

export interface AuditSnapshotPatzerNode {
  hasStoredNode: boolean;
  storedFenMatchesReconstructedFen: boolean;
  storedFen?: Fen;
  evalAfter?: AuditSnapshotScore;
  label?: AuditSnapshotMoveLabel;
  raw?: StoredNodeEntry;
}

export interface AuditSnapshotRow {
  ply: number;
  path: TreePath;
  san: San;
  uci: Uci;
  side: AuditSnapshotSide;
  fullMoveNumber: number;
  fenBefore: Fen;
  fenAfter: Fen;
  patzer: AuditSnapshotPatzerNode;
  diagnostics: {
    missingStoredNode: boolean;
    missingEval: boolean;
    fenMismatch: boolean;
    path: TreePath;
  };
}

export interface AuditSnapshotReviewMetadata {
  sourceGameId: string;
  status: StoredAnalysis['status'];
  analysisVersion: number;
  analysisDepth: number;
  updatedAt: number;
  capturedAt?: string;
  engineName?: string;
  engineModel?: string;
  strengthLabel?: string;
  uciLimitStrength?: boolean;
  reviewDepth?: number;
}

export interface AuditSnapshot {
  gameId: string;
  gameIdentity: {
    initialFen: Fen;
    plyCount: number;
    uciSequence: Uci[];
    fenAfterSequence: Fen[];
    uciSequenceSha256: string;
    fenAfterSequenceSha256: string;
    normalizedPgnSha256: string;
  };
  review?: AuditSnapshotReviewMetadata;
  rows: AuditSnapshotRow[];
  diagnostics: {
    missingReview: boolean;
    missingStoredNodeCount: number;
    missingEvalCount: number;
    fenMismatchCount: number;
    plyCount: number;
    storedNodeCount: number;
    reviewGameIdMismatch: boolean;
    onePlyOffsetHints: {
      checkedMismatchCount: number;
      storedFenMatchesPreviousRowCount: number;
      storedFenMatchesNextRowCount: number;
    };
    likelyOffset?: 'none' | 'patzer-one-ply-early' | 'patzer-one-ply-late' | 'unknown';
  };
}

export type BuildAuditSnapshotInput = {
  gameId: string;
  pgn: string;
  storedAnalysis?: StoredAnalysis | null;
};

const KNOWN_LABELS = new Set<AuditSnapshotMoveLabel>(['inaccuracy', 'mistake', 'blunder']);

export async function buildCanonicalReviewAuditSnapshot(input: BuildAuditSnapshotInput): Promise<AuditSnapshot> {
  const root = pgnToTree(input.pgn);
  const mainline = mainlineNodeList(root);
  const storedAnalysis = input.storedAnalysis ?? null;
  const storedNodes = storedAnalysis?.nodes ?? {};

  let path = '';
  const rows: AuditSnapshotRow[] = [];

  for (let index = 1; index < mainline.length; index++) {
    const node = mainline[index]!;
    const previousNode = mainline[index - 1]!;
    path += node.id;

    if (!node.san || !node.uci) {
      throw new Error(`Cannot build audit snapshot: mainline node at ply ${node.ply} is missing SAN or UCI.`);
    }

    const storedNode = storedNodes[path];
    const fenMismatch = storedNode !== undefined && storedNode.fen !== node.fen;
    const missingStoredNode = storedNode === undefined;
    const missingEval = storedNode === undefined || (storedNode.cp === undefined && storedNode.mate === undefined);

    rows.push({
      ply: node.ply,
      path,
      san: node.san,
      uci: node.uci,
      side: movingSideForPly(node.ply),
      fullMoveNumber: Math.ceil(node.ply / 2),
      fenBefore: previousNode.fen,
      fenAfter: node.fen,
      patzer: patzerNodeSnapshot(storedNode, !fenMismatch),
      diagnostics: {
        missingStoredNode,
        missingEval,
        fenMismatch,
        path,
      },
    });
  }

  const uciSequence = rows.map(row => row.uci);
  const fenAfterSequence = rows.map(row => row.fenAfter);
  const [uciSequenceSha256, fenAfterSequenceSha256, normalizedPgnSha256] = await Promise.all([
    sha256Hex(sequencePayload(uciSequence)),
    sha256Hex(sequencePayload(fenAfterSequence)),
    sha256Hex(normalizePgnForHash(input.pgn)),
  ]);

  const onePlyOffsetHints = buildOnePlyOffsetHints(rows);
  const missingStoredNodeCount = rows.filter(row => row.diagnostics.missingStoredNode).length;
  const missingEvalCount = rows.filter(row => row.diagnostics.missingEval).length;
  const fenMismatchCount = rows.filter(row => row.diagnostics.fenMismatch).length;

  return {
    gameId: input.gameId,
    gameIdentity: {
      initialFen: root.fen,
      plyCount: rows.length,
      uciSequence,
      fenAfterSequence,
      uciSequenceSha256,
      fenAfterSequenceSha256,
      normalizedPgnSha256,
    },
    ...(storedAnalysis ? { review: reviewMetadataSnapshot(storedAnalysis) } : {}),
    rows,
    diagnostics: {
      missingReview: storedAnalysis === null,
      missingStoredNodeCount,
      missingEvalCount,
      fenMismatchCount,
      plyCount: rows.length,
      storedNodeCount: Object.keys(storedNodes).length,
      reviewGameIdMismatch: storedAnalysis !== null && storedAnalysis.gameId !== input.gameId,
      onePlyOffsetHints,
      ...(onePlyOffsetHints.checkedMismatchCount > 0 ? { likelyOffset: 'unknown' as const } : {}),
    },
  };
}

function patzerNodeSnapshot(
  storedNode: StoredNodeEntry | undefined,
  storedFenMatchesReconstructedFen: boolean,
): AuditSnapshotPatzerNode {
  if (!storedNode) {
    return {
      hasStoredNode: false,
      storedFenMatchesReconstructedFen: false,
    };
  }

  return {
    hasStoredNode: true,
    storedFen: storedNode.fen,
    storedFenMatchesReconstructedFen,
    evalAfter: scoreFromStoredNode(storedNode),
    label: labelFromStoredNode(storedNode),
    raw: storedNode,
  };
}

function scoreFromStoredNode(storedNode: StoredNodeEntry): AuditSnapshotScore {
  if (storedNode.mate !== undefined) return { kind: 'mate', mate: storedNode.mate };
  if (storedNode.cp !== undefined) return { kind: 'cp', cp: storedNode.cp };
  return { kind: 'unknown' };
}

function labelFromStoredNode(storedNode: StoredNodeEntry): AuditSnapshotMoveLabel {
  const label = storedNode.label as AuditSnapshotMoveLabel | undefined;
  if (label === undefined) return 'none';
  return KNOWN_LABELS.has(label) ? label : 'unknown';
}

function movingSideForPly(ply: number): AuditSnapshotSide {
  return ply % 2 === 1 ? 'white' : 'black';
}

function reviewMetadataSnapshot(storedAnalysis: StoredAnalysis): AuditSnapshotReviewMetadata {
  const base: AuditSnapshotReviewMetadata = {
    sourceGameId: storedAnalysis.gameId,
    status: storedAnalysis.status,
    analysisVersion: storedAnalysis.analysisVersion,
    analysisDepth: storedAnalysis.analysisDepth,
    updatedAt: storedAnalysis.updatedAt,
  };
  const engine = storedAnalysis.reviewEngine;
  if (!engine) return base;
  return {
    ...base,
    capturedAt: engine.capturedAt,
    engineName: engine.engineName,
    engineModel: engine.engineModel,
    strengthLabel: engine.strengthLabel,
    uciLimitStrength: engine.uciLimitStrength,
    reviewDepth: engine.reviewDepth,
  };
}

function buildOnePlyOffsetHints(rows: readonly AuditSnapshotRow[]): AuditSnapshot['diagnostics']['onePlyOffsetHints'] {
  let checkedMismatchCount = 0;
  let storedFenMatchesPreviousRowCount = 0;
  let storedFenMatchesNextRowCount = 0;

  rows.forEach((row, index) => {
    const storedFen = row.patzer.storedFen;
    if (!row.diagnostics.fenMismatch || !storedFen) return;
    checkedMismatchCount++;
    if (index > 0 && storedFen === rows[index - 1]!.fenAfter) storedFenMatchesPreviousRowCount++;
    if (index < rows.length - 1 && storedFen === rows[index + 1]!.fenAfter) storedFenMatchesNextRowCount++;
  });

  return {
    checkedMismatchCount,
    storedFenMatchesPreviousRowCount,
    storedFenMatchesNextRowCount,
  };
}

function normalizePgnForHash(pgn: string): string {
  return pgn.replace(/\r\n?/g, '\n').trim();
}

function sequencePayload(values: readonly string[]): string {
  return JSON.stringify(values);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
