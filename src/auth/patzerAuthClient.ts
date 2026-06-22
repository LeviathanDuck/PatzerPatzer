import { record, Severity } from '../diagnostics';

const PATZER_AUTH_BASE = '/api/patzer-auth';

export interface MagicLinkRequestResult {
  status: boolean;
  devMagicLink?: {
    email:     string;
    url:       string;
    createdAt: string;
  } | null;
}

function callbackURL(): string {
  return window.location.pathname || '/';
}

function errorClass(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function authFailureClass(status: number | undefined, error?: unknown): string {
  if (error !== undefined && status === undefined) return 'network-error';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'auth-rejected';
  if (status !== undefined && status >= 500) return 'server-error';
  if (status !== undefined && status >= 400) return 'auth-rejected';
  return 'unknown';
}

function recordPatzerAuthFailure(
  endpointClass: string,
  startedAt: number,
  status: number | undefined,
  error?: unknown,
): void {
  record({
    kind: 'api',
    severity: Severity.Error,
    source: 'auth/patzerAuthClient',
    sourceTag: 'auth',
    message: `${endpointClass} failed`,
    metadata: {
      provider: 'patzer',
      endpointClass,
      httpStatus: status ?? null,
      latencyMs: Date.now() - startedAt,
      failureClass: authFailureClass(status, error),
      ...(error !== undefined ? { errorClass: errorClass(error) } : {}),
    },
    redactionClass: 'safe',
  });
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function requestPatzerMagicLink(email: string): Promise<MagicLinkRequestResult> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) throw new Error('Enter an email address.');

  const magicLinkStart = Date.now();
  let res: Response;
  try {
    res = await fetch(`${PATZER_AUTH_BASE}/sign-in/magic-link`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        callbackURL: callbackURL(),
        errorCallbackURL: callbackURL(),
      }),
    });
  } catch (error) {
    recordPatzerAuthFailure('patzer-magic-link', magicLinkStart, undefined, error);
    throw error;
  }

  if (!res.ok) {
    recordPatzerAuthFailure('patzer-magic-link', magicLinkStart, res.status);
    let message = `Magic-link request failed: ${res.status}`;
    try {
      const body = await readJson<{ message?: string; error?: string }>(res);
      message = body.message || body.error || message;
    } catch { /* keep status message */ }
    throw new Error(message);
  }

  let requestBody: { status?: boolean };
  try {
    requestBody = await readJson<{ status?: boolean }>(res);
  } catch {
    throw new Error('Patzer auth server is not available at this URL.');
  }
  if (requestBody.status !== true) throw new Error('Magic-link request did not return a valid auth response.');

  let devMagicLink: MagicLinkRequestResult['devMagicLink'] = null;
  try {
    const devRes = await fetch(`${PATZER_AUTH_BASE}/dev/last-magic-link`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (devRes.ok) {
      const body = await readJson<{ magicLink?: MagicLinkRequestResult['devMagicLink'] }>(devRes);
      if (body.magicLink?.email?.toLowerCase() === normalizedEmail.toLowerCase()) {
        devMagicLink = body.magicLink;
      }
    }
  } catch { /* production deployments should not expose this endpoint */ }

  return { status: true, devMagicLink };
}
