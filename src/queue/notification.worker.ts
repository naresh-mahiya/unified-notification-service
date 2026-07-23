import { pathToFileURL } from "node:url";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { NotificationService } from "../notifications/notification.service.js";
import { getUserWithPreferences } from "../users/user.repository.js";
import { getProvider } from "../channels/provider-registry.js";
import { logAttempt } from "../notifications/notification.repository.js";
import { NOTIFICATION_QUEUE_NAME, type NotificationJobData } from "./notification.queue.js";

/**
 * The actual per-job work, factored out from `startWorker()` so it can be unit
 * tested with a fake service (same dependency-injection pattern as
 * NotificationService itself) without needing a real BullMQ Worker or Redis.
 */
export function createJobProcessor(service: Pick<NotificationService, "dispatch">) {
  return async (job: Job<NotificationJobData>) => {
    const { userId, title, body, channels } = job.data;
    return service.dispatch(userId, title, body, channels);
  };
}

function startWorker(): Worker<NotificationJobData> {
  if (!env.redisUrl) {
    throw new Error("REDIS_URL is not set — the notification worker requires Redis to run.");
  }

  const notificationService = new NotificationService(getUserWithPreferences, getProvider, logAttempt);

  // Unlike the producer's connection (queue-connection.ts), the worker should keep
  // retrying — its entire job is to sit and wait for Redis, so a brief outage should
  // be ridden out, not treated as a reason to give up.
  const connection = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<NotificationJobData>(NOTIFICATION_QUEUE_NAME, createJobProcessor(notificationService), {
    connection,
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed for user ${job.data.userId}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed for user ${job?.data.userId}: ${err.message}`);
  });

  console.log("Notification worker started, waiting for jobs...");
  return worker;
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  startWorker();
}
