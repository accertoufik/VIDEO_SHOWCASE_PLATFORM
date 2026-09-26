import { verifyToken } from "@clerk/backend";
import { type NextFunction, type Request, type Response } from "express";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
    auth?: { userId: string };
}


export async function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if(!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.slice("Bearer ".length);

    try {
        const verifiedToken = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
        req.auth = { userId: verifiedToken.sub };
        next();
    } catch (error) {
        console.error("Error verifying token:", error);
        return res.status(401).json({ error: "Unauthorized/Invalid or expired token" });
    }
}