// Board sound effects — move, capture, castles, check, checkmate.
// Adapted from lichess-org/lila: ui/site/src/sound.ts (AudioContext, buffer loading, move() logic)
//
// Sound priority per move: checkmate > check > castles > capture > move.
// The castles sound is triggered when SAN starts with 'O-O' (not present in Lichess standard
// set — extended here because Castles.mp3 exists in this project).
// All other sound selection logic mirrors lichess-org/lila: ui/site/src/sound.ts move().

const SOUND_ENABLED_KEY = 'boardSoundEnabled';
const SOUND_ENABLED_DEFAULT = true;

export let boardSoundEnabled: boolean = (() => {
  const stored = localStorage.getItem(SOUND_ENABLED_KEY);
  return stored === null ? SOUND_ENABLED_DEFAULT : stored === 'true';
})();

export function setBoardSoundEnabled(enabled: boolean): void {
  boardSoundEnabled = enabled;
  localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
}

// --- AudioContext + buffer loading ---
// Adapted from lichess-org/lila: ui/site/src/sound.ts makeAudioContext + Sound class

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let audioCtx: AudioContext | undefined;

function getAudioCtx(): AudioContext | undefined {
  if (audioCtx) return audioCtx;
  try {
    const win = window as WebkitWindow;
    audioCtx = typeof AudioContext !== 'undefined'
      ? new AudioContext({ latencyHint: 'interactive' })
      : win.webkitAudioContext
        ? new win.webkitAudioContext({ latencyHint: 'interactive' })
        : undefined;
  } catch {
    audioCtx = undefined;
  }
  return audioCtx;
}

// Resume suspended AudioContext on first user interaction (browser autoplay policy).
// Mirrors lichess-org/lila: ui/site/src/sound.ts primer pattern.
function attachPrimer(): void {
  const primerEvents = ['touchend', 'pointerup', 'pointerdown', 'mousedown', 'keydown'] as const;
  const primer = () => {
    audioCtx?.resume();
    for (const e of primerEvents) window.removeEventListener(e, primer, { capture: true });
  };
  for (const e of primerEvents) window.addEventListener(e, primer, { capture: true });
}

const buffers = new Map<string, AudioBuffer>();

async function loadBuffer(name: string, path: string): Promise<void> {
  const c = getAudioCtx();
  if (!c) return;
  try {
    const res = await fetch(path);
    if (!res.ok) return;
    const arrayBuf = await res.arrayBuffer();
    // decodeAudioData has both a Promise form (length === 1) and callback form.
    // Mirrors lichess-org/lila: ui/site/src/sound.ts load() decodeAudioData branch.
    const audioBuf = await new Promise<AudioBuffer>((resolve, reject) => {
      if (c.decodeAudioData.length === 1)
        c.decodeAudioData(arrayBuf).then(resolve).catch(reject);
      else
        c.decodeAudioData(arrayBuf, resolve, reject);
    });
    buffers.set(name, audioBuf);
  } catch {
    // Silent: missing or undecodable audio must not break board interaction.
  }
}

function playBuffer(name: string): void {
  const c = getAudioCtx();
  const buf = buffers.get(name);
  if (!c || !buf) return;
  if (c.state === 'suspended') {
    // Resume and bail — the next move will play successfully after the context unblocks.
    void c.resume();
    return;
  }
  try {
    const gain = c.createGain();
    gain.connect(c.destination);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(0);
  } catch {
    // Ignore individual playback errors.
  }
}

// --- Public API ---

const SOUND_FILES: Record<string, string> = {
  Move:      '/sounds/Move.mp3',
  Capture:   '/sounds/Capture.mp3',
  Castles:   '/sounds/Castles.mp3',
  Check:     '/sounds/Check.mp3',
  Checkmate: '/sounds/Checkmate.mp3',
};

/**
 * Preload all board sounds into AudioBuffers and attach the AudioContext primer.
 * Call once at app startup before the first user interaction.
 * Mirrors lichess-org/lila: ui/site/src/sound.ts preloadBoardSounds()
 */
export function preloadBoardSounds(): void {
  attachPrimer();
  for (const [name, path] of Object.entries(SOUND_FILES)) {
    void loadBuffer(name, path);
  }
}

/**
 * Play the appropriate board sound for a move given its SAN.
 * Only plays when the sound toggle is enabled.
 *
 * Priority: checkmate > check > castles > capture > move.
 * Mirrors lichess-org/lila: ui/site/src/sound.ts move() SAN inspection logic.
 * Castles detection added for Castles.mp3 (O-O / O-O-O SAN prefix).
 */
export function playMoveSound(san: string | undefined): void {
  if (!boardSoundEnabled || !san) return;
  let name: string;
  if (san.includes('#'))         name = 'Checkmate';
  else if (san.includes('+'))    name = 'Check';
  else if (san.startsWith('O-O')) name = 'Castles';
  else if (san.includes('x'))    name = 'Capture';
  else                            name = 'Move';
  playBuffer(name);
}
