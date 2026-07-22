import { z } from "zod";
import { Channel } from "../../generated/prisma/enums.js";

export const notificationRequestSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  title: z.string().min(1, "title is required"),
  body: z.string().min(1, "body is required"),
  channels: z.array(z.enum(Channel)).min(1, "at least one channel is required"),
});

export type NotificationRequest = z.infer<typeof notificationRequestSchema>;
