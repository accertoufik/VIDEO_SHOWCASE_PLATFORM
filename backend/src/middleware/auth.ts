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

/**
 * Like authenticateUser, but never rejects the request — if there's no
 * token or it fails to verify, req.auth is simply left unset so routes
 * that support both authenticated and anonymous access can still run.
 */
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next();
    }

    const token = authHeader.slice("Bearer ".length);

    try {
        const verifiedToken = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
        req.auth = { userId: verifiedToken.sub };
    } catch (error) {
        console.error("Error verifying token (optional auth):", error);
    }
    next();
}