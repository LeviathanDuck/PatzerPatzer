



















































import type { TreeNode } from '../../tree/types';
import { pgnToTree } from '../../tree/pgn';
import { mintSourceLineageId, linkedSourceVersion } from './linkedSource';
import type { SrsSourceVersion } from './srsTypes';
import type { SourceImportedProvenance, VerifiedSourceDescriptor } from '../types';
import {
  getLichessStudyMetadata,
  putLichessStudyMetadata,
  dropLichessStudyMetadata,
  clearPrivateLichessStudyMetadata,
  classifyStudyMetadataFreshness,
  type CachedLichessStudyMetadata,
  type CachedStudyAccess,
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






export type RefreshOutcome =
  | { readonly state: 'resolved'; readonly source: ResolvedVerifiedSource; readonly freshness: Exclude<StudyMetadataFreshness, 'regression'> }
  | { readonly state: 'regression'; readonly cached: CachedLichessStudyMetadata; readonly fetchedRevision: number }
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



function studyPgnUrl(studyId: string): string {
  return `${LICHESS_API_BASE}/api/study/${encodeURIComponent(studyId)}.pgn`;
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

// --- Metadata derivation from the PGN export + response headers (live-authoritative) ---------------







function parseAnnotatorAuthor(pgn: string): string | undefined {
  const raw = extractTag(pgn, 'Annotator')?.trim();
  if (!raw) return undefined;
  const profile = raw.match(/lichess\.org\/@\/([A-Za-z0-9_-]+)/);
  if (profile) return profile[1]!;
  if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return undefined;
}







function parseLastModifiedRevision(res: Response): number | null {
  try {
    const header = res.headers?.get?.('Last-Modified');
    if (!header) return null;
    const ms = Date.parse(header);
    return Number.isFinite(ms) ? Math.floor(ms) : null;
  } catch {
    return null;
  }
}

/** Study display title from the first chapter's `Event` tag (`"StudyName: ChapterName"`). */
function parseStudyTitle(firstChapterPgn: string | undefined, studyId: string): string {
  if (firstChapterPgn) {
    const event = extractTag(firstChapterPgn, 'Event') ?? '';
    const colon = event.indexOf(':');
    const title = (colon >= 0 ? event.slice(0, colon) : event).trim();
    if (title) return title;
  }
  return studyId;
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

async function readTextSafe(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}



/** Short, non-reversible principal key for cache partitioning (FNV-1a over the token; the raw token
 *  is never used as a key or stored on entries). */
function principalKeyOf(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** The access context a resolve runs under: authenticated requests read/write the principal's
 *  PRIVATE cache partition; unauthenticated/public-path requests see only proven-public entries. */
function accessOf(sendAuth: boolean, token: string | undefined): CachedStudyAccess {
  return sendAuth && token ? { scope: 'private', principal: principalKeyOf(token) } : { scope: 'public' };
}

// --- Single-study resolve (paths: direct, my-studies, named-user-public) ---------------------------

function mapFetchToResolveState(
  f: Exclude<ClassifiedFetch, { kind: 'ok' }>,
  studyId: string,
  access: CachedStudyAccess,
): ResolveOutcome {
  switch (f.kind) {
    case 'auth-expired':
      // Auth loss: this principal's private-partition entries must not outlive the session's auth.
      if (access.scope === 'private') clearPrivateLichessStudyMetadata(access.principal);
      return { state: 'auth-required' };
    case 'private':
      return { state: 'private', studyId };
    case 'not-found':
      return { state: 'failed', reason: 'not-found' };
    case 'rate-limited':
      return { state: 'rate-limited', retryAfterMs: f.retryAfterMs };
    case 'offline': {
      const cached = getLichessStudyMetadata(studyId, access);
      return cached ? { state: 'offline', cached } : { state: 'offline' };
    }
    case 'http-error':
      return { state: 'failed', reason: 'http-error' };
  }
}




type LineageMode =
  | { readonly kind: 'mint' }
  | { readonly kind: 'reuse'; readonly sourceLineageId: string };

/** Fetched-and-parsed study payload from the single PGN GET. */
interface FetchedStudy {
  readonly author: string | undefined;
  readonly title: string;
  readonly revision: number | null;
  readonly chapters: readonly ResolvedChapter[];
}

/**
 * The single-fetch network+parse core (PGN-only — finding 2): one GET of the documented PGN export.
 * Author from the `Annotator` tag; revision from `Last-Modified`; title from the first chapter's
 * `Event` study part. Returns a classification for every non-ok outcome.
 */
async function fetchStudyPgn(
  studyId: string,
  sendAuth: boolean,
  deps: LichessLibraryDeps,
  fetchImpl: typeof fetch,
): Promise<{ readonly fetch: Exclude<ClassifiedFetch, { kind: 'ok' }> }
        | { readonly failed: ResolveFailureReason }
        | { readonly study: FetchedStudy }> {
  const pgnFetch = await classifiedFetch(studyPgnUrl(studyId), {
    fetchImpl, token: deps.token, sendAuth, accept: 'application/x-chess-pgn',
  });
  if (pgnFetch.kind !== 'ok') return { fetch: pgnFetch };
  const revision = parseLastModifiedRevision(pgnFetch.response);
  const text = await readTextSafe(pgnFetch.response);
  if (text === undefined) return { failed: 'parse' };

  const chapters = parseChapters(text);
  if (chapters === null) return { failed: 'parse' };
  if (chapters.length === 0) return { failed: 'empty' };

  const firstChapter = text.trim().split(/\n\n(?=\[Event )/)[0];
  return {
    study: {
      author: firstChapter !== undefined ? parseAnnotatorAuthor(firstChapter) : undefined,
      title: parseStudyTitle(firstChapter, studyId),
      revision,
      chapters,
    },
  };
}

/** Verified author evidence: the PGN `Annotator` tag, else the named-user path's verified username
 *  (the by-path scope IS the author identity there). Anything else fails closed (attribution is
 *  mandatory — gate §3). */
function resolveVerifiedAuthor(study: FetchedStudy, target: VerifiedStudyTarget): string | undefined {
  if (study.author) return study.author;
  if (target.path === 'named-user-public') return target.username;
  return undefined;
}

/** Assemble a resolved verified source. PURE assembly — the cache commit is the CALLER's decision
 *  (finding 3: refresh classifies freshness BEFORE committing). */
function buildResolved(
  studyId: string,
  author: string,
  study: FetchedStudy,
  lineage: LineageMode,
  deps: LichessLibraryDeps,
  now: () => number,
): ResolvedVerifiedSource | { readonly failure: ResolveFailureReason } {
  if (study.revision === null) return { failure: 'unresolvable-revision' };

  let version: SrsSourceVersion;
  try {
    // D3 owns the fail-closed finite-revision authority (throws RangeError on non-finite/non-integer).
    version = linkedSourceVersion(study.revision);
  } catch {
    return { failure: 'unresolvable-revision' };
  }

  const url = studyWebUrl(studyId);
  const sourceLineageId = lineage.kind === 'reuse'
    ? lineage.sourceLineageId
    : mintSourceLineageId(deps.mintLineageId);
  const fetchedAt = now();
  const descriptor: VerifiedStudyDescriptor = { studyId, author, title: study.title, url };
  const source: VerifiedSourceDescriptor = { url, label: `${study.title} — ${author}` };

  return {
    sourceLineageId, sourceRevision: study.revision, version, descriptor, source,
    chapters: study.chapters, fetchedAt,
  };
}

function cacheEntryOf(
  studyId: string,
  built: ResolvedVerifiedSource,
  access: CachedStudyAccess,
): CachedLichessStudyMetadata {
  return {
    studyId,
    title: built.descriptor.title,
    author: built.descriptor.author,
    chapterList: built.chapters.map(c => c.title),
    revisionCursor: built.sourceRevision,
    fetchedAt: built.fetchedAt,
    access,
  };
}

/**
 * Resolve a single verified study into the linked-source inputs D3 consumes. Covers the direct-URL,
 * My-Studies (own), and named-user-public paths. My-Studies without a token → auth-required (no
 * network call). All-or-nothing: any parse failure yields `failed`, never a partial import. This is
 * the INITIAL import path — it mints the lineage; refresh never does.
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
  const access = accessOf(sendAuth, deps.token);

  const fetched = await fetchStudyPgn(studyId, sendAuth, deps, fetchImpl);
  if ('fetch' in fetched) return mapFetchToResolveState(fetched.fetch, studyId, access);
  if ('failed' in fetched) return { state: 'failed', reason: fetched.failed };

  const author = resolveVerifiedAuthor(fetched.study, target);
  if (!author) return { state: 'failed', reason: 'missing-attribution' };

  const built = buildResolved(studyId, author, fetched.study, { kind: 'mint' }, deps, now);
  if ('failure' in built) return { state: 'failed', reason: built.failure };

  putLichessStudyMetadata(cacheEntryOf(studyId, built, access));
  return { state: 'resolved', source: built };
}

/** The already-linked identity a refresh revalidates — the refresh REUSES this lineage (finding 1). */
export interface LinkedStudyIdentity {
  readonly sourceLineageId: string;
}

/**
 * Revalidate an ALREADY-LINKED study. Reuses the existing `sourceLineageId` (finding 1 — a refresh
 * never mints; dismissals/snoozes/D6 joins keyed to the lineage survive). On 404/403 the source is
 * unavailable (removed / turned private): cached metadata is DROPPED, unlink is offered, and no
 * stale private content is served — the local snapshot (D3) is untouched. On success, freshness is
 * classified BEFORE the cache commit (finding 3): a LOWER-than-cached revision is a `regression`
 * outcome that does NOT replace the cached cursor and carries NO source (never merge input).
 */
export async function refreshVerifiedStudy(
  target: VerifiedStudyTarget,
  existing: LinkedStudyIdentity,
  deps: LichessLibraryDeps = {},
): Promise<RefreshOutcome> {
  const fetchImpl = resolveFetch(deps);
  const now = deps.now ?? (() => Date.now());

  const studyId = studyIdForTarget(target);
  if (studyId === null) return { state: 'failed', reason: 'invalid-target' };

  const sendAuth = target.path !== 'named-user-public';
  if (target.path === 'my-studies' && !deps.token) return { state: 'auth-required' };
  const access = accessOf(sendAuth, deps.token);

  // Peek the prior cached revision BEFORE any refresh so freshness compares against the last snapshot.
  const prior = getLichessStudyMetadata(studyId, access);

  const fetched = await fetchStudyPgn(studyId, sendAuth, deps, fetchImpl);
  if ('fetch' in fetched) return mapFetchToRefreshState(fetched.fetch, studyId, access);
  if ('failed' in fetched) return { state: 'failed', reason: fetched.failed };

  const author = resolveVerifiedAuthor(fetched.study, target);
  if (!author) return { state: 'failed', reason: 'missing-attribution' };

  const built = buildResolved(
    studyId, author, fetched.study,
    { kind: 'reuse', sourceLineageId: existing.sourceLineageId }, deps, now,
  );
  if ('failure' in built) return { state: 'failed', reason: built.failure };

  // Classify BEFORE committing the cache (finding 3). A regression/out-of-order snapshot must not
  // replace the cursor and must not be returned as a usable source.
  const freshness = prior === undefined
    ? 'unknown'
    : classifyStudyMetadataFreshness(prior.revisionCursor, built.sourceRevision);
  if (freshness === 'regression') {
    return { state: 'regression', cached: prior!, fetchedRevision: built.sourceRevision };
  }

  putLichessStudyMetadata(cacheEntryOf(studyId, built, access));
  return { state: 'resolved', source: built, freshness };
}

/** Map a non-ok classification to a REFRESH state. 404/403 → unavailable (drop cache, offer unlink). */
function mapFetchToRefreshState(
  f: Exclude<ClassifiedFetch, { kind: 'ok' }>,
  studyId: string,
  access: CachedStudyAccess,
): RefreshOutcome {
  switch (f.kind) {
    case 'auth-expired':
      if (access.scope === 'private') clearPrivateLichessStudyMetadata(access.principal);
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
      const cached = getLichessStudyMetadata(studyId, access);
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
