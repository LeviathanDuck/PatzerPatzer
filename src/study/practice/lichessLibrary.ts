





























import type { TreeNode } from '../../tree/types';
import { pgnToTree } from '../../tree/pgn';
import { mintSourceLineageId, linkedSourceVersion } from './linkedSource';
import type { SrsSourceVersion } from './srsTypes';
import type { SourceImportedProvenance, VerifiedSourceDescriptor } from '../types';
import {
  getLichessStudyMetadata,
  putLichessStudyMetadata,
  dropLichessStudyMetadata,
  classifyStudyMetadataFreshness,
  type CachedLichessStudyMetadata,
  type StudyMetadataFreshness,
} from '../studyDb';

const LICHESS_API_BASE = 'https://lichess.org';
/** Fallback rate-limit backoff when the response carries no usable `Retry-After` header. */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;

// --- Injected dependencies -------------------------------------------------------------------------

export interface LichessLibraryDeps {
  /** Fetch implementation. Injected so tests never hit the live network; defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** OAuth bearer token for authenticated (own/private) access. The CALLER resolves it via
   *  lichessClient.ts and passes it in — this module never reads localStorage or re-implements OAuth. */
  readonly token?: string;
  /** Lineage-id mint, forwarded to D3's mintSourceLineageId (deterministic in tests). */
  readonly mintLineageId?: () => string;
  /** Clock injection for fetchedAt (deterministic in tests). */
  readonly now?: () => number;
}

// --- Verified discovery targets — the ONLY three paths ---------------------------------------------

/** A single-study resolve target. Each anchors to a specific, user-verifiable study. */
export type VerifiedStudyTarget =
  /** (1) My Studies: the OAuth user's OWN study (a token is required; auth-required without one). */
  | { readonly path: 'my-studies'; readonly studyId: string }
  /** (2) Direct study by URL or id: the Lichess API's own visibility is the authority. */
  | { readonly path: 'direct'; readonly input: string }
  /** (3) A NAMED user's PUBLIC study (public-only; a token is never sent on this path). */
  | { readonly path: 'named-user-public'; readonly username: string; readonly studyId: string };

/** A user-scoped listing target — the "My Studies" and "named-user public" discovery surfaces.
 *  This is user-specific, never a universal catalog: it resolves ONLY the by-user export path. */
export type VerifiedUserListTarget =
  | { readonly path: 'my-studies'; readonly username: string }
  | { readonly path: 'named-user-public'; readonly username: string };

// --- Producer output for D3 ------------------------------------------------------------------------

/** Rich, descriptive attribution D4 carries for a verified study — NEVER an identity (the durable
 *  grouping key is the minted `sourceLineageId`). Attribution is mandatory (gate §3): a resolved study
 *  always records study id, author username, title, and a link back. */
export interface VerifiedStudyDescriptor {
  readonly studyId: string;
  readonly author: string;
  readonly title: string;
  readonly url: string;
}

/** One parsed study chapter — a chapter title plus its full move TreeNode (via pgnToTree). */
export interface ResolvedChapter {
  readonly title: string;
  readonly tree: TreeNode;
}

/**
 * A fully resolved verified source — the PRODUCER output D3 consumes. It carries the minted
 * `sourceLineageId` (via D3's mintSourceLineageId), a FINITE `sourceRevision` and its `linked`
 * SrsSourceVersion (via D3's linkedSourceVersion, fail-closed), the descriptive attribution, and the
 * parsed chapters. `toSourceImportedProvenance` assembles D3's SourceImportedProvenance from it.
 */
export interface ResolvedVerifiedSource {
  readonly sourceLineageId: string;
  readonly sourceRevision: number;
  readonly version: SrsSourceVersion;
  readonly descriptor: VerifiedStudyDescriptor;
  readonly source: VerifiedSourceDescriptor;
  readonly chapters: readonly ResolvedChapter[];
  readonly fetchedAt: number;
}

/** A metadata-only listing entry for a user's study (no chapters imported — read-only discovery). */
export interface UserStudyListEntry {
  readonly studyId: string;
  readonly title: string;
  readonly author: string;
  readonly url: string;
  readonly chapterList: readonly string[];
}

// --- Outcome unions — the seven distinct, honest states --------------------------------------------

export type ResolveFailureReason =
  | 'not-found'
  | 'parse'
  | 'empty'
  | 'unresolvable-revision'
  | 'missing-attribution'
  | 'invalid-target'
  | 'http-error';

/** Initial single-study resolve outcome. */
export type ResolveOutcome =
  | { readonly state: 'resolved'; readonly source: ResolvedVerifiedSource }
  | { readonly state: 'auth-required' }
  | { readonly state: 'private'; readonly studyId: string }
  | { readonly state: 'rate-limited'; readonly retryAfterMs: number }
  | { readonly state: 'offline'; readonly cached?: CachedLichessStudyMetadata }
  | { readonly state: 'failed'; readonly reason: ResolveFailureReason };

/** Revalidation outcome for an ALREADY-LINKED source. 404/403 here means the source was removed or
 *  turned private: mark unavailable, DROP cached metadata, offer unlink — never cascade a local
 *  delete, never serve stale private content as live. */
export type RefreshOutcome =
  | { readonly state: 'resolved'; readonly source: ResolvedVerifiedSource; readonly freshness: StudyMetadataFreshness }
  | { readonly state: 'unavailable'; readonly studyId: string; readonly reason: 'removed' | 'private'; readonly offerUnlink: true }
  | { readonly state: 'auth-required' }
  | { readonly state: 'rate-limited'; readonly retryAfterMs: number }
  | { readonly state: 'offline'; readonly cached?: CachedLichessStudyMetadata }
  | { readonly state: 'failed'; readonly reason: ResolveFailureReason };

/** User-scoped listing outcome (My Studies / named-user public). */
export type ListOutcome =
  | { readonly state: 'listed'; readonly studies: readonly UserStudyListEntry[] }
  | { readonly state: 'auth-required' }
  | { readonly state: 'private'; readonly username: string }
  | { readonly state: 'rate-limited'; readonly retryAfterMs: number }
  | { readonly state: 'offline' }
  | { readonly state: 'failed'; readonly reason: ResolveFailureReason };

// --- Target parsing --------------------------------------------------------------------------------

/**
 * Extract a Lichess study id from a raw id or a study URL. Verified-only: rejects anything that is not
 * a well-formed 8-char study id or a lichess.org/study/<id> URL — there is no enumeration or guessing.
 */
export function parseStudyId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/lichess\.org\/study\/([a-zA-Z0-9]{8})(?:\/[a-zA-Z0-9]{8})?/);
  if (urlMatch) return urlMatch[1]!;
  const rawMatch = trimmed.match(/^([a-zA-Z0-9]{8})(?:\/[a-zA-Z0-9]{8})?$/);
  if (rawMatch) return rawMatch[1]!;
  return null;
}

function studyIdForTarget(target: VerifiedStudyTarget): string | null {
  if (target.path === 'direct') return parseStudyId(target.input);
  return parseStudyId(target.studyId);
}

// --- Endpoints (policy shape — confirm exact paths at build time, gate §2) -------------------------

function studyPgnUrl(studyId: string): string {
  return `${LICHESS_API_BASE}/api/study/${encodeURIComponent(studyId)}.pgn`;
}

function studyMetaUrl(studyId: string): string {
  return `${LICHESS_API_BASE}/api/study/${encodeURIComponent(studyId)}`;
}

function byUserPgnUrl(username: string): string {
  return `${LICHESS_API_BASE}/api/study/by/${encodeURIComponent(username)}/export.pgn`;
}

function studyWebUrl(studyId: string): string {
  return `${LICHESS_API_BASE}/study/${studyId}`;
}

// --- Fetch + HTTP classification -------------------------------------------------------------------

function resolveFetch(deps: LichessLibraryDeps): typeof fetch {
  if (deps.fetchImpl) return deps.fetchImpl;
  if (typeof fetch === 'function') return fetch;
  throw new Error('lichessLibrary: no fetch implementation available (inject deps.fetchImpl)');
}

/** Classified HTTP outcome. 401 (auth-expired) is distinguished from 403 (private/forbidden) because
 *  lichessClient.authFailureClass buckets both into 'auth-rejected'; D4 also owns the 429 branch it
 *  lacks. */
type ClassifiedFetch =
  | { readonly kind: 'ok'; readonly response: Response }
  | { readonly kind: 'auth-expired' }
  | { readonly kind: 'private' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number }
  | { readonly kind: 'offline'; readonly error: unknown }
  | { readonly kind: 'http-error'; readonly status: number };

function parseRetryAfterMs(res: Response): number {
  try {
    const header = res.headers?.get?.('Retry-After');
    if (header) {
      const secs = Number(header);
      if (Number.isFinite(secs) && secs >= 0) return Math.floor(secs * 1000);
    }
  } catch {
    /* hostile/mocked headers — fall through to the default backoff */
  }
  return DEFAULT_RATE_LIMIT_BACKOFF_MS;
}

interface ClassifiedFetchArgs {
  readonly fetchImpl: typeof fetch;
  readonly token?: string | undefined;
  readonly sendAuth: boolean;
  readonly accept: string;
}

async function classifiedFetch(url: string, args: ClassifiedFetchArgs): Promise<ClassifiedFetch> {
  const headers: Record<string, string> = { Accept: args.accept };
  // Auth is sent ONLY on own/direct paths; the named-user-public path never sends the token (public
  // content only — gate §1.3), so it can never surface another user's private study.
  if (args.sendAuth && args.token) headers.Authorization = `Bearer ${args.token}`;
  let res: Response;
  try {
    res = await args.fetchImpl(url, { headers });
  } catch (error) {
    return { kind: 'offline', error };
  }
  if (res.ok) return { kind: 'ok', response: res };
  if (res.status === 401) return { kind: 'auth-expired' };
  if (res.status === 403) return { kind: 'private' };
  if (res.status === 404) return { kind: 'not-found' };
  if (res.status === 429) return { kind: 'rate-limited', retryAfterMs: parseRetryAfterMs(res) };
  return { kind: 'http-error', status: res.status };
}

// --- Metadata + chapter parsing --------------------------------------------------------------------

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function resolveAuthor(meta: Record<string, unknown>): string | undefined {
  const owner = meta.owner;
  if (typeof owner === 'string') return firstString(owner);
  if (owner && typeof owner === 'object') {
    const o = owner as Record<string, unknown>;
    const fromOwner = firstString(o.name, o.username, o.id);
    if (fromOwner) return fromOwner;
  }
  return firstString(meta.author, meta.username, meta.ownerId, meta.ownerName);
}

/** Derive a FINITE integer snapshot cursor from metadata. Tries explicit revision/version fields, then
 *  an updated-at epoch cursor. Returns null when none is a finite number — the caller then fails
 *  closed (never persists a link with an unusable revision). */
function deriveFiniteRevision(meta: Record<string, unknown>): number | null {
  const nested = (meta.updated && typeof meta.updated === 'object')
    ? (meta.updated as Record<string, unknown>).at
    : undefined;
  const candidates = [meta.revision, meta.version, meta.updatedAt, nested, meta.dateUpdated];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return Math.floor(c);
  }
  return null;
}

interface ParsedStudyMeta {
  readonly title?: string | undefined;
  readonly author?: string | undefined;
  readonly revision: number | null;
}

function parseStudyMeta(json: unknown): ParsedStudyMeta {
  const obj = (json && typeof json === 'object') ? (json as Record<string, unknown>) : {};
  return {
    title: firstString(obj.name, obj.title),
    author: resolveAuthor(obj),
    revision: deriveFiniteRevision(obj),
  };
}

function extractTag(pgn: string, tag: string): string | undefined {
  const match = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return match ? match[1] : undefined;
}

function extractChapterTitle(pgn: string, index: number): string {
  const event = extractTag(pgn, 'Event');
  if (event) {
    // Study exports use `Event = "StudyName: ChapterName"`; keep the chapter part when present.
    const colon = event.indexOf(':');
    const chapter = colon >= 0 ? event.slice(colon + 1).trim() : event.trim();
    if (chapter) return chapter;
  }
  return `Chapter ${index + 1}`;
}

/** Split a multi-chapter Study PGN and build one TreeNode per chapter. ALL-OR-NOTHING: if ANY chapter
 *  fails to parse, returns null so the whole import is rejected — never a partial/corrupt lesson.
 *  Reuses the exact chapter-split pattern proven in src/import/lichess.ts:185. */
function parseChapters(text: string): ResolvedChapter[] | null {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chapterTexts = trimmed.split(/\n\n(?=\[Event )/).filter(s => s.trim());
  const chapters: ResolvedChapter[] = [];
  for (let i = 0; i < chapterTexts.length; i++) {
    const pgn = chapterTexts[i]!;
    let tree: TreeNode;
    try {
      tree = pgnToTree(pgn);
    } catch {
      return null;
    }
    chapters.push({ title: extractChapterTitle(pgn, i), tree });
  }
  return chapters;
}

async function readJsonSafe(res: Response): Promise<unknown | undefined> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function readTextSafe(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

// --- Single-study resolve (paths: direct, my-studies, named-user-public) ---------------------------

function mapFetchToResolveState(
  f: Exclude<ClassifiedFetch, { kind: 'ok' }>,
  studyId: string,
): ResolveOutcome {
  switch (f.kind) {
    case 'auth-expired':
      return { state: 'auth-required' };
    case 'private':
      return { state: 'private', studyId };
    case 'not-found':
      return { state: 'failed', reason: 'not-found' };
    case 'rate-limited':
      return { state: 'rate-limited', retryAfterMs: f.retryAfterMs };
    case 'offline': {
      const cached = getLichessStudyMetadata(studyId);
      return cached ? { state: 'offline', cached } : { state: 'offline' };
    }
    case 'http-error':
      return { state: 'failed', reason: 'http-error' };
  }
}

/** Assemble a resolved verified source from fetched metadata + chapters. Emits D3's inputs
 *  (mintSourceLineageId + fail-closed linkedSourceVersion) and populates the metadata cache. */
function buildResolved(
  studyId: string,
  meta: ParsedStudyMeta,
  chapters: readonly ResolvedChapter[],
  deps: LichessLibraryDeps,
  now: () => number,
): ResolvedVerifiedSource | { readonly failure: ResolveFailureReason } {
  if (!meta.author) return { failure: 'missing-attribution' };
  if (meta.revision === null) return { failure: 'unresolvable-revision' };

  let version: SrsSourceVersion;
  try {
    // D3 owns the fail-closed finite-revision authority (throws RangeError on non-finite/non-integer).
    version = linkedSourceVersion(meta.revision);
  } catch {
    return { failure: 'unresolvable-revision' };
  }

  const title = meta.title ?? studyId;
  const url = studyWebUrl(studyId);
  const sourceLineageId = mintSourceLineageId(deps.mintLineageId);
  const fetchedAt = now();
  const descriptor: VerifiedStudyDescriptor = { studyId, author: meta.author, title, url };
  const source: VerifiedSourceDescriptor = { url, label: `${title} — ${meta.author}` };

  putLichessStudyMetadata({
    studyId,
    title,
    author: meta.author,
    chapterList: chapters.map(c => c.title),
    revisionCursor: meta.revision,
    fetchedAt,
  });

  return { sourceLineageId, sourceRevision: meta.revision, version, descriptor, source, chapters, fetchedAt };
}

interface FetchedStudy {
  readonly meta: ParsedStudyMeta;
  readonly chapters: readonly ResolvedChapter[];
}

/** Shared network+parse core: metadata then PGN, mapping every non-ok classification to a state.
 *  Returns either a fetch state to surface directly or the fetched study payload. */
async function fetchStudy(
  studyId: string,
  sendAuth: boolean,
  deps: LichessLibraryDeps,
  fetchImpl: typeof fetch,
): Promise<{ readonly state: ResolveOutcome } | { readonly study: FetchedStudy }> {
  const metaFetch = await classifiedFetch(studyMetaUrl(studyId), {
    fetchImpl, token: deps.token, sendAuth, accept: 'application/json',
  });
  if (metaFetch.kind !== 'ok') return { state: mapFetchToResolveState(metaFetch, studyId) };
  const metaJson = await readJsonSafe(metaFetch.response);
  if (metaJson === undefined) return { state: { state: 'failed', reason: 'parse' } };
  const meta = parseStudyMeta(metaJson);

  const pgnFetch = await classifiedFetch(studyPgnUrl(studyId), {
    fetchImpl, token: deps.token, sendAuth, accept: 'application/x-chess-pgn',
  });
  if (pgnFetch.kind !== 'ok') return { state: mapFetchToResolveState(pgnFetch, studyId) };
  const text = await readTextSafe(pgnFetch.response);
  if (text === undefined) return { state: { state: 'failed', reason: 'parse' } };

  const chapters = parseChapters(text);
  if (chapters === null) return { state: { state: 'failed', reason: 'parse' } };
  if (chapters.length === 0) return { state: { state: 'failed', reason: 'empty' } };

  return { study: { meta, chapters } };
}

/**
 * Resolve a single verified study into the linked-source inputs D3 consumes. Covers the direct-URL,
 * My-Studies (own), and named-user-public paths. My-Studies without a token → auth-required (no
 * network call). All-or-nothing: any parse failure yields `failed`, never a partial import.
 */
export async function resolveVerifiedStudy(
  target: VerifiedStudyTarget,
  deps: LichessLibraryDeps = {},
): Promise<ResolveOutcome> {
  const fetchImpl = resolveFetch(deps);
  const now = deps.now ?? (() => Date.now());

  const studyId = studyIdForTarget(target);
  if (studyId === null) return { state: 'failed', reason: 'invalid-target' };

  const sendAuth = target.path !== 'named-user-public';
  if (target.path === 'my-studies' && !deps.token) return { state: 'auth-required' };

  const fetched = await fetchStudy(studyId, sendAuth, deps, fetchImpl);
  if ('state' in fetched) return fetched.state;

  const built = buildResolved(studyId, fetched.study.meta, fetched.study.chapters, deps, now);
  if ('failure' in built) return { state: 'failed', reason: built.failure };
  return { state: 'resolved', source: built };
}

/**
 * Revalidate an already-linked study. On 404/403 the source is unavailable (removed / turned private):
 * cached metadata is DROPPED, unlink is offered, and no stale private content is served — the local
 * snapshot (D3) is untouched (no local delete cascades). On success, classifies freshness (stale vs
 * current) against the cached revision cursor before refreshing the cache.
 */
export async function refreshVerifiedStudy(
  target: VerifiedStudyTarget,
  deps: LichessLibraryDeps = {},
): Promise<RefreshOutcome> {
  const fetchImpl = resolveFetch(deps);
  const now = deps.now ?? (() => Date.now());

  const studyId = studyIdForTarget(target);
  if (studyId === null) return { state: 'failed', reason: 'invalid-target' };

  const sendAuth = target.path !== 'named-user-public';
  if (target.path === 'my-studies' && !deps.token) return { state: 'auth-required' };

  // Peek the prior cached revision BEFORE any refresh so freshness compares against the last snapshot.
  const priorRevision = getLichessStudyMetadata(studyId)?.revisionCursor;

  const metaFetch = await classifiedFetch(studyMetaUrl(studyId), {
    fetchImpl, token: deps.token, sendAuth, accept: 'application/json',
  });
  if (metaFetch.kind !== 'ok') {
    const refreshState = mapFetchToRefreshState(metaFetch, studyId);
    if (refreshState) return refreshState;
  }

  // metaFetch is ok past this point.
  const okMeta = metaFetch as Extract<ClassifiedFetch, { kind: 'ok' }>;
  const metaJson = await readJsonSafe(okMeta.response);
  if (metaJson === undefined) return { state: 'failed', reason: 'parse' };
  const meta = parseStudyMeta(metaJson);

  const pgnFetch = await classifiedFetch(studyPgnUrl(studyId), {
    fetchImpl, token: deps.token, sendAuth, accept: 'application/x-chess-pgn',
  });
  if (pgnFetch.kind !== 'ok') {
    const refreshState = mapFetchToRefreshState(pgnFetch, studyId);
    if (refreshState) return refreshState;
  }
  const okPgn = pgnFetch as Extract<ClassifiedFetch, { kind: 'ok' }>;
  const text = await readTextSafe(okPgn.response);
  if (text === undefined) return { state: 'failed', reason: 'parse' };
  const chapters = parseChapters(text);
  if (chapters === null) return { state: 'failed', reason: 'parse' };
  if (chapters.length === 0) return { state: 'failed', reason: 'empty' };

  const built = buildResolved(studyId, meta, chapters, deps, now);
  if ('failure' in built) return { state: 'failed', reason: built.failure };

  const freshness = priorRevision === undefined
    ? 'unknown'
    : classifyStudyMetadataFreshness(priorRevision, built.sourceRevision);
  return { state: 'resolved', source: built, freshness };
}

/** Map a non-ok classification to a REFRESH state. 404/403 → unavailable (drop cache, offer unlink);
 *  returns null for `ok` (never reached — callers guard). */
function mapFetchToRefreshState(
  f: ClassifiedFetch,
  studyId: string,
): RefreshOutcome | null {
  switch (f.kind) {
    case 'ok':
      return null;
    case 'auth-expired':
      return { state: 'auth-required' };
    case 'not-found':
      dropLichessStudyMetadata(studyId);
      return { state: 'unavailable', studyId, reason: 'removed', offerUnlink: true };
    case 'private':
      dropLichessStudyMetadata(studyId);
      return { state: 'unavailable', studyId, reason: 'private', offerUnlink: true };
    case 'rate-limited':
      return { state: 'rate-limited', retryAfterMs: f.retryAfterMs };
    case 'offline': {
      // Offline: serve cached metadata only, freshness-unknown; never fabricate a live state.
      const cached = getLichessStudyMetadata(studyId);
      return cached ? { state: 'offline', cached } : { state: 'offline' };
    }
    case 'http-error':
      return { state: 'failed', reason: 'http-error' };
  }
}

// --- User-scoped listing (My Studies / named-user public) ------------------------------------------

/** Parse the by-user Study export into a metadata-only per-study listing. Uses ONLY what the export
 *  exposes for THIS named user; author is the verified target username. Chapters without a parseable
 *  study id are skipped. This is user-specific discovery — never a universal catalog. */
function parseUserStudyList(text: string, username: string): UserStudyListEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chapterTexts = trimmed.split(/\n\n(?=\[Event )/).filter(s => s.trim());
  const byStudy = new Map<string, { title: string; chapters: string[] }>();
  for (let i = 0; i < chapterTexts.length; i++) {
    const pgn = chapterTexts[i]!;
    const site = extractTag(pgn, 'Site') ?? '';
    const idMatch = site.match(/\/study\/([a-zA-Z0-9]{8})/);
    const studyId = idMatch ? idMatch[1]! : null;
    if (!studyId) continue;
    const event = extractTag(pgn, 'Event') ?? '';
    const colon = event.indexOf(':');
    const studyTitle = (colon >= 0 ? event.slice(0, colon) : event).trim() || studyId;
    const existing = byStudy.get(studyId);
    if (existing) {
      existing.chapters.push(extractChapterTitle(pgn, existing.chapters.length));
    } else {
      byStudy.set(studyId, { title: studyTitle, chapters: [extractChapterTitle(pgn, 0)] });
    }
  }
  const entries: UserStudyListEntry[] = [];
  for (const [studyId, info] of byStudy) {
    entries.push({
      studyId,
      title: info.title,
      author: username,
      url: studyWebUrl(studyId),
      chapterList: info.chapters,
    });
  }
  return entries;
}

/**
 * List a user's studies via the by-user export path — the "My Studies" (own, with token) and
 * "named-user public" (no token) discovery surfaces. Own without a token → auth-required. Returns
 * metadata-only entries (no chapters imported; a full import happens later via resolveVerifiedStudy,
 * per P2-ORP-20's read-only-preview-before-import rule). This is the ONLY listing surface — there is
 * no universal-catalog / search-all / enumerate path anywhere in this module.
 */
export async function listUserStudies(
  target: VerifiedUserListTarget,
  deps: LichessLibraryDeps = {},
): Promise<ListOutcome> {
  const fetchImpl = resolveFetch(deps);
  const own = target.path === 'my-studies';
  if (own && !deps.token) return { state: 'auth-required' };

  const f = await classifiedFetch(byUserPgnUrl(target.username), {
    fetchImpl, token: deps.token, sendAuth: own, accept: 'application/x-chess-pgn',
  });
  switch (f.kind) {
    case 'auth-expired':
      return { state: 'auth-required' };
    case 'private':
      return { state: 'private', username: target.username };
    case 'not-found':
      return { state: 'failed', reason: 'not-found' };
    case 'rate-limited':
      return { state: 'rate-limited', retryAfterMs: f.retryAfterMs };
    case 'offline':
      return { state: 'offline' };
    case 'http-error':
      return { state: 'failed', reason: 'http-error' };
    case 'ok': {
      const text = await readTextSafe(f.response);
      if (text === undefined) return { state: 'failed', reason: 'parse' };
      return { state: 'listed', studies: parseUserStudyList(text, target.username) };
    }
  }
}

// --- Producer → D3 assembly ------------------------------------------------------------------------

/**
 * Assemble D3's SourceImportedProvenance from a resolved verified source. Pure assembly of already-
 * produced values (minted lineage id, fail-closed linked version, descriptive source) — it does NOT
 * re-implement D3's model (minting, unlink, stamping remain D3's). This is the concrete seam by which
 * D4's producer output feeds D3's linked-source layer.
 */
export function toSourceImportedProvenance(resolved: ResolvedVerifiedSource): SourceImportedProvenance {
  return {
    layer: 'source-imported',
    sourceLineageId: resolved.sourceLineageId,
    version: resolved.version,
    source: resolved.source,
    linkedAt: resolved.fetchedAt,
  };
}
