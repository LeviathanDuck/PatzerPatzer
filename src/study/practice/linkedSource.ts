




































import {
  deriveLessonDecisions,
  type DeriveDecisionsOptions, type LessonDecision, type LessonDecisionModel,
} from './material';
import type { TreeNode } from '../../tree/types';
import type { SrsSourceVersion } from './srsTypes';
import type {
  LocalAuthoredProvenance,
  SourceImportedProvenance,
} from '../types';

// --- 1. Source identity: a minted local lineage grouping key --------------------------------------

/**
 * Mint a durable local source-lineage grouping key (`sourceLineageId`), assigned ONCE when material
 * is first imported/linked. It is NOT the source URL and NOT a content hash — the verified source
 * URL/identity is DESCRIPTIVE provenance carried alongside it (`VerifiedSourceDescriptor`). One
 * lineage id groups every decision derived from one imported source lineage; it is the value fed to
 * `DeriveDecisionsOptions.sourceLineageId` (material.ts:161). The mint is injected so it is provably
 * NOT chess-content-derived and so tests can supply a deterministic counter; defaults to
 * `crypto.randomUUID`.
 */
export function mintSourceLineageId(mint: () => string = () => crypto.randomUUID()): string {
  return mint();
}

// --- 2 & 3. Snapshot version + linkage state (REUSED SrsSourceVersion, no parallel union) ---------

/**
 * True iff a revision is a usable, finite integer snapshot cursor. Honors the fail-closed rule in
 * srsTypes.ts:168-172: a `linked` `sourceRevision` is a plain `number`, so `NaN`/±Infinity type-check
 * but are unusable — any producer/consumer must reject non-finite revisions. D3 produces only finite
 * integers.
 */
export function isUsableSourceRevision(revision: number): boolean {
  return Number.isFinite(revision) && Number.isInteger(revision);
}

/**
 * Build the `linked` linkage carrying its snapshot revision (§4.4). Fail-closed: a non-finite /
 * non-integer revision is rejected here rather than silently persisted as a valid link
 * (srsTypes.ts:168-172), which would corrupt staleness detection and the future three-way merge.
 */
export function linkedSourceVersion(sourceRevision: number): SrsSourceVersion {
  if (!isUsableSourceRevision(sourceRevision)) {
    throw new RangeError(
      `linkedSourceVersion: sourceRevision must be a finite integer, got ${String(sourceRevision)}`,
    );
  }
  return { kind: 'linked', sourceRevision };
}

/** Manual PGN import (§4.4): unlinked, no upstream revision, origin 'manual'. */
export function manualImportVersion(): SrsSourceVersion {
  return { kind: 'unlinked', origin: 'manual' };
}

/** Snapshot import (§4.4): unlinked, no upstream revision tracked, origin 'snapshot-import'. */
export function snapshotImportVersion(): SrsSourceVersion {
  return { kind: 'unlinked', origin: 'snapshot-import' };
}

/** Post-import Unlink from source (§14.4): unlinked, origin 'unlinked-from-source'. */
export function unlinkedFromSourceVersion(): SrsSourceVersion {
  return { kind: 'unlinked', origin: 'unlinked-from-source' };
}
















/** The source being copied — consumed ONLY by the runtime independence assertion, never as
 *  derivation input. */
export interface CopySourceIdentity {
  /** The source's lineage id, when it has one (a linked source). */
  readonly lineageId?: string;
  /** The source's current decisions; the copy must share NONE of their UUIDs. */
  readonly decisions: readonly Pick<LessonDecision, 'identity'>[];
}

/** Inputs for deriving a COPY. A copy is a NEW lesson (new `lessonId`) and an internally-minted NEW
 *  lineage — there is deliberately NO field for a caller-supplied lineage and NO `previous`. */
export interface DeriveCopiedLessonInput {
  readonly lessonId: string;
  readonly sourceKind: DeriveDecisionsOptions['sourceKind'];
  readonly learnerSide: 'white' | 'black';
  readonly chapterId?: string;
  readonly sourceRevision?: number;
  /** Decision-UUID mint (deterministic in tests); defaults inside D1. */
  readonly mintId?: () => string;
  /** Lineage-id mint (deterministic in tests); defaults to `crypto.randomUUID`. */
  readonly mintLineageId?: () => string;
  readonly source: CopySourceIdentity;
}

/** The copy derivation result: D1's model plus the freshly-minted lineage stamped on it. */
export interface CopiedLessonDerivation {
  readonly model: LessonDecisionModel;
  readonly sourceLineageId: string;
}









export function deriveCopiedLessonDecisions(
  root: TreeNode,
  input: DeriveCopiedLessonInput,
): CopiedLessonDerivation {
  const sourceLineageId = mintSourceLineageId(input.mintLineageId);
  if (input.source.lineageId !== undefined && sourceLineageId === input.source.lineageId) {
    throw new Error('copy-lineage-collision: minted lineage equals the source lineage');
  }
  const model = deriveLessonDecisions(root, {
    lessonId: input.lessonId,
    sourceKind: input.sourceKind,
    learnerSide: input.learnerSide,
    ...(input.chapterId !== undefined ? { chapterId: input.chapterId } : {}),
    sourceLineageId,
    ...(input.sourceRevision !== undefined ? { sourceRevision: input.sourceRevision } : {}),
    ...(input.mintId !== undefined ? { mintId: input.mintId } : {}),
    // NO `previous` — structurally unpassable through DeriveCopiedLessonInput.
  });
  const sourceIds = new Set(input.source.decisions.map(d => d.identity.decisionId));
  for (const decision of model.decisions) {
    if (sourceIds.has(decision.identity.decisionId)) {
      throw new Error(
        `copy-identity-collision: derived decision ${decision.identity.decisionId} reuses a source UUID`,
      );
    }
  }
  return { model, sourceLineageId };
}













export function unlinkSourceProvenance(current: SourceImportedProvenance): SourceImportedProvenance {
  const preservedRevision =
    current.version.kind === 'linked' ? current.version.sourceRevision : current.lastLinkedRevision;
  if (preservedRevision !== undefined && !isUsableSourceRevision(preservedRevision)) {
    throw new Error(`unlink-invalid-source-revision: ${String(preservedRevision)} is not a usable source revision`);
  }
  return {
    ...current,
    version: unlinkedFromSourceVersion(),
    ...(preservedRevision !== undefined ? { lastLinkedRevision: preservedRevision } : {}),
  };
}

// --- Provenance stamping WITHOUT clobbering locally-authored layers -------------------------------
//
// P2-ORP-18: "Source changes … never overwrite My notes." A source stamp populates ONLY the
// source-imported layer; My-analysis / My-notes layers and free-text notes are carried forward
// verbatim. The actual three-way MERGE that reconciles source vs My-notes vs My-analysis is D6.

export interface StampProvenanceInput {
  /** The source-imported layer to stamp on a link/snapshot import. */
  readonly incoming: SourceImportedProvenance;
  /** Locally-authored layers already on the record (from the existing/upsert record), if any. */
  readonly existingLocalLayers?: readonly LocalAuthoredProvenance[];
  /** Existing free-text notes already on the record, if any. */
  readonly existingNotes?: string;
}

export interface StampProvenanceResult {
  /** The source-imported layer to write (the ONLY field the source stamp authors). */
  readonly linkedSourceProvenance: SourceImportedProvenance;
  /** Locally-authored layers preserved verbatim — never blanked, never re-authored by the stamp. */
  readonly localProvenanceLayers?: readonly LocalAuthoredProvenance[];
  /** Existing notes preserved verbatim. */
  readonly notes?: string;
}

/**
 * Stamp a source-imported provenance layer while PRESERVING every locally-authored layer verbatim
 * (P2-ORP-18 §4.5). The result writes only `linkedSourceProvenance`; the My-analysis/My-notes layers
 * and `notes` are carried through untouched from the existing record. This is the non-clobber
 * guarantee saveAction relies on for its upsert path — the source stamp can neither blank nor
 * re-author a user-owned layer.
 */
export function stampLinkedSourceProvenance(input: StampProvenanceInput): StampProvenanceResult {
  return {
    linkedSourceProvenance: input.incoming,
    ...(input.existingLocalLayers !== undefined
      ? { localProvenanceLayers: input.existingLocalLayers }
      : {}),
    ...(input.existingNotes !== undefined ? { notes: input.existingNotes } : {}),
  };
}
