import { Router, raw } from "express";
import { Webhook } from "svix";
import { env } from "../config/env";
import { prisma } from "../config/db";
import { UserService } from "../services/user.service";


export const webhookRouter = Router();

interface ClerkUserEvent {
    type: "user.created" | "user.updated" | "user.deleted";
    data : {
        id: string;
        [key: string]: unknown;
    };
}

webhookRouter.post("/webhooks/clerk", raw({ type: "application/json" }), async (req, res) => {
    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if( typeof svixId !== "string" || typeof svixTimestamp !== "string" || typeof svixSignature !== "string") {
        return res.status(400).json({ error: "Missing or invalid Svix headers" });
    }

    let event: ClerkUserEvent;
    try {
        const webhook = new Webhook(env.CLERK_WEBHOOK_SECRET);
        webhook.verify(req.body, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
        });
        event = JSON.parse(req.body.toString()) as ClerkUserEvent;
    } catch (error) {
        console.error("Error verifying webhook signature:", error);
        return res.status(400).json({ error: "Invalid webhook signature" });
    }

    try {
      switch (event.type) {
        case 'user.created':
          await UserService.ensureUserWithProfile(event.data);
          break;
        case 'user.updated':
          // Handle user update logic if needed, e.g., updating profile information in your database
          break;

        case 'user.deleted':
          await UserService.deactivateUser(event.data.id);
          break;
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error(`Failed to process Clerk webhook (${event.type}):`, error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
});