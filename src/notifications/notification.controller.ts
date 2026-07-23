import type { Request, Response } from "express";
import type { NotificationRequest } from "./notification.schema.js";
import { getUserWithPreferences } from "../users/user.repository.js";
import { AppError } from "../utils/app-error.js";

export async function createNotification(req: Request, res: Response) {
  const payload = req.body as NotificationRequest;

  const user = await getUserWithPreferences(payload.userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  res.status(201).json(payload);
}
