// UCI protocol wrapper using @lichess-org/stockfish-web
// Adapted from lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts
//                            and ui/lib/src/ceval/protocol.ts

import type { EngineStrengthConfig } from '../engine/types';
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

export class StockfishProtocol {
  private module: StockfishWebModule | undefined;
  private onLine: LineCallback | undefined;

  constructor(private config: ProtocolConfig = {}) {}

  /** Human-readable engine name received from the "id name" response. */
  engineName: string | undefined;

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

    // Dynamic import of the Emscripten module factory.
    // The variable URL prevents esbuild from bundling this into main.js.
    const { default: makeModule } = await import(scriptUrl) as {
      default: (opts: {
        wasmMemory: WebAssembly.Memory;
        locateFile: (file: string) => string;
        mainScriptUrlOrBlob: string;
      }) => Promise<StockfishWebModule>;
    };

    // minMem=1536 pages (96 MB) matches Lichess's sf_18_smallnet config.
    // sharedWasmMemory retries with a smaller max if the initial alloc fails.
    // Adapted from lichess-org/lila: ui/lib/src/ceval/util.ts
    const wasmMemory = sharedWasmMemory(1536);

    this.module = await makeModule({
      wasmMemory,
      // Tell Emscripten where to find the .wasm and any other assets it needs.
      locateFile: (file: string) => `${baseUrl}/${file}`,
      // Emscripten passes this URL to the pthreads workers it spawns, so each
      // thread can load the same Stockfish module.
      mainScriptUrlOrBlob: scriptUrl,
    });

    // Attach UCI output listener before sending any commands.
    this.module.listen = (line: string) => this.received(line);

    // Error handler for corrupt NNUE data.
    // Mirrors lichess-org/lila: ui/lib/src/ceval/engines/stockfishWebEngine.ts makeErrorHandler
    this.module.onError = (msg: string) => {
      console.error('[ceval] engine error:', msg);
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
   * Send a FEN position to the engine.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts swapWork position command.
   */
  setPosition(fen: string): void {
    this.send(`position fen ${fen}`);
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
    this.send(`go depth ${depth}${timeClause}`);
  }

  /** Interrupt a running search. */
  stop(): void {
    this.send('stop');
  }

  /**
   * Configure engine for play mode at the given strength level.
   * Levels 1–7 enable UCI_LimitStrength + UCI_Elo; level 8 disables it.
   * Adapted from sprint plan: docs/mini-sprints/ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md
   */
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
    this.send(`go depth ${depth}`);
  }

  /** Shut down the engine. */
  destroy(): void {
    this.send('quit');
    this.module = undefined;
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
