import type { Request, Response } from "express";
import type { NotificationRequest } from "./notification.schema.js";
import { NotificationService } from "./notification.service.js";
import { getUserWithPreferences } from "../users/user.repository.js";
import { getProvider } from "../channels/provider-registry.js";
import { getHistoryForUser, logAttempt } from "./notification.repository.js";
import { AppError } from "../utils/app-error.js";
import { enqueueNotification } from "../queue/queue-connection.js";

const notificationService = new NotificationService(getUserWithPreferences, getProvider, logAttempt);

export async function createNotification(req: Request, res: Response) {
  const payload = req.body as NotificationRequest;

  // Checked here, synchronously, before touching the queue at all — a bad userId
  // should fail fast with a 404, not get queued and silently swallowed by a worker
  // the caller has no visibility into. (Note: dispatch() below re-checks this too;
  // that's an accepted extra query, see Phase 15's Interview Notes for why.)
  const user = await getUserWithPreferences(payload.userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const jobId = await enqueueNotification({
    userId: payload.userId,
    title: payload.title,
    body: payload.body,
    channels: payload.channels,
  });

  if (jobId) {
    res.status(202).json({ userId: payload.userId, status: "queued", jobId });
    return;
  }

  // No queue configured, or Redis was unreachable — fall back to dispatching
  // synchronously, exactly as this endpoint always behaved before the queue existed.
  const result = await notificationService.dispatch(
    payload.userId,
    payload.title,
    payload.body,
    payload.channels
  );

  res.status(201).json(result);
}

export async function getNotificationHistory(req: Request, res: Response) {
  const { userId } = req.params as { userId: string };

  const user = await getUserWithPreferences(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const history = await getHistoryForUser(userId);
  res.status(200).json({ userId, history });
}
