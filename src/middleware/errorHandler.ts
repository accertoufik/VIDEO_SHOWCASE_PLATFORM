import type { NextFunction, Request, Response } from "express";
import { sendErrorResponse } from "../lib/apiResponse";

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const errorHandler = (err: ApiError, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  const message =
    statusCode >= 500 && !(err instanceof ApiError)
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';
  // Never echo raw internals (Prisma/Azure errors, stack info) for server errors.
  const details = statusCode >= 500 ? undefined : err.details;

  sendErrorResponse(res, statusCode, message, details);
};