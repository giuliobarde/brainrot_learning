import { getApiBaseUrl, secureStorage } from './secureStorage';

const ACCESS_KEY = 'brainrot.accessToken';
const REFRESH_KEY = 'brainrot.refreshToken';

export interface ApiTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

async function readTokens(): Promise<ApiTokens | null> {
  const [access, refresh] = await Promise.all([
    secureStorage.get(ACCESS_KEY),
    secureStorage.get(REFRESH_KEY),
  ]);
  if (!access || !refresh) return null;
  return { accessToken: access, refreshToken: refresh, expiresInSeconds: 0 };
}

async function writeTokens(tokens: ApiTokens): Promise<void> {
  await Promise.all([
    secureStorage.set(ACCESS_KEY, tokens.accessToken),
    secureStorage.set(REFRESH_KEY, tokens.refreshToken),
  ]);
}

async function clearTokens(): Promise<void> {
  await Promise.all([secureStorage.remove(ACCESS_KEY), secureStorage.remove(REFRESH_KEY)]);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  retried?: boolean;
}

async function rawRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false } = opts;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) {
    const tokens = await readTokens();
    if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text.length > 0 ? (JSON.parse(text) as { data?: T; error?: ApiErrorBody }) : {};

  if (!res.ok) {
    const err = json.error ?? { code: 'unknown', message: `request failed (${res.status})` };
    if (res.status === 401 && auth && !opts.retried) {
      const refreshed = await tryRefresh();
      if (refreshed) return rawRequest<T>(path, { ...opts, retried: true });
    }
    throw new ApiError(res.status, err);
  }
  return json.data as T;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const tokens = await readTokens();
    if (!tokens) return false;
    try {
      const data = await rawRequest<{ user: ApiUser; tokens: ApiTokens }>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: tokens.refreshToken },
      });
      await writeTokens(data.tokens);
      return true;
    } catch {
      await clearTokens();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export const api = {
  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ user: ApiUser; tokens: ApiTokens }> {
    const data = await rawRequest<{ user: ApiUser; tokens: ApiTokens }>('/auth/register', {
      method: 'POST',
      body: input,
    });
    await writeTokens(data.tokens);
    return data;
  },
  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: ApiUser; tokens: ApiTokens }> {
    const data = await rawRequest<{ user: ApiUser; tokens: ApiTokens }>('/auth/login', {
      method: 'POST',
      body: input,
    });
    await writeTokens(data.tokens);
    return data;
  },
  async logout(): Promise<void> {
    const tokens = await readTokens();
    try {
      if (tokens) {
        await rawRequest<void>('/auth/logout', {
          method: 'POST',
          body: { refreshToken: tokens.refreshToken },
        });
      }
    } catch {
      // best-effort: clear locally even if revoke fails
    } finally {
      await clearTokens();
    }
  },
  async me(): Promise<ApiUser> {
    const data = await rawRequest<{ user: ApiUser }>('/auth/me', { auth: true });
    return data.user;
  },
  async hasStoredSession(): Promise<boolean> {
    return (await readTokens()) !== null;
  },
  async clearLocalSession(): Promise<void> {
    await clearTokens();
  },
};
