import type { Request, Response } from "express";
import type { NotificationRequest } from "./notification.schema.js";
import { NotificationService } from "./notification.service.js";
import { getUserWithPreferences } from "../users/user.repository.js";
import { getProvider } from "../channels/provider-registry.js";

const notificationService = new NotificationService(getUserWithPreferences, getProvider);

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
