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

  // Device capability snapshot — read once at engine-start for error correlation.
  // navigator.deviceMemory is not universally supported (Chromium-only); cast through
  // unknown to avoid a TypeScript strict-mode error on the non-standard property.
  private _deviceMemory: number | undefined = undefined;
  private _hardwareConcurrency: number | undefined = undefined;

  constructor(private config: ProtocolConfig = {}) {}

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
    const scriptUrl = `${baseUrl}/sf_18_smallnet.js`;

    // Snapshot device capability at engine-start for error correlation.
    // Read once here; all error events below attach these cached values.
    // navigator.deviceMemory is a Chromium extension not in the standard TS lib —
    // access via cast. undefined is the correct value on unsupported browsers.
    this._hardwareConcurrency = navigator.hardwareConcurrency;
    this._deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;

    // Record init start timestamp for duration instrumentation.
    this._initStartedAt = Date.now();

    let makeModule: (opts: {
      wasmMemory: WebAssembly.Memory;
      locateFile: (file: string) => string;
      mainScriptUrlOrBlob: string;
    }) => Promise<StockfishWebModule>;

    // Dynamic import of the Emscripten module factory.
    // The variable URL prevents esbuild from bundling this into main.js.
    try {
      ({ default: makeModule } = await import(scriptUrl) as {
        default: (opts: {
          wasmMemory: WebAssembly.Memory;
          locateFile: (file: string) => string;
          mainScriptUrlOrBlob: string;
        }) => Promise<StockfishWebModule>;
      });
    } catch (e) {
      this.recordInitFailure('worker-create-failed', e);
      throw e;
    }

    // minMem=1536 pages (96 MB) matches Lichess's sf_18_smallnet config.
    // sharedWasmMemory retries with a smaller max if the initial alloc fails.
    // Adapted from lichess-org/lila: ui/lib/src/ceval/util.ts
    let wasmMemory: WebAssembly.Memory;
    try {
      wasmMemory = sharedWasmMemory(1536);
    } catch (e) {
      this.recordInitFailure('wasm-unavailable', e);
      throw e;
    }

    try {
      this.module = await makeModule({
        wasmMemory,
        // Tell Emscripten where to find the .wasm and any other assets it needs.
        locateFile: (file: string) => `${baseUrl}/${file}`,
        // Emscripten passes this URL to the pthreads workers it spawns, so each
        // thread can load the same Stockfish module.
        mainScriptUrlOrBlob: scriptUrl,
      });
    } catch (e) {
      this.recordInitFailure(classifyModuleInitFailure(e), e);
      throw e;
    }

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

    // Attach UCI output listener before sending any commands.
    this.module.listen = (line: string) => this.received(line);

    // Error handler for corrupt NNUE data.
    // Mirrors lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts makeErrorHandler
    // Promoted into a real failure signal: callers may set onEngineError to be notified.
    // Logs a closed error class for post-init diagnostics without storing raw engine text.
    this.module.onError = (msg: string) => {
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

    // Fetch and load the NNUE evaluation network.
    // Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts boot()
    const nnueName = this.module.getRecommendedNnue(0);
    if (nnueName) {
      console.log('[ceval] loading NNUE:', nnueName);
      const resp = await fetch(`${baseUrl}/${nnueName}`);
      if (resp.ok) {
        this.module.setNnueBuffer(new Uint8Array(await resp.arrayBuffer()), 0);
        console.log('[ceval] NNUE loaded');
      } else {
        console.warn('[ceval] NNUE fetch failed:', resp.status, nnueName);
      }
    }

    // Begin UCI handshake.
    this.send('uci');
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
    this.send(uciPositionCommand(context));
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
    this._enginePhase = 'analyzing';
    this.send(`go depth ${depth}${timeClause}`);
  }

  /** Interrupt a running search. */
  stop(): void {
    this.send('stop');
    this._enginePhase = 'idle';
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
