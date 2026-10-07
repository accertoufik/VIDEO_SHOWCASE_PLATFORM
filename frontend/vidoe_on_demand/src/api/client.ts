import { API_BASE_URL } from '@/lib/config';
import { buildQuery, type QueryParams } from '@/utils/query';
import { ApiError } from './ApiError';

export type TokenGetter = (options?: {
  skipCache?: boolean;
}) => Promise<string | null>;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: QueryParams;
  body?: unknown;
  /**
   * none     -> never send a token (pure public endpoints)
   * optional -> send the token when signed in (video detail, profile: enables viewer flags)  [default]
   * required -> must be signed in; fails locally with 401 if not, without hitting the network
   */
  auth?: 'none' | 'optional' | 'required';
  signal?: AbortSignal;
  timeoutMs?: number;
};

const parseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// Handles BOTH error shapes: { success:false, error:{ message, details } } and { error: "Unauthorized" }.
const readError = (payload: unknown, fallback: string) => {
  if (typeof payload === 'string' && payload)
    return { message: payload, details: undefined };
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string')
      return { message: record.error, details: undefined };
    if (record.error && typeof record.error === 'object') {
      const inner = record.error as Record<string, unknown>;
      if (typeof inner.message === 'string')
        return { message: inner.message, details: inner.details };
    }
    if (typeof record.message === 'string')
      return { message: record.message, details: undefined };
  }
  return { message: fallback, details: undefined };
};

/** Unwraps { success:true, data } so callers get `data` directly. Non-enveloped bodies pass through. */
const unwrap = <T>(payload: unknown): T => {
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    'data' in payload
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export const createApi = (getToken: TokenGetter) => {
  const send = async <T>(
    path: string,
    options: RequestOptions = {},
    tokenOverride?: string | null,
  ): Promise<T> => {
    const {
      method = 'GET',
      query,
      body,
      auth = 'optional',
      signal,
      timeoutMs = 20_000,
    } = options;

    let token: string | null = null;
    if (auth !== 'none') {
      token = tokenOverride ?? (await getToken().catch(() => null));
      // Right after the app was idle or in the background, Clerk's cached session token can be missing or expired for a
      // moment. Ask once more for a fresh one before telling the user to sign in: otherwise the FIRST like, comment or
      // follow fails and only the second tap (when the token has refreshed) works.
      if (auth === 'required' && !token && tokenOverride === undefined) {
        token = await getToken({ skipCache: true }).catch(() => null);
      }
      if (auth === 'required' && !token)
        throw new ApiError(401, 'Please sign in to continue');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener('abort', forwardAbort);

    try {
      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}${path}${buildQuery(query ?? {})}`, {
          method,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...(body !== undefined
              ? { 'Content-Type': 'application/json' }
              : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        if (signal?.aborted) throw error; // the caller (TanStack Query) cancelled on purpose
        throw new ApiError(
          0,
          controller.signal.aborted
            ? 'The request timed out. Try again.'
            : "Can't reach the server. Check your connection.",
        );
      }

      const payload = await parseBody(response);

      if (!response.ok) {
        // A 401 with a token is often just a stale Clerk session token: refresh once and retry.
        if (response.status === 401 && token && tokenOverride === undefined) {
          const fresh = await getToken({ skipCache: true }).catch(() => null);
          if (fresh && fresh !== token) return send<T>(path, options, fresh);
        }
        const { message, details } = readError(
          payload,
          response.statusText || 'Request failed',
        );
        throw new ApiError(response.status, message, details);
      }

      return unwrap<T>(payload);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  };

  return {
    get: <T>(
      path: string,
      options: Omit<RequestOptions, 'method' | 'body'> = {},
    ) => send<T>(path, { ...options, method: 'GET' }),
    post: <T>(
      path: string,
      body?: unknown,
      options: Omit<RequestOptions, 'method' | 'body'> = {},
    ) => send<T>(path, { ...options, method: 'POST', body }),
    patch: <T>(
      path: string,
      body?: unknown,
      options: Omit<RequestOptions, 'method' | 'body'> = {},
    ) => send<T>(path, { ...options, method: 'PATCH', body }),
    del: <T>(
      path: string,
      body?: unknown,
      options: Omit<RequestOptions, 'method' | 'body'> = {},
    ) => send<T>(path, { ...options, method: 'DELETE', body }),
  };
};

export type Api = ReturnType<typeof createApi>;
