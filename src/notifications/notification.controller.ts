import type { Request, Response } from "express";
import type { NotificationRequest } from "./notification.schema.js";

export function createNotification(req: Request, res: Response) {
  const payload = req.body as NotificationRequest;
  res.status(201).json(payload);
}
