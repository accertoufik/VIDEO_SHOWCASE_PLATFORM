/** Every failed request becomes one of these, so UI code branches on `status`, not on strings. */
export class ApiError extends Error {
    readonly status: number;
    readonly details?: unknown;

    constructor(status: number, message: string, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;