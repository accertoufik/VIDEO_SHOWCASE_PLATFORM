import { isApiError } from '@/api/ApiError';

export type ErrorKind =
  | 'network'
  | 'auth'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'invalid'
  | 'rateLimited'
  | 'server'
  | 'unknown';

/** Maps status codes to UI behavior (per the backend's contract): use `kind` for control flow, `message` for display. */
export const describeError = (
  error: unknown,
): { kind: ErrorKind; message: string; status?: number } => {
  if (!isApiError(error)) {
    return {
      kind: 'unknown',
      // Never show a system or library message (file paths, native exceptions) to people.
      message: 'Something went wrong. Please try again.',
    };
  }
  const { status, message } = error;
  if (status === 0) return { kind: 'network', message, status };
  if (status === 400) return { kind: 'invalid', message, status };
  if (status === 401) return { kind: 'auth', message, status };
  if (status === 403) return { kind: 'forbidden', message, status };
  if (status === 404) return { kind: 'notFound', message, status };
  if (status === 409) return { kind: 'conflict', message, status };
  if (status === 429)
    return {
      kind: 'rateLimited',
      message: 'Too many requests. Please wait a moment.',
      status,
    };
  if (status >= 500)
    return {
      kind: 'server',
      message: 'Something went wrong on our side. Try again.',
      status,
    };
  return { kind: 'unknown', message, status };
};
