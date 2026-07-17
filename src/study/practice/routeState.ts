




























import type { Route } from '../../router';
import { parseStudyDetailRouteState, studyDetailRouteSelectsPractice } from '../detailRouteState';

// --- Opaque resume reference (content-free at C5) --------------------------------------------------
//
// A BRANDED string, deliberately NOT `unknown`, NOT a generic JSON object, and NOT a partial Package
// D structure. C5 stores and returns it verbatim and never inspects its contents; Package D (D10)
// binds it to the durable `sessionId` (srsTypes) and is the only layer that knows its meaning.

declare const practiceResumeRefBrand: unique symbol;
export type PracticeResumeRef = string & { readonly [practiceResumeRefBrand]: true };

/**
 * Brand an opaque reference string as a `PracticeResumeRef`. C5 performs no validation or inspection
 * on the value — it is a pass-through identity supplied by Package D. This exists so C5 never has to
 * fabricate structure it is forbidden to know.
 */
export function asPracticeResumeRef(value: string): PracticeResumeRef {
  return value as PracticeResumeRef;
}

// --- Route-owner identity --------------------------------------------------------------------------

/** Runtime lifecycle phase — never grading/SRS state. */
export type PracticePhase = 'active' | 'interrupted';

/**
 * Exact route owner of a Practice session: the host plus its durable route target. Path, orientation,
 * and ply refinements deliberately do NOT participate — a within-owner P0 navigation must never
 * destroy the Practice session (and such refinements use `history.replaceState`, which fires no
 * `hashchange`, so they never reach the transition seam anyway).
 */
export interface PracticeRouteOwner {
  readonly host: 'study-detail' | 'analysis-game';
  readonly target: string;
}

/** A stable string key for a route owner, or '' when there is no Practice owner. */
export type PracticeRouteOwnerKey = string;

function ownerKey(owner: PracticeRouteOwner | null): PracticeRouteOwnerKey {
  return owner ? `${owner.host}:${owner.target}` : '';
}

/**
 * Derive the Practice route owner from a router `Route`, or null when the route cannot own a Practice
 * session. Study-detail is a Practice owner only when its route actually selects the Practice tool —
 * detected through detailRouteState's canonical parser + predicate, NOT re-derived here. Analysis is
 * a Practice owner only when a durable game id is present (free `#/analysis` has no durable target).
 */
function practiceRouteOwnerFromRoute(route: Route): PracticeRouteOwner | null {
  if (route.name === 'study-detail') {
    const id = route.params['id'];
    if (!id) return null;
    const parsed = parseStudyDetailRouteState(route.query ?? '');
    if (!studyDetailRouteSelectsPractice(parsed.state)) return null;
    return { host: 'study-detail', target: id };
  }
  if (route.name === 'analysis-game') {
    const id = route.params['id'];
    return id ? { host: 'analysis-game', target: id } : null;
  }
  return null;
}

/**
 * The Analysis-SURFACE key (distinct from the Practice-owner key above): free `#/analysis` and a
 * loaded `#/analysis/:id` are BOTH analysis surfaces where C4's shared Practice slot can be active,
 * even though free analysis carries no durable Practice owner. Used only to decide when to clear
 * C4's retained slot handle on departure. Returns null off the analysis surface.
 */
function analysisSurfaceKey(route: Route): string | null {
  if (route.name === 'analysis-game') return `analysis-game:${route.params['id'] ?? ''}`;
  if (route.name === 'analysis') return 'analysis:';
  return null;
}

// --- Injected dependencies -------------------------------------------------------------------------

interface PracticeRouteStateDeps {
  /** C4's activation of the Analysis shared Practice slot (injected to avoid an import cycle). */
  activateAnalysisPracticeSlot: () => void;
  /** C4's guarded deactivation of the Analysis shared Practice slot (clears its retained handle). */
  deactivateAnalysisPracticeSlot: (reason: string) => void;
}

let _deps: PracticeRouteStateDeps | null = null;

// --- Lifecycle state (the ONLY module state) -------------------------------------------------------

let _generation = 0;
let _owner: PracticeRouteOwner | null = null;
let _resumeRef: PracticeResumeRef | null = null;
let _phase: PracticePhase = 'active';

/**
 * Initialize the Practice route lifecycle with C4's live activate/deactivate mechanics. Orchestration
 * wires this once at bootstrap; the module owns all policy over these injected primitives.
 */
export function initPracticeRouteState(deps: PracticeRouteStateDeps): void {
  _deps = deps;
}

// --- Read accessors (for the guarded-commit machinery, tests, and future Package D) ----------------

export function currentPracticeGeneration(): number {
  return _generation;
}

export function currentPracticeOwnerKey(): PracticeRouteOwnerKey {
  return ownerKey(_owner);
}

export function currentPracticePhase(): PracticePhase {
  return _phase;
}

export function currentPracticeResumeRef(): PracticeResumeRef | null {
  return _resumeRef;
}

// --- Callback lease + guarded commit ---------------------------------------------------------------
//
// The route/session guard the workspace exact-instance guard cannot provide: future Practice timers,
// promises, persistence completions, grader callbacks, and engine results live OUTSIDE the workspace
// facade. Each such callback captures a lease up front and commits through it; the commit runs only
// when all four captured values still match current C5 state, so stale callbacks and exited routes
// commit nothing. A generation match ALONE is insufficient — the exact owner and resume ref must also
// match so a late Study-A callback cannot commit into Study-B (or a new session sharing the host).

export interface PracticeLease {
  readonly generation: number;
  readonly ownerKey: PracticeRouteOwnerKey;
  readonly resumeRef: PracticeResumeRef | null;
  readonly phase: PracticePhase;
}

/** Capture the current lifecycle state as a lease for a later guarded commit. */
export function acquirePracticeLease(): PracticeLease {
  return { generation: _generation, ownerKey: ownerKey(_owner), resumeRef: _resumeRef, phase: _phase };
}

/** Whether a lease still matches current C5 state on all four axes. */
export function practiceLeaseIsCurrent(lease: PracticeLease): boolean {
  return (
    lease.generation === _generation &&
    lease.ownerKey === ownerKey(_owner) &&
    lease.resumeRef === _resumeRef &&
    lease.phase === _phase
  );
}

/**
 * Run `commit` only if `lease` still matches current C5 state (4-way match). Returns whether it ran.
 * A stale lease — old generation OR mismatched owner/ref/phase — returns `{ committed: false }` with
 * NO mutation. This is the "exited routes / stale callbacks commit nothing" guarantee.
 */
export function commitWithPracticeLease(lease: PracticeLease, commit: () => void): { committed: boolean } {
  if (!practiceLeaseIsCurrent(lease)) return { committed: false };
  commit();
  return { committed: true };
}

// --- Bootstrap + route transitions -----------------------------------------------------------------


















export function bootstrapPracticeRouteState(route: Route): void {
  _resumeRef = null;
  _phase = 'active';
  // Start from a clean null owner so a non-null owner stays deferred (establishRouteDestination leaves
  // `_owner` untouched for a deferred non-null owner), then fail closed through the host-ready gate.
  _owner = null;
  establishRouteDestination(route, false);
}























export function handleRouteTransition(transition: { previousRoute: Route; destinationRoute: Route }): void {
  const { previousRoute, destinationRoute } = transition;

  // Step 1 (HIGH 1): invalidate the outgoing lease FIRST, before any C4 teardown can run a reentrant
  // guarded commit or throw.
  const prevOwner = practiceRouteOwnerFromRoute(previousRoute);
  const destOwner = practiceRouteOwnerFromRoute(destinationRoute);
  if (ownerKey(prevOwner) !== ownerKey(destOwner)) {
    _generation += 1;
    _owner = null;
    _resumeRef = null;
    _phase = 'active';
  }

  // Step 2 (HIGH 1): NOW hand C4's retained Practice slot handle back on a real analysis-surface exit.
  // Any reentrant detach commit this triggers already sees the stale lease invalidated above.
  const prevAnalysisKey = analysisSurfaceKey(previousRoute);
  const destAnalysisKey = analysisSurfaceKey(destinationRoute);
  if (prevAnalysisKey !== null && prevAnalysisKey !== destAnalysisKey) {
    _deps?.deactivateAnalysisPracticeSlot('route-exit');
  }
}
















export function establishRouteDestination(route: Route, hostActive: boolean): void {
  const destOwner = practiceRouteOwnerFromRoute(route);
  if (destOwner !== null && !hostActive) return;
  _owner = destOwner;
}

/**
 * Shared owner-invalidation primitive: invalidate every outstanding lease (bump generation) and drop
 * the suspended ref/phase, then publish `nextOwner` (null clears ownership). The render-time reconciler
 * below uses it for its owner-change / clear branches so the 4-way guarded commit rejects every lease
 * captured against the previous owner. Synchronous/bounded.
 */
function invalidateAndPublishOwner(nextOwner: PracticeRouteOwner | null): void {
  _generation += 1;
  _owner = nextOwner;
  _resumeRef = null;
  _phase = 'active';
}




























export function reconcileRouteDestination(route: Route, exactHostReady: boolean): void {
  const readyOwner = exactHostReady ? practiceRouteOwnerFromRoute(route) : null;
  if (ownerKey(_owner) === ownerKey(readyOwner)) return;
  if (_owner === null) {
    _owner = readyOwner;
    return;
  }
  invalidateAndPublishOwner(readyOwner);
}

// --- In-place Analysis interruption ----------------------------------------------------------------
//
// "Explore in Analysis" interrupts Practice WITHOUT leaving the Analysis route. This is NOT a route
// excursion (no orientation snapshot is taken — the shared live orientation is reused; genuine route
// excursions keep using main.ts's `analysisOrientationBeforeExcursion`). It is also NOT "resume the
// same unfinished move": the hardened contract abandons an unfinished scored traversal on Analysis
// entry (D7 decides abandon, D10 does eligible Partial resume). C5 resumes only the opaque session
// REFERENCE and owner context.
















export function interruptForAnalysisExploration(): boolean {
  if (_owner === null || _owner.host !== 'analysis-game' || _phase !== 'active') return false;
  _generation += 1;
  _phase = 'interrupted';
  // _resumeRef and _owner intentionally retained: the session reference stays suspended in place.
  _deps?.deactivateAnalysisPracticeSlot('analysis-interruption');
  return true;
}












export function resumeAfterAnalysisExploration(): boolean {
  if (_phase !== 'interrupted' || _owner === null || _owner.host !== 'analysis-game') return false;
  _deps?.activateAnalysisPracticeSlot();
  _generation += 1;
  _phase = 'active';
  // _resumeRef unchanged — the resumed session is referentially identical to the interrupted one.
  return true;
}

// --- Synchronous invalidation + resume-ref binding (for future Package D controls) -----------------

/**
 * Synchronous lease invalidation for the cases `hashchange` never sees: a Package D control closing,
 * abandoning, or reassigning Practice in place (`history.replaceState` fires no `hashchange`). Bumps
 * the generation so every outstanding lease is stale, clears the suspended resume ref, and returns the
 * phase to `active`. The D caller must invoke this BEFORE scheduling any redraw or async work.
 */
export function invalidatePracticeLifecycle(_reason: string): void {
  _generation += 1;
  _resumeRef = null;
  _phase = 'active';
}

/**
 * Bind (or clear) the opaque resume reference — the seam Package D uses to attach the durable
 * `sessionId`. Setting a new reference bumps the generation so leases captured against the previous
 * reference are stale, and marks the phase `active`. C5 stores the value verbatim; it never inspects
 * it.
 */
export function setPracticeResumeRef(ref: PracticeResumeRef | null): void {
  _generation += 1;
  _resumeRef = ref;
  _phase = 'active';
}
