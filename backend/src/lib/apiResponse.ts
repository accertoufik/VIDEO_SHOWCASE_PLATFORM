import { error } from "console";
import type { Response } from "express";

//one consistent response format for all API responses
export function sendSuccessResponse<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({
    success: true,
    data,
  });
}

export function sendErrorResponse(res: Response, status: number, message: string, details?: unknown): void {
  res.status(status).json({
    success: false,
    error: {
      message,
      details,
    },
  });
}
