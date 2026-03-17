// Stockfish Web Worker entry point
// Adapted from lichess-org/lila: ui/lib/src/ceval/engines/simpleEngine.ts
//
// This worker is loaded by the main thread via:
//   new Worker('/js/stockfish-worker.js')
//
// The worker bridges the main thread and the Stockfish engine.
// UCI protocol integration is implemented in task 7.2.
// Stockfish engine loading is implemented in task 7.2.

self.onmessage = (_e: MessageEvent) => {
  // UCI message forwarding is implemented in task 7.2
};

// Signal to the main thread that the worker script loaded successfully
self.postMessage({ type: 'ready' });
