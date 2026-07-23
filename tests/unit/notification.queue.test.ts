import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { Channel } from "../../generated/prisma/enums.js";
import { createEnqueueNotification, type NotificationJobData } from "../../src/queue/notification.queue.js";

function jobData(): NotificationJobData {
  return { userId: "user-1", title: "Hi", body: "Body", channels: [Channel.EMAIL] };
}

describe("createEnqueueNotification", () => {
  it("returns null immediately when no queue is configured (no Redis)", async () => {
    const enqueue = createEnqueueNotification(null);

    const jobId = await enqueue(jobData());

    expect(jobId).toBeNull();
  });

  it("returns the job id when the queue accepts the job", async () => {
    const fakeQueue = {
      add: vi.fn().mockResolvedValue({ id: "job-123" }),
    } as unknown as Queue<NotificationJobData>;

    const enqueue = createEnqueueNotification(fakeQueue);
    const jobId = await enqueue(jobData());

    expect(jobId).toBe("job-123");
    expect(fakeQueue.add).toHaveBeenCalledWith(
      "dispatch",
      jobData(),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      })
    );
  });

  it("returns null (the fallback signal) when the queue rejects the add — e.g. Redis unreachable", async () => {
    const fakeQueue = {
      add: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    } as unknown as Queue<NotificationJobData>;

    const enqueue = createEnqueueNotification(fakeQueue);
    const jobId = await enqueue(jobData());

    expect(jobId).toBeNull();
  });
});
