import type { Request, Response } from "express";
import type { NotificationRequest } from "./notification.schema.js";
import { NotificationService } from "./notification.service.js";
import { getUserWithPreferences } from "../users/user.repository.js";
import { getProvider } from "../channels/provider-registry.js";
import { getHistoryForUser, logAttempt } from "./notification.repository.js";
import { AppError } from "../utils/app-error.js";

const notificationService = new NotificationService(getUserWithPreferences, getProvider, logAttempt);

export async function createNotification(req: Request, res: Response) {
  const payload = req.body as NotificationRequest;

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
