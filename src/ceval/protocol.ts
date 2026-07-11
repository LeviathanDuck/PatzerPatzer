// UCI protocol wrapper using @lichess-org/stockfish-web
// Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts
//                            and ui/lib/src/ceval/protocol.ts

import type { EngineStrengthConfig } from '../engine/types';
import { record, Severity } from '../diagnostics';
import { uciPositionCommand, type EnginePositionContext } from '../engine/positionContext';
//
// Key change from the previous Worker-based approach:
// stockfish-web runs in the MAIN THREAD — no new Worker() needed.
// Emscripten manages its own pthreads internally via SharedArrayBuffer,
// giving true multi-core parallelism without the Worker message-passing
// overhead that caused the recursion crash with the old multi-threaded build.

export type LineCallback = (line: string) => void;

export interface ProtocolConfig {
  threads?: number; // if omitted: Math.max(1, navigator.hardwareConcurrency - 1)
  hash?:    number; // if omitted: 256







  initTimeoutMs?: number;
}

/** Emscripten module factory shape returned by the Stockfish web build's default export. */
type StockfishModuleFactory = (opts: {
  wasmMemory: WebAssembly.Memory;
  locateFile: (file: string) => string;
  mainScriptUrlOrBlob: string;
}) => Promise<StockfishWebModule>;

/** Minimal Response surface init() consumes from fetch — keeps injected fakes light. */
interface InitFetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}







export interface ProtocolInitDependencies {
  importModule?: (scriptUrl: string) => Promise<{ default: StockfishModuleFactory }>;
  fetch?: (input: string, init?: { signal?: AbortSignal }) => Promise<InitFetchResponse>;
  setTimeout?: (handler: () => void, timeoutMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

type ResolvedInitDependencies = Required<ProtocolInitDependencies>;

/** Thrown when an opt-in init handshake exceeds its configured timeout budget. */
export class EngineInitTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Stockfish init exceeded ${timeoutMs}ms`);
    this.name = 'EngineInitTimeoutError';
  }
}

export interface EngineDeviceCapabilityMetadata {
  deviceMemory: number | null;
  hardwareConcurrency: number | null;
}

type EnginePhase = 'running' | 'idle' | 'analyzing';

// Local interface — matches @lichess-org/stockfish-web's StockfishWeb interface.
// Declared here to avoid a static bundle import of the package.
interface StockfishWebModule {
  uci(command: string): void;
  listen: (data: string) => void;
  onError: (msg: string) => void;
  getRecommendedNnue(index?: number): string | undefined;
  setNnueBuffer(data: Uint8Array, index?: number): void;
}

/**
 * Create a SharedArrayBuffer-backed WebAssembly.Memory, shrinking the max
 * gracefully until the allocation succeeds.
 * Adapted from lichess-org/lila: ui/lib/src/ceval/util.ts sharedWasmMemory
 */
function sharedWasmMemory(lo: number, hi = 32767): WebAssembly.Memory {
  let shrink = 4;
  for (;;) {
    try {
      return new WebAssembly.Memory({ shared: true, initial: lo, maximum: hi });
    } catch (e) {
      if (hi <= lo || !(e instanceof RangeError)) throw e;
      hi = Math.max(lo, Math.ceil(hi - hi / shrink));
      shrink = shrink === 4 ? 3 : 4;
    }
  }
}

function diagnosticErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function classifyModuleInitFailure(error: unknown): 'wasm-unavailable' | 'worker-create-failed' {
  if (error instanceof RangeError || error instanceof WebAssembly.CompileError || error instanceof WebAssembly.LinkError || error instanceof WebAssembly.RuntimeError) {
    return 'wasm-unavailable';
  }

  return 'worker-create-failed';
}

function classifyRuntimeErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (!normalized.trim()) return 'unknown';
  if (normalized.includes('out of memory') || normalized.includes('oom') || normalized.includes('memory')) return 'out-of-memory';
  if (normalized.includes('wasm') || normalized.includes('trap') || normalized.includes('runtimeerror')) return 'wasm-runtime';
  if (normalized.includes('terminated') || normalized.includes('killed') || normalized.includes('aborted')) return 'worker-terminated';
  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('load')) return 'asset-load';
  return 'runtime-error';
}

export class StockfishProtocol {
  private module: StockfishWebModule | undefined;
  private onLine: LineCallback | undefined;
  private _initStartedAt: number | undefined;
  private _enginePhase: EnginePhase = 'idle';





  private _searchGeneration = 0;
  private _positionContext: EnginePositionContext | null = null;

  // Device capability snapshot — read once at engine-start for error correlation.
  // navigator.deviceMemory is not universally supported (Chromium-only); cast through
  // unknown to avoid a TypeScript strict-mode error on the non-standard property.
  private _deviceMemory: number | undefined = undefined;
  private _hardwareConcurrency: number | undefined = undefined;





  private _initInFlight: Promise<void> | undefined;
  private _initGeneration = 0;
  private _initTerminated = false;
  private _initTerminationError: EngineInitTimeoutError | undefined;
  private readonly _initDeps: ResolvedInitDependencies;

  constructor(private config: ProtocolConfig = {}, deps: ProtocolInitDependencies = {}) {
    this._initDeps = {
      // Variable URL: esbuild leaves this dynamic import as a runtime import, unbundled.
      importModule: deps.importModule ?? ((scriptUrl: string) =>
        import(scriptUrl) as Promise<{ default: StockfishModuleFactory }>),
      fetch:        deps.fetch        ?? ((input, init) => fetch(input, init)),
      setTimeout:   deps.setTimeout   ?? ((handler, ms) => setTimeout(handler, ms)),
      clearTimeout: deps.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    };
  }

  /** Human-readable engine name received from the "id name" response. */
  engineName: string | undefined;

  /**
   * Optional callback invoked when the engine reports an internal error
   * (e.g. corrupt NNUE data). Set by the queue layer to propagate failures
   * into the module-level failed state instead of only logging to the console.
   */
  onEngineError: ((msg: string) => void) | undefined;

  /** Cached engine-start device context for engine-error diagnostics only. */
  deviceCapabilityMetadata(): EngineDeviceCapabilityMetadata {
    return {
      deviceMemory: this._deviceMemory ?? null,
      hardwareConcurrency: this._hardwareConcurrency ?? null,
    };
  }

  private recordInitFailure(failureReason: 'worker-create-failed' | 'init-timeout' | 'wasm-unavailable', error: unknown): void {
    const startedAt = this._initStartedAt ?? Date.now();
    const initDuration = Date.now() - startedAt;
    record({
      kind: 'engine',
      severity: Severity.Error,
      source: 'ceval.protocol',
      sourceTag: 'engine',
      message: 'Stockfish init failed',
      metadata: {
        failureReason,
        initDuration,
        errorName: diagnosticErrorName(error),
        ...this.deviceCapabilityMetadata(),
      },
      redactionClass: 'safe',
    });
  }

  /**
   * Load Stockfish 18 (smallnet) from baseUrl and begin the UCI handshake.
   * baseUrl is the URL prefix where sf_18_smallnet.{js,wasm} and the NNUE
   * file are served (e.g. "/stockfish-web").
   *
   * Uses dynamic import() — esbuild leaves variable-string imports as-is and
   * does not try to bundle them, so the engine JS is loaded at runtime only.
   *
   * Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts boot()
   */
  async init(baseUrl: string): Promise<void> {



    if (this._initTerminated) {
      return Promise.reject(this._initTerminationError ?? new EngineInitTimeoutError(this.config.initTimeoutMs ?? 0));
    }


    if (this._initInFlight) return this._initInFlight;
    const run = this._runInit(baseUrl);
    this._initInFlight = run;
    try {
      await run;
    } finally {
      if (this._initInFlight === run) this._initInFlight = undefined;
    }
  }

  /**
   * Load Stockfish 18 (smallnet) from baseUrl and begin the UCI handshake.
   *
   * When config.initTimeoutMs is unset (the live analysis engine) this runs exactly the original
   * import → sharedWasmMemory → makeModule → NNUE fetch → `uci` sequence with no added timeout,
   * abort, or attempt-token machinery. When set (the background review engine) each pending await
   * is bounded, the NNUE fetch/body reads are abortable, every non-abortable await is followed by
   * an attempt-invalidation check, a late-completing module from an expired attempt is quit and
   * never wired, and no `uci`/`readyok` is emitted from an expired attempt.
   *
   * Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts boot()
   */
  private async _runInit(baseUrl: string): Promise<void> {
    const scriptUrl = `${baseUrl}/sf_18_smallnet.js`;
    const deps = this._initDeps;
    const timeoutMs = this.config.initTimeoutMs;
    const timeoutEnabled = timeoutMs !== undefined;

    // Snapshot device capability at engine-start for error correlation.
    // navigator.deviceMemory is a Chromium extension not in the standard TS lib — access via cast.
    this._hardwareConcurrency = navigator.hardwareConcurrency;
    this._deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    this._initStartedAt = Date.now();

    // Attempt token + timeout race (inert unless opted in).
    const attempt = ++this._initGeneration;
    const attemptExpired = (): boolean => this._initGeneration !== attempt;
    const abortController = new AbortController();
    let timeoutHandle: unknown;
    let timeoutPromise: Promise<never> | undefined;
    let createdModule: StockfishWebModule | undefined;

    if (timeoutEnabled) {
      timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = deps.setTimeout(() => {
          // Invalidate the attempt, reject the awaiter with a typed timeout, THEN abort the
          // in-flight fetch/body read as cleanup. Rejecting before aborting keeps the timeout
          // error the deterministic race winner.
          this._initGeneration++;
          reject(new EngineInitTimeoutError(timeoutMs));
          abortController.abort();
        }, timeoutMs);
      });
    }
    const clearInitTimeout = (): void => {
      if (timeoutHandle !== undefined) {
        deps.clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    };
    const raceInit = <T>(p: Promise<T>): Promise<T> => (timeoutPromise ? Promise.race([p, timeoutPromise]) : p);
    const failExpired = (): never => {
      // A post-await expiry the race did not surface directly (underlying settled the same tick).
      const err = new EngineInitTimeoutError(timeoutMs ?? 0);
      this.recordInitFailure('init-timeout', err);
      throw err;
    };

    try {
      // 1. Dynamic import of the Emscripten module factory (non-abortable await).
      let makeModule: StockfishModuleFactory;
      try {
        ({ default: makeModule } = await raceInit(deps.importModule(scriptUrl)));
      } catch (e) {
        throw this._recordInitAwaitError(e, 'worker-create-failed');
      }
      // Post-await invalidation: a factory that arrived after the attempt expired is discarded
      // (no module instance exists yet, nothing to quit).
      if (attemptExpired()) failExpired();

      // 2. Shared WASM memory. minMem=1536 pages (96 MB) matches Lichess's sf_18_smallnet config;
      //    sharedWasmMemory retries with a smaller max if the initial alloc fails.
      //    Adapted from lichess-org/lila: ui/lib/src/ceval/util.ts
      let wasmMemory: WebAssembly.Memory;
      try {
        wasmMemory = sharedWasmMemory(1536);
      } catch (e) {
        this.recordInitFailure('wasm-unavailable', e);
        throw e;
      }

      // 3. Module creation (non-abortable await). A module that resolves AFTER the attempt
      //    expired (timeout already fired and the awaiter moved on) must be quit and never wired.
      const modulePromise = makeModule({
        wasmMemory,
        // Tell Emscripten where to find the .wasm and any other assets it needs.
        locateFile: (file: string) => `${baseUrl}/${file}`,
        // Emscripten passes this URL to the pthreads workers it spawns, so each
        // thread can load the same Stockfish module.
        mainScriptUrlOrBlob: scriptUrl,
      });
      // Late-completion cleanup: if the awaiter already gave up (raceInit threw the timeout), the
      // module value is not observed by the race path — this trailing handler quits the orphan.
      void modulePromise.then(
        (mod) => { if (attemptExpired() && mod !== this.module) this._quitOrphanModule(mod); },
        () => { /* creation failure already surfaced via the awaited race below */ },
      );
      let module: StockfishWebModule;
      try {
        module = await raceInit(modulePromise);
      } catch (e) {
        throw this._recordInitAwaitError(e, classifyModuleInitFailure(e));
      }
      if (attemptExpired()) {
        this._quitOrphanModule(module);
        failExpired();
      }
      createdModule = module;
      this.module = module;

      // Init succeeded — log duration for observability.
      this._enginePhase = 'running';
      const initDurationMs = Date.now() - this._initStartedAt;
      console.log(`[ceval] Stockfish module ready in ${initDurationMs}ms`);
      record({
        kind: 'engine',
        severity: Severity.Info,
        source: 'ceval.protocol',
        sourceTag: 'engine',
        message: 'Stockfish module ready',
        metadata: { durationMs: initDurationMs },
        redactionClass: 'safe',
      });

      // Attach UCI output listener before sending any commands. The generation/identity guard
      // refuses lines from an expired or superseded attempt (inert on the live single-attempt
      // path where the generation never changes); this is what stops a late attempt's `readyok`
      // from resurrecting a run already marked failed.
      module.listen = (line: string) => {
        if (this._initGeneration !== attempt || this.module !== module) return;
        this.received(line);
      };

      // Error handler for corrupt NNUE data.
      // Mirrors lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts makeErrorHandler
      // Promoted into a real failure signal: callers may set onEngineError to be notified.
      // Logs a closed error class for post-init diagnostics without storing raw engine text.
      module.onError = (msg: string) => {
        if (this._initGeneration !== attempt || this.module !== module) return;
        console.error('[ceval] engine error:', msg);
        record({
          kind: 'engine',
          severity: Severity.Error,
          source: 'ceval.protocol',
          sourceTag: 'engine',
          message: 'Stockfish engine error',
          metadata: {
            errorMessageClass: classifyRuntimeErrorMessage(msg),
            enginePhase: this._enginePhase,
            ...this.deviceCapabilityMetadata(),
          },
          redactionClass: 'safe',
        });
        this.onEngineError?.(msg);
      };

      // 4. Fetch and load the NNUE evaluation network (abortable when opted in).
      // Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts boot()
      const nnueName = module.getRecommendedNnue(0);
      if (nnueName) {
        console.log('[ceval] loading NNUE:', nnueName);
        let resp: InitFetchResponse;
        try {
          resp = await raceInit(deps.fetch(`${baseUrl}/${nnueName}`, timeoutEnabled ? { signal: abortController.signal } : undefined));
        } catch (e) {
          if (e instanceof EngineInitTimeoutError) this.recordInitFailure('init-timeout', e);
          throw e;
        }
        if (attemptExpired()) failExpired();
        if (resp.ok) {
          let buffer: ArrayBuffer;
          try {
            buffer = await raceInit(resp.arrayBuffer());
          } catch (e) {
            if (e instanceof EngineInitTimeoutError) this.recordInitFailure('init-timeout', e);
            throw e;
          }
          if (attemptExpired()) failExpired();
          module.setNnueBuffer(new Uint8Array(buffer), 0);
          console.log('[ceval] NNUE loaded');
        } else {
          console.warn('[ceval] NNUE fetch failed:', resp.status, nnueName);
        }
      }

      // Begin UCI handshake.
      clearInitTimeout();
      this.send('uci');
    } catch (err) {
      clearInitTimeout();
      // Cleanup: quit a module created by this now-failed attempt so it cannot linger or emit a
      // late handshake. Its listen/onError closures are already generation-guarded above.
      if (createdModule) {
        this._quitOrphanModule(createdModule);
        if (this.module === createdModule) this.module = undefined;
      }
      this._enginePhase = 'idle';
      if (err instanceof EngineInitTimeoutError && timeoutEnabled) {
        this._initTerminated = true;
        this._initTerminationError = err;
      }
      throw err;
    }
  }

  /** Record the correct init-failure reason for an awaited step, then return the error to rethrow. */
  private _recordInitAwaitError(error: unknown, fallbackReason: 'worker-create-failed' | 'wasm-unavailable'): unknown {
    if (error instanceof EngineInitTimeoutError) {
      this.recordInitFailure('init-timeout', error);
      return error;
    }
    this.recordInitFailure(fallbackReason, error);
    return error;
  }

  /** Best-effort shutdown of an orphaned module from an expired/failed init attempt. */
  private _quitOrphanModule(module: StockfishWebModule): void {
    try {
      module.uci('quit');
    } catch {
      /* best effort — the module may already be dead */
    }
  }

  /** Register a callback that fires for every raw UCI line from the engine. */
  onMessage(cb: LineCallback): void {
    this.onLine = cb;
  }

  /**
   * Send a position to the engine.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts swapWork:
   * `position fen <initialFen> moves <uci...>`.
   */
  setPositionContext(context: EnginePositionContext): void {
    this._positionContext = context;
    this.send(uciPositionCommand(context));
  }

  /** Read-only context for the most recent position sent to this protocol instance. */
  currentPositionContext(): EnginePositionContext | null {
    return this._positionContext;
  }

  /** True only while this protocol instance has an active `go` search outstanding. */
  isAnalyzing(): boolean {
    return this._enginePhase === 'analyzing';
  }

  /**
   * Set a UCI option only when no search is active.
   * Mirrors Lichess protocol.swapWork option timing: options are changed before `go`,
   * never while a search is computing.
   */
  setOptionWhenIdle(name: string, value: string | number | boolean): boolean {
    if (!this.module || this._enginePhase === 'analyzing') return false;
    this.send(`setoption name ${name} value ${value}`);
    return true;
  }

  /**
   * Start a search on the current position.
   * Stops at whichever limit is hit first: depth or movetime (milliseconds).
   * Omit movetime to search to depth only.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts swapWork go command.
   */
  go(depth: number, multiPv = 1, movetime?: number): void {
    this.send(`setoption name MultiPV value ${multiPv}`);
    const timeClause = movetime !== undefined ? ` movetime ${movetime}` : '';
    this._searchGeneration++;
    this._enginePhase = 'analyzing';
    this.send(`go depth ${depth}${timeClause}`);
  }
















  stop(): void {
    const generationAtSend = this._searchGeneration;
    this.send('stop');
    if (this._searchGeneration === generationAtSend) this._enginePhase = 'idle';
  }






  setPlayStrength(config: EngineStrengthConfig): void {
    if (config.level < 8) {
      this.send('setoption name UCI_LimitStrength value true');
      this.send(`setoption name UCI_Elo value ${config.uciElo}`);
    } else {
      this.send('setoption name UCI_LimitStrength value false');
    }
    this.send('setoption name UCI_AnalyseMode value false');
    this.send('setoption name Analysis Contempt value Both');
  }

  /**
   * Restore engine to analysis mode (full strength, analyse contempt off).
   */
  setAnalysisMode(): void {
    this.send('setoption name UCI_LimitStrength value false');
    this.send('setoption name UCI_AnalyseMode value true');
    this.send('setoption name Analysis Contempt value Off');
  }

  /**
   * Start a single-PV search capped at the given depth, for play-mode move generation.
   */
  goPlay(depth: number): void {
    this.send('setoption name MultiPV value 1');
    this._searchGeneration++;
    this._enginePhase = 'analyzing';
    this.send(`go depth ${depth}`);
  }

  /** Shut down the engine. */
  destroy(): void {
    this.send('quit');
    this.module = undefined;
    this._enginePhase = 'idle';
  }

  private send(cmd: string): void {
    this.module?.uci(cmd);
  }

  /**
   * Handle a raw UCI line from the engine.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts received
   */
  private received(line: string): void {
    const parts = line.trim().split(/\s+/);

    if (parts[0] === 'id' && parts[1] === 'name') {
      this.engineName = parts.slice(2).join(' ');
    } else if (parts[0] === 'bestmove') {
      this._enginePhase = 'idle';
    } else if (parts[0] === 'uciok') {
      // Analysis mode + no contempt.
      // Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts connected()
      this.send('setoption name UCI_AnalyseMode value true');
      this.send('setoption name Analysis Contempt value Off');

      // Threads and hash are configurable so a background review engine can run
      // at Threads=1, Hash=32 without competing with the live analysis engine.
      // Mirrors lichess-org/lila: ui/lib/src/ceval/ctrl.ts recommendedThreads
      const cores   = navigator.hardwareConcurrency ?? 2;
      const threads = this.config.threads ?? Math.max(1, cores - 1);
      const hash    = this.config.hash    ?? 256;
      this.send(`setoption name Threads value ${threads}`);
      console.log(`[ceval] Stockfish 18 — ${threads} threads`);

      this.send(`setoption name Hash value ${hash}`);

      this.send('ucinewgame');
      this.send('isready');
    }

    this.onLine?.(line);
  }
}
