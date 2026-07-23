import { prisma } from "../db/prisma.js";
import type { Channel, NotificationStatus } from "../../generated/prisma/enums.js";

export interface LogAttemptInput {
  userId: string;
  channel: Channel;
  status: NotificationStatus;
  title: string;
  body: string;
  errorMessage?: string;
}

export async function logAttempt(input: LogAttemptInput): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      userId: input.userId,
      channel: input.channel,
      status: input.status,
      title: input.title,
      body: input.body,
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    },
  });
}

export interface NotificationLogEntry {
  id: string;
  channel: Channel;
  status: NotificationStatus;
  title: string;
  body: string;
  errorMessage: string | null;
  createdAt: Date;
}

const HISTORY_LIMIT = 50;

export async function getHistoryForUser(userId: string): Promise<NotificationLogEntry[]> {
  const logs = await prisma.notificationLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  return logs.map((log) => ({
    id: log.id,
    channel: log.channel,
    status: log.status,
    title: log.title,
    body: log.body,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt,
  }));
}
