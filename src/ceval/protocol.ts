// UCI protocol wrapper for browser-side Stockfish
// Adapted from lichess-org/lila: ui/lib/src/ceval/protocol.ts
//
// Minimal subset: handshake, position, go, stop.
// No Work queue, no MultiPV, no eval accumulation yet (those come in task 7.3+).

export type LineCallback = (line: string) => void;

export class StockfishProtocol {
  private worker: Worker | undefined;
  private onLine: LineCallback | undefined;

  /** Human-readable engine name received from the "id name" response. */
  engineName: string | undefined;

  /**
   * Spin up the worker and begin the UCI handshake.
   * workerUrl points to the Stockfish JS file served as a static asset.
   * Mirrors lichess-org/lila: ui/lib/src/ceval/engines/simpleEngine.ts (start)
   */
  init(workerUrl: string): void {
    this.worker = new Worker(workerUrl);
    this.worker.addEventListener('message', (e: MessageEvent<string>) => this.received(e.data));
    this.worker.addEventListener('error', (e: ErrorEvent) => {
      console.error('[ceval] worker error — url:', workerUrl, '| message:', e.message || '(none)', '| file:', e.filename || '(none)', '| line:', e.lineno);
    });
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
   * Start a fixed-depth search on the current position.
   * multiPv controls how many candidate lines the engine returns (UCI MultiPV option).
   * Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts swapWork go command.
   */
  go(depth: number, multiPv = 1): void {
    this.send(`setoption name MultiPV value ${multiPv}`);
    this.send(`go depth ${depth}`);
  }

  /** Interrupt a running search. */
  stop(): void {
    this.send('stop');
  }

  /** Shut down the engine and terminate the worker. */
  destroy(): void {
    this.send('quit');
    this.worker?.terminate();
    this.worker = undefined;
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
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
      // Analysis mode: disable contempt, enable Chess960 notation.
      // Mirrors lichess-org/lila: ui/lib/src/ceval/protocol.ts connected/received
      this.send('setoption name UCI_AnalyseMode value true');

      // Use all available cores minus one (keep one free for the UI thread).
      // Mirrors lichess-org/lila: ui/lib/src/ceval/ctrl.ts recommendedThreads.
      // Falls back to 1 if hardwareConcurrency is unavailable.
      const cores   = navigator.hardwareConcurrency ?? 2;
      const threads = Math.max(1, cores - 1);
      this.send(`setoption name Threads value ${threads}`);

      // 256 MB hash table — large enough to avoid evictions at depth 22.
      // Lichess default is 16 MB; 256 MB is appropriate for a single-user dev machine.
      this.send('setoption name Hash value 256');

      this.send('ucinewgame');
      this.send('isready');
    }

    this.onLine?.(line);
  }
}
