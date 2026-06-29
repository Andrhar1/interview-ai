/**
 * Tiny fetch wrapper around the backend REST API.
 *
 * - Access token is held in memory (set by AuthContext) and sent as a Bearer
 *   header. The refresh token lives in an httpOnly cookie the browser sends
 *   automatically (credentials: 'include').
 * - On a 401, it transparently tries POST /auth/refresh once, then retries.
 */

let accessToken: string | null = null;
let onAuthCleared: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setOnAuthCleared(fn: () => void) {
  onAuthCleared = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

interface RawError {
  error?: string;
  details?: Record<string, string[]>;
}

async function rawRequest(path: string, options: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
}

async function parseError(res: Response): Promise<never> {
  let body: RawError = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retryOn401 = true,
): Promise<T> {
  let res = await rawRequest(path, options);

  // Try a silent refresh once on 401 (skip for the auth endpoints themselves).
  if (res.status === 401 && retryOn401 && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawRequest(path, options);
    }
  }

  if (!res.ok) return parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await rawRequest('/auth/refresh', { method: 'POST' });
    if (!res.ok) throw new Error('refresh failed');
    const data = (await res.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch {
    accessToken = null;
    onAuthCleared?.();
    return false;
  }
}
