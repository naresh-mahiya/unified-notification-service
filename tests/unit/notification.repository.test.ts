import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { Channel, NotificationStatus } from "../../generated/prisma/enums.js";
import { getHistoryForUser, logAttempt } from "../../src/notifications/notification.repository.js";

describe("notification repository", () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Log Test User",
        email: `log-test-${Date.now()}@example.com`,
        preference: {
          create: { emailEnabled: true, smsEnabled: true, pushEnabled: true, inAppEnabled: true },
        },
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { userId: testUserId } });
    await prisma.notificationPreference.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it("writes a SUCCESS row with no error message", async () => {
    await logAttempt({
      userId: testUserId,
      channel: Channel.EMAIL,
      status: NotificationStatus.SUCCESS,
      title: "Hello",
      body: "World",
    });

    const history = await getHistoryForUser(testUserId);
    const entry = history.find((h) => h.channel === Channel.EMAIL && h.status === "SUCCESS");

    expect(entry).toBeDefined();
    expect(entry?.errorMessage).toBeNull();
  });

  it("writes a FAILED row with the error message captured", async () => {
    await logAttempt({
      userId: testUserId,
      channel: Channel.SMS,
      status: NotificationStatus.FAILED,
      title: "Hello",
      body: "World",
      errorMessage: "invalid phone number",
    });

    const history = await getHistoryForUser(testUserId);
    const entry = history.find((h) => h.channel === Channel.SMS && h.status === "FAILED");

    expect(entry).toBeDefined();
    expect(entry?.errorMessage).toBe("invalid phone number");
  });

  it("writes a SKIPPED row for an opted-out channel", async () => {
    await logAttempt({
      userId: testUserId,
      channel: Channel.PUSH,
      status: NotificationStatus.SKIPPED,
      title: "Hello",
      body: "World",
    });

    const history = await getHistoryForUser(testUserId);
    const entry = history.find((h) => h.channel === Channel.PUSH && h.status === "SKIPPED");

    expect(entry).toBeDefined();
    expect(entry?.errorMessage).toBeNull();
  });

  it("returns the most recent entries first", async () => {
    const history = await getHistoryForUser(testUserId);
    const timestamps = history.map((h) => h.createdAt.getTime());
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });
});
