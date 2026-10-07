import { isApiError } from '@/api/ApiError';

const MAX_RETRIES = 2;

/** Retry network errors and 5xx twice. Never retry 4xx (not found, forbidden, invalid): it can't succeed, and the user is left waiting. 408/429 are worth another go. */
export const shouldRetry = (failureCount: number, error: unknown) => {
  if (failureCount >= MAX_RETRIES) return false;
  if (
    isApiError(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  )
    return false;
  return true;
};

export const retryDelay = (attempt: number) =>
  Math.min(1000 * 2 ** attempt, 8000);
