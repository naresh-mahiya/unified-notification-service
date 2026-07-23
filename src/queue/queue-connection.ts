import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import {
  createEnqueueNotification,
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from "./notification.queue.js";

function buildQueue(): Queue<NotificationJobData> | null {
  if (!env.redisUrl) {
    return null;
  }

  // The producer side needs to fail fast, not retry — if Redis is unreachable, an
  // HTTP request enqueueing a notification should fall back to synchronous dispatch
  // within milliseconds, not hang waiting for reconnection attempts. The worker
  // (notification.worker.ts) intentionally uses different, more patient settings,
  // since its whole job is to sit and wait for Redis to be available.
  const connection = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
    connectTimeout: 2000,
    lazyConnect: true,
  });

  connection.on("error", (err: Error) => {
    console.warn(`[queue] Redis unavailable, notifications will dispatch synchronously: ${err.message}`);
  });

  return new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, { connection });
}

export const notificationQueue = buildQueue();
export const enqueueNotification = createEnqueueNotification(notificationQueue);
