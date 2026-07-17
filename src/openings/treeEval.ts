import {
  acquireTreeEvalLease,
  isBulkReviewActive,
  type TreeEvalEngineLease,
  type TreeEvalProtocolMessage,
  type TreeEvalSearchIdentity,
} from '../engine/reviewQueue';
import { evalWinChances } from '../engine/winchances';
import { fenOnlyPositionContext, normalizeEngineFen, type EnginePositionContext } from '../engine/positionContext';
import type { OpeningTreeNode } from './tree';

export interface TreeEvalEntry {
  cp?: number;
  mate?: number;
  depth: number;
  settled: boolean;
  /**
   * Mover-perspective win-chance swing as a fraction.
   * Example: 0.12 means the candidate move improved win chances by 12 percentage points.
   */
  swing?: number;
}

export type TreeEvalResult = Pick<TreeEvalEntry, 'cp' | 'mate'>;
export type TreeEvalPhase = 'idle' | 'waiting-for-engine' | 'evaluating' | 'refining';
export type TreeEvalWaitReason = 'observer' | 'bulk-review';

export interface TreeEvalStatus {
  enabled: boolean;
  phase: TreeEvalPhase;
  waitReason: TreeEvalWaitReason | null;
  inProgress: boolean;
}

interface TreeEvalRun {
  fen: string;
  position: EnginePositionContext;
  depth: number;
  lease: TreeEvalEngineLease | null;
  searchIdentity: TreeEvalSearchIdentity | null;
  latest: TreeEvalEntry | null;
  finished: boolean;
  commitOnFinish: boolean;
  settledOnCommit: boolean;
  redrawOnCommit: boolean;
  resolve: (result: TreeEvalEntry | null) => void;
}

interface TreeEvalPassOptions {
  onPass2Complete?: () => void;
  positionContextFor?: (target: OpeningTreeNode) => EnginePositionContext | undefined;
}

let treeEvalEnabled = false;
let redraw: () => void = () => {};
let redrawTimer: ReturnType<typeof setTimeout> | null = null;
let activeRun: TreeEvalRun | null = null;
let runSerial = 0;
let activeSweepSerial = 0;
let treeEvalPhase: TreeEvalPhase = 'idle';
let treeEvalWaitReason: TreeEvalWaitReason | null = null;

const treeEvalCache = new Map<string, TreeEvalEntry>();
const TREE_EVAL_REDRAW_THROTTLE_MS = 250;
const PASS_1_BATCH_SIZE = 5;
// Pass 1 is intentionally shallow: enough to populate rows quickly before later refinement.
const PASS_1_DEPTH_BY_THOROUGHNESS = {
  fast:     8,
  balanced: 10,
  deep:     12,
} as const;
// Pass 2 trades latency for stable row quality; balanced intentionally lands near depth 16.
const PASS_2_DEPTH_BY_THOROUGHNESS = {
  fast:     14,
  balanced: 16,
  deep:     20,
} as const;
const DEEPENING_DEPTH_STEP = 2;
const DEEPENING_ROUND_DELAY_MS = 2_500;
// Linger deepening is capped to prevent an idle opening tab from pinning the engine indefinitely.
const DEEPENING_MAX_DEPTH = 22;

type TreeEvalThoroughness = keyof typeof PASS_1_DEPTH_BY_THOROUGHNESS;

export function initTreeEval(deps: { redraw: () => void }): void {
  redraw = deps.redraw;
}

export function setTreeEvalEnabled(on: boolean): void {
  treeEvalEnabled = on;
  if (!on) cancelTreeEval();
  scheduleTreeEvalRedraw();
}

export function isTreeEvalEnabled(): boolean {
  return treeEvalEnabled;
}

export function getTreeEval(fen: string): TreeEvalEntry | undefined {
  return treeEvalCache.get(normalizeFenKey(fen));
}

export function getTreeEvalStatus(): TreeEvalStatus {
  return {
    enabled: treeEvalEnabled,
    phase: treeEvalPhase,
    waitReason: treeEvalWaitReason,
    inProgress: treeEvalEnabled && (treeEvalPhase === 'evaluating' || treeEvalPhase === 'refining'),
  };
}

export function clearTreeEvalCache(): void {
  treeEvalCache.clear();
  scheduleTreeEvalRedraw();
}

export function cancelTreeEval(): void {
  activeSweepSerial++;
  setTreeEvalPhase('idle');
  cancelActiveRun();
}

/** Preserve enabled user intent while the shared review engine is unavailable. */
export function waitForTreeEvalEngine(reason: TreeEvalWaitReason): void {
  if (treeEvalPhase === 'waiting-for-engine') {
    if (treeEvalWaitReason !== reason) {
      treeEvalWaitReason = reason;
      scheduleTreeEvalRedraw();
    }
    return;
  }
  activeSweepSerial++;
  cancelActiveRun();
  treeEvalWaitReason = reason;
  setTreeEvalPhase('waiting-for-engine');
}

export async function evaluateFen(fen: string, depth: number): Promise<TreeEvalResult | null> {
  const entry = await evaluateFenWithCacheMode(fen, depth, {
    commitOnFinish: true,
    settled: true,
    redrawOnCommit: true,
    position: fenOnlyPositionContext(fen, 'opening-tree-eval', 'standalone-evaluate-fen'),
  });
  return entry ? toResult(entry) : null;
}

export function startTreeEvalPass1(
  node: OpeningTreeNode,
  thoroughness: TreeEvalThoroughness,
  options: TreeEvalPassOptions = {},
): void {
  if (!treeEvalEnabled) return;
  cancelTreeEval();
  const sweepSerial = activeSweepSerial;
  const depth = PASS_1_DEPTH_BY_THOROUGHNESS[thoroughness];
  setTreeEvalPhase('evaluating');
  const targets = [node, ...node.children].filter(target => {
    const cached = treeEvalCache.get(normalizeFenKey(target.fen));
    return !cached || cached.depth < depth;
  });

  void (async () => {
    let completedInBatch = 0;
    let pendingRedraw = false;
    for (const target of targets) {
      if (!treeEvalEnabled || activeSweepSerial !== sweepSerial || isBulkReviewActive()) break;
      const result = await evaluateFenWithCacheMode(target.fen, depth, {
        commitOnFinish: true,
        settled: false,
        redrawOnCommit: false,
        position: options.positionContextFor?.(target) ?? fenOnlyPositionContext(target.fen, 'opening-tree-eval', 'opening-tree-pass1-no-unique-history'),
      });
      if (!result) break;
      completedInBatch++;
      pendingRedraw = true;
      if (completedInBatch >= PASS_1_BATCH_SIZE) {
        completedInBatch = 0;
        pendingRedraw = false;
        scheduleTreeEvalRedraw();
        await yieldToUi();
      }
    }
    if (pendingRedraw) scheduleTreeEvalRedraw();
    if (treeEvalEnabled && activeSweepSerial === sweepSerial && !isBulkReviewActive()) {
      setTreeEvalPhase('refining');
      const completed = await runTreeEvalPass2(node, thoroughness, sweepSerial, options.positionContextFor);
      if (treeEvalEnabled && activeSweepSerial === sweepSerial) {
        setTreeEvalPhase('idle');
        if (completed && !isBulkReviewActive()) options.onPass2Complete?.();
      }
    }
  })();
}

export function startTreeEvalDeepening(
  node: OpeningTreeNode,
  thoroughness: TreeEvalThoroughness,
  positionContextFor?: (target: OpeningTreeNode) => EnginePositionContext | undefined,
): void {
  if (!treeEvalEnabled) return;
  cancelTreeEval();
  const sweepSerial = activeSweepSerial;
  setTreeEvalPhase('refining');
  void (async () => {
    let depth = nextDeepeningDepth(node, thoroughness);
    while (depth !== null && isSweepCurrent(sweepSerial)) {
      const completed = await runTreeEvalRefinementRound(node, depth, sweepSerial, positionContextFor);
      if (!completed || !isSweepCurrent(sweepSerial)) break;
      if (!await waitForDeepeningDelay(sweepSerial)) break;
      depth = nextDeepeningDepth(node, thoroughness);
    }
    if (treeEvalEnabled && activeSweepSerial === sweepSerial) setTreeEvalPhase('idle');
  })();
}

async function evaluateFenWithCacheMode(
  fen: string,
  depth: number,
  options: { commitOnFinish: boolean; settled: boolean; redrawOnCommit: boolean; position: EnginePositionContext },
): Promise<TreeEvalEntry | null> {
  if (!treeEvalEnabled || isBulkReviewActive()) return null;
  const fenKey = normalizeFenKey(fen);
  const cached = treeEvalCache.get(fenKey);
  if (cached && cached.depth >= depth && (!options.settled || cached.settled)) return cached;

  cancelActiveRun();
  const serial = ++runSerial;

  return new Promise(resolve => {
    const run: TreeEvalRun = {
      fen: fenKey,
      position: options.position,
      depth,
      lease: null,
      searchIdentity: null,
      latest: null,
      finished: false,
      commitOnFinish: options.commitOnFinish,
      settledOnCommit: options.settled,
      redrawOnCommit: options.redrawOnCommit,
      resolve,
    };
    activeRun = run;

    void (async () => {
      const lease = await acquireTreeEvalLease({
        runToken: serial,
        expectedFen: run.fen,
        onSearchIssued: identity => { run.searchIdentity = identity; },
        onMessage: message => handleTreeEvalLine(run, message),
        onPreempt: () => finishRun(run, null, false),
      });
      if (run.finished || activeRun !== run || serial !== runSerial) {
        lease?.release();
        return;
      }
      if (!lease || !treeEvalEnabled || isBulkReviewActive()) {
        finishRun(run, null, false);
        return;
      }
      run.lease = lease;
      lease.setPositionContext(run.position);
      lease.go(depth, 1);
      if (!run.searchIdentity || run.searchIdentity.fen !== run.fen) {
        finishRun(run, null, true);
      }
    })();
  });
}

async function runTreeEvalPass2(
  node: OpeningTreeNode,
  thoroughness: TreeEvalThoroughness,
  sweepSerial: number,
  positionContextFor?: (target: OpeningTreeNode) => EnginePositionContext | undefined,
): Promise<boolean> {
  const depth = PASS_2_DEPTH_BY_THOROUGHNESS[thoroughness];
  return runTreeEvalRefinementRound(node, depth, sweepSerial, positionContextFor);
}

async function runTreeEvalRefinementRound(
  node: OpeningTreeNode,
  depth: number,
  sweepSerial: number,
  positionContextFor?: (target: OpeningTreeNode) => EnginePositionContext | undefined,
): Promise<boolean> {
  const baselineFen = normalizeFenKey(node.fen);
  const baseline = await evaluateRefinedEntry(baselineFen, depth, positionContextFor?.(node));
  if (!baseline || !isSweepCurrent(sweepSerial)) return false;
  treeEvalCache.set(baselineFen, { ...baseline, settled: true });
  scheduleTreeEvalRedraw();

  for (const child of node.children) {
    if (!isSweepCurrent(sweepSerial)) return false;
    const childFen = normalizeFenKey(child.fen);
    const cached = treeEvalCache.get(childFen);
    if (cached?.settled && cached.depth >= depth && cached.swing !== undefined) continue;
    const refined = await evaluateRefinedEntry(childFen, depth, positionContextFor?.(child));
    if (!refined || !isSweepCurrent(sweepSerial)) return false;
    const refinedWithSwing: TreeEvalEntry = {
      ...refined,
      settled: true,
    };
    const swing = computeMoverSwing(baseline, refined, node.fen);
    if (swing !== undefined) refinedWithSwing.swing = swing;
    treeEvalCache.set(childFen, refinedWithSwing);
    scheduleTreeEvalRedraw();
    await yieldToUi();
  }
  return true;
}

async function evaluateRefinedEntry(fen: string, depth: number, position?: EnginePositionContext): Promise<TreeEvalEntry | null> {
  return evaluateFenWithCacheMode(fen, depth, {
    commitOnFinish: false,
    settled: true,
    redrawOnCommit: false,
    position: position ?? fenOnlyPositionContext(fen, 'opening-tree-eval', 'opening-tree-refinement-no-unique-history'),
  });
}

function isSweepCurrent(sweepSerial: number): boolean {
  return treeEvalEnabled && activeSweepSerial === sweepSerial && !isBulkReviewActive();
}

function setTreeEvalPhase(phase: TreeEvalPhase): void {
  if (phase !== 'waiting-for-engine') treeEvalWaitReason = null;
  if (treeEvalPhase === phase) return;
  treeEvalPhase = phase;
  scheduleTreeEvalRedraw();
}

function computeMoverSwing(baseline: TreeEvalEntry, afterMove: TreeEvalEntry, currentFen: string): number | undefined {
  const baselineWc = evalWinChances(baseline);
  const afterWc = evalWinChances(afterMove);
  if (baselineWc === undefined || afterWc === undefined) return undefined;
  const moverSign = fenSideToMove(currentFen) === 'w' ? 1 : -1;
  return ((afterWc * moverSign) - (baselineWc * moverSign)) / 2;
}

function nextDeepeningDepth(node: OpeningTreeNode, thoroughness: TreeEvalThoroughness): number | null {
  const floor = PASS_2_DEPTH_BY_THOROUGHNESS[thoroughness];
  const shallowestCachedDepth = [node, ...node.children].reduce((minDepth, target) => {
    const cached = treeEvalCache.get(normalizeFenKey(target.fen));
    return Math.min(minDepth, cached?.depth ?? floor);
  }, Infinity);
  if (shallowestCachedDepth >= DEEPENING_MAX_DEPTH) return null;
  return Math.min(shallowestCachedDepth + DEEPENING_DEPTH_STEP, DEEPENING_MAX_DEPTH);
}

function cancelActiveRun(): void {
  finishRun(activeRun, null, true);
}

function yieldToUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function waitForDeepeningDelay(sweepSerial: number): Promise<boolean> {
  return new Promise(resolve => {
    setTimeout(() => resolve(isSweepCurrent(sweepSerial)), DEEPENING_ROUND_DELAY_MS);
  });
}

function normalizeFenKey(fen: string): string {
  return normalizeEngineFen(fen) ?? fen.trim().replace(/\s+/g, ' ');
}

function toResult(entry: TreeEvalEntry): TreeEvalResult {
  const result: TreeEvalResult = {};
  if (entry.cp !== undefined) result.cp = entry.cp;
  if (entry.mate !== undefined) result.mate = entry.mate;
  return result;
}

function finishRun(run: TreeEvalRun | null, result: TreeEvalEntry | null, stopEngine: boolean): void {
  if (!run || run.finished) return;
  run.finished = true;
  if (stopEngine) run.lease?.stop();
  run.lease?.release();
  if (activeRun === run) activeRun = null;
  if (result && (result.cp !== undefined || result.mate !== undefined)) {
    const settled: TreeEvalEntry = { ...result, settled: run.settledOnCommit };
    if (run.commitOnFinish) {
      treeEvalCache.set(run.fen, settled);
      if (run.redrawOnCommit) scheduleTreeEvalRedraw();
    }
    run.resolve(settled);
  } else {
    run.resolve(null);
  }
}

function treeEvalSearchIdentityMatches(
  expected: TreeEvalSearchIdentity | null,
  received: TreeEvalSearchIdentity,
): boolean {
  return expected !== null
    && expected.searchToken === received.searchToken
    && expected.leaseToken === received.leaseToken
    && expected.runToken === received.runToken
    && expected.fen === received.fen
    && expected.contextKey === received.contextKey;
}

function handleTreeEvalLine(run: TreeEvalRun, message: TreeEvalProtocolMessage): void {
  if (run.finished || activeRun !== run) return;
  if (!treeEvalSearchIdentityMatches(run.searchIdentity, message.search) || message.search.fen !== run.fen) return;
  const line = message.line;
  const parts = line.trim().split(/\s+/);
  if (parts[0] === 'info') {
    const parsed = parseTreeEvalInfo(parts, run.fen);
    if (!parsed) return;
    run.latest = parsed;
  } else if (parts[0] === 'bestmove') {
    const latest = run.latest;
    finishRun(run, latest && latest.depth >= 0 ? latest : null, false);
  }
}

function parseTreeEvalInfo(parts: string[], fen: string): TreeEvalEntry | null {
  let isMate = false;
  let score: number | undefined;
  let depth: number | undefined;
  let pvIndex = 1;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === 'multipv') {
      const next = parts[i + 1];
      if (next === undefined) break;
      pvIndex = parseInt(next, 10);
      i++;
    } else if (parts[i] === 'depth') {
      const next = parts[i + 1];
      if (next === undefined) break;
      depth = parseInt(next, 10);
      i++;
    } else if (parts[i] === 'score') {
      const scoreType = parts[i + 1];
      const scoreValue = parts[i + 2];
      if (scoreType === undefined || scoreValue === undefined) break;
      isMate = scoreType === 'mate';
      score = parseInt(scoreValue, 10);
      i += 2;
      if (parts[i + 1] === 'lowerbound' || parts[i + 1] === 'upperbound') i++;
    }
  }
  if (pvIndex !== 1 || score === undefined || depth === undefined) return null;
  const whitePerspectiveScore = fenSideToMove(fen) === 'b' ? -score : score;
  const entry: TreeEvalEntry = {
    depth,
    settled: false,
  };
  if (isMate) entry.mate = whitePerspectiveScore;
  else entry.cp = whitePerspectiveScore;
  return entry;
}

function fenSideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

function scheduleTreeEvalRedraw(): void {
  if (redrawTimer !== null) return;
  redrawTimer = setTimeout(() => {
    redrawTimer = null;
    redraw();
  }, TREE_EVAL_REDRAW_THROTTLE_MS);
}
