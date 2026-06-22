function randomHexSegment(): string {
  return Math.random().toString(16).slice(2);
}

function fallbackId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomHexSegment()}-${randomHexSegment()}`;
}

function randomId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }

  return fallbackId(prefix);
}

const sessionId = randomId('session');

export function getSessionId(): string {
  return sessionId;
}

export function newEventId(): string {
  return randomId('event');
}
