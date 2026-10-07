export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};
export type ApiErrorResponse = {
  success: false;
  error: {
    status: number;
    message: string;
    details?: unknown;
  };
};

/** every cursor-paginated endpoint returns its items plus this. Stop when nextCursor is null. */
export type CursorInfo = { nextCursor: string | null; totalCount: number };

/**BigInt columns may be represented as strings in the API. */
export type BigIntString = string | number | bigint | null | undefined;