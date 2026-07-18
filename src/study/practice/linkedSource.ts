


































import type { DeriveDecisionsOptions } from './material';
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

// --- Copy vs unlink: INDEPENDENT identity WITHOUT re-minting a decision id ------------------------
//
// The crux of P2-ORP-17 ("copies and unlinked snapshots receive independent identities"). D3 never
// re-mints a decision UUID itself; it controls the derivation INPUTS so D1's existing mint path
// produces fresh UUIDs for a genuinely-new lesson. The single lever is whether `previous` is passed:
//   - COPY  → omit `previous`  → D1's `mint()` branch (material.ts:306) runs for every decision.
//   - LINK  → pass `previous`  → D1 carries prior identity forward (that is D6's in-place re-derive).
// D3 provides the copy builder; it does NOT itself call `deriveLessonDecisions`.

/**
 * Derivation options that PROVABLY omit `previous`. `previous?: undefined` makes passing a populated
 * `previous` a COMPILE error, so a copy cannot inherit the source's decision UUIDs (P2-ORP-17 HIGH).
 * Assignable to `DeriveDecisionsOptions` (its `previous` is optional), so feed the result straight to
 * D1's `deriveLessonDecisions`.
 */
export type CopyDerivationOptions = Omit<DeriveDecisionsOptions, 'previous'> & {
  readonly previous?: undefined;
};

/** Inputs for building a copy's derivation options. A copy is a NEW lesson (new `lessonId`) and a NEW
 *  lineage (new `sourceLineageId`, minted via `mintSourceLineageId`) — never the source's ids. */
export interface BuildCopyDerivationInput {
  readonly lessonId: string;
  readonly sourceKind: DeriveDecisionsOptions['sourceKind'];
  readonly learnerSide: 'white' | 'black';
  readonly chapterId?: string;
  readonly sourceLineageId?: string;
  readonly sourceRevision?: number;
  readonly mintId?: () => string;
}

/**
 * Build `DeriveDecisionsOptions` for a COPY of a lesson. The returned options OMIT `previous`, so
 * D1's `mint()` branch (material.ts:306) runs for EVERY decision → fresh, independent UUIDs; the copy
 * never inherits the source's decision identities (P2-ORP-17 §5.1). D3 shapes D1's inputs only — it
 * neither re-mints nor re-derives here.
 */
export function buildCopyDerivationOptions(input: BuildCopyDerivationInput): CopyDerivationOptions {
  // `previous` is intentionally never set — see CopyDerivationOptions (compile-enforced independence).
  return {
    lessonId: input.lessonId,
    sourceKind: input.sourceKind,
    learnerSide: input.learnerSide,
    ...(input.chapterId !== undefined ? { chapterId: input.chapterId } : {}),
    ...(input.sourceLineageId !== undefined ? { sourceLineageId: input.sourceLineageId } : {}),
    ...(input.sourceRevision !== undefined ? { sourceRevision: input.sourceRevision } : {}),
    ...(input.mintId !== undefined ? { mintId: input.mintId } : {}),
  };
}

/**
 * Transition a linked source provenance to UNLINKED in place (§14.4). KEEPS `sourceLineageId` and the
 * verified source descriptor as honest lineage history, flips linkage to
 * `{unlinked; 'unlinked-from-source'}`, and captures the last linked revision so lineage stays
 * explainable. Performs NO re-mint and NO schedule reset — the caller keeps the Study's stable
 * decision UUIDs untouched (D3 never re-derives on unlink). Contrast a COPY, which is a genuinely new
 * object and DOES get fresh UUIDs via `buildCopyDerivationOptions`.
 */
export function unlinkSourceProvenance(current: SourceImportedProvenance): SourceImportedProvenance {
  const preservedRevision =
    current.version.kind === 'linked' ? current.version.sourceRevision : current.lastLinkedRevision;
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
