import type { Request, Response } from "express";
import { sendErrorResponse } from "../lib/apiResponse";

export const notFoundHandler = (req: Request, res: Response) => {
  sendErrorResponse(res, 404, `Route not found : ${req.method} ${req.originalUrl}`);
}