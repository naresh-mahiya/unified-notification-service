import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "../../src/db/prisma.js";
import { Channel } from "../../generated/prisma/enums.js";
import {
  createEnqueueNotification,
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from "../../src/queue/notification.queue.js";
import { createJobProcessor } from "../../src/queue/notification.worker.js";
import { NotificationService } from "../../src/notifications/notification.service.js";
import { getUserWithPreferences } from "../../src/users/user.repository.js";
import { getProvider } from "../../src/channels/provider-registry.js";
import { logAttempt, getHistoryForUser } from "../../src/notifications/notification.repository.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// This suite exercises the *real* async path — a real BullMQ queue and a real worker
// talking to a real (dockerized) Redis — rather than the fallback path the rest of the
// suite runs through by default. Since a plain `npm test` on a machine without Redis
// running shouldn't fail, connectivity is checked up front and the whole suite is
// skipped (not failed) if Redis isn't reachable. Run `docker compose up -d redis` (or
// the full stack) before `npm test` to actually exercise these.
async function isRedisReachable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, retryStrategy: () => null, connectTimeout: 1000 });
  try {
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const redisAvailable = await isRedisReachable();

describe.skipIf(!redisAvailable)("notification queue (real Redis)", () => {
  let testUserId: string;
  let queue: Queue<NotificationJobData>;
  let worker: Worker<NotificationJobData>;
  let queueEvents: QueueEvents;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Queue Test User",
        email: `queue-test-${Date.now()}@example.com`,
        preference: {
          create: { emailEnabled: true, smsEnabled: false, pushEnabled: true, inAppEnabled: true },
        },
      },
    });
    testUserId = user.id;

    queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
    });
    queueEvents = new QueueEvents(NOTIFICATION_QUEUE_NAME, {
      connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
    });

    const notificationService = new NotificationService(getUserWithPreferences, getProvider, logAttempt);
    worker = new Worker<NotificationJobData>(NOTIFICATION_QUEUE_NAME, createJobProcessor(notificationService), {
      connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
    });

    await worker.waitUntilReady();
    await queueEvents.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
    await queueEvents.close();
    await queue.close();
    await prisma.notificationLog.deleteMany({ where: { userId: testUserId } });
    await prisma.notificationPreference.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it("processes an enqueued job end-to-end: dispatch runs, and history reflects it", async () => {
    const enqueue = createEnqueueNotification(queue);

    const jobId = await enqueue({
      userId: testUserId,
      title: "Queued Order Update",
      body: "Processed by the real worker",
      channels: [Channel.EMAIL, Channel.SMS],
    });

    expect(jobId).not.toBeNull();

    const job = await queue.getJob(jobId!);
    expect(job).not.toBeUndefined();
    await job!.waitUntilFinished(queueEvents, 10_000);

    const history = await getHistoryForUser(testUserId);
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: Channel.EMAIL, status: "SUCCESS", title: "Queued Order Update" }),
        expect.objectContaining({ channel: Channel.SMS, status: "SKIPPED", title: "Queued Order Update" }),
      ])
    );
  });
});
