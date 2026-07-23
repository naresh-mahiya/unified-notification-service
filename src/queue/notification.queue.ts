import type { Queue } from "bullmq";
import type { Channel } from "../../generated/prisma/enums.js";

export const NOTIFICATION_QUEUE_NAME = "notifications";

export interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  channels: Channel[];
}

export type EnqueueNotification = (data: NotificationJobData) => Promise<string | null>;

/**
 * Wraps a BullMQ queue so callers get a plain `string | null` back instead of having
 * to know about BullMQ. `null` means "not enqueued" — either no queue is configured
 * (queue is null) or Redis rejected the add() call — and is the caller's signal to
 * fall back to synchronous dispatch.
 */
export function createEnqueueNotification(queue: Queue<NotificationJobData> | null): EnqueueNotification {
  return async (data) => {
    if (!queue) {
      return null;
    }

    try {
      const job = await queue.add("dispatch", data, {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      return job.id ?? null;
    } catch {
      return null;
    }
  };
}
