import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { notificationRequestSchema } from "./notification.schema.js";
import { createNotification, getNotificationHistory } from "./notification.controller.js";

export const notificationRouter = Router();

notificationRouter.post("/", validate(notificationRequestSchema), createNotification);
notificationRouter.get("/:userId/history", getNotificationHistory);
