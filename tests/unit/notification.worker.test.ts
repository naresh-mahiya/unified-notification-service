import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { Channel } from "../../generated/prisma/enums.js";
import { createJobProcessor } from "../../src/queue/notification.worker.js";
import type { NotificationJobData } from "../../src/queue/notification.queue.js";
import type { NotificationService } from "../../src/notifications/notification.service.js";

function fakeJob(data: NotificationJobData): Job<NotificationJobData> {
  return { data } as Job<NotificationJobData>;
}

describe("createJobProcessor", () => {
  it("dispatches using the job's data via the injected service, and returns its result", async () => {
    const dispatchResult = { userId: "user-1", results: [{ channel: Channel.EMAIL, status: "SUCCESS" as const }] };
    const dispatch = vi.fn().mockResolvedValue(dispatchResult);
    const fakeService: Pick<NotificationService, "dispatch"> = { dispatch };

    const processJob = createJobProcessor(fakeService);
    const job = fakeJob({ userId: "user-1", title: "Hi", body: "Body", channels: [Channel.EMAIL] });

    const result = await processJob(job);

    expect(dispatch).toHaveBeenCalledWith("user-1", "Hi", "Body", [Channel.EMAIL]);
    expect(result).toEqual(dispatchResult);
  });

  it("lets a rejected dispatch (e.g. 404 for a deleted user) propagate, so BullMQ marks the job failed", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("User not found"));
    const fakeService: Pick<NotificationService, "dispatch"> = { dispatch };

    const processJob = createJobProcessor(fakeService);
    const job = fakeJob({ userId: "missing-user", title: "Hi", body: "Body", channels: [Channel.EMAIL] });

    await expect(processJob(job)).rejects.toThrow("User not found");
  });
});
