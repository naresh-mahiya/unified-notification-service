import { describe, expect, it, vi } from "vitest";
import { Channel } from "../../generated/prisma/enums.js";
import { NotificationService } from "../../src/notifications/notification.service.js";
import { AppError } from "../../src/utils/app-error.js";
import type { UserWithPreferences } from "../../src/users/user.repository.js";
import type { ChannelProvider } from "../../src/channels/channel.types.js";

function fakeUser(overrides: Partial<UserWithPreferences["preferences"]> = {}): UserWithPreferences {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    preferences: {
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: true,
      inAppEnabled: true,
      ...overrides,
    },
  };
}

function successProvider(): ChannelProvider {
  return { send: vi.fn().mockResolvedValue({ success: true }) };
}

describe("NotificationService.dispatch", () => {
  it("skips a channel the user has opted out of, without calling its provider", async () => {
    const user = fakeUser({ smsEnabled: false });
    const emailProvider = successProvider();
    const smsProvider = successProvider();

    const service = new NotificationService(
      async () => user,
      (channel) => (channel === Channel.EMAIL ? emailProvider : smsProvider)
    );

    const result = await service.dispatch(user.id, "Hi", "Body", [Channel.EMAIL, Channel.SMS]);

    expect(result.results).toEqual(
      expect.arrayContaining([
        { channel: Channel.EMAIL, status: "SUCCESS" },
        { channel: Channel.SMS, status: "SKIPPED" },
      ])
    );
    expect(smsProvider.send).not.toHaveBeenCalled();
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
  });

  it("dispatches to multiple opted-in channels independently", async () => {
    const user = fakeUser();
    const providers: Partial<Record<Channel, ChannelProvider>> = {
      [Channel.EMAIL]: successProvider(),
      [Channel.PUSH]: successProvider(),
      [Channel.IN_APP]: successProvider(),
    };

    const service = new NotificationService(
      async () => user,
      (channel) => providers[channel]!
    );

    const result = await service.dispatch(user.id, "Hi", "Body", [
      Channel.EMAIL,
      Channel.PUSH,
      Channel.IN_APP,
    ]);

    expect(result.results).toEqual(
      expect.arrayContaining([
        { channel: Channel.EMAIL, status: "SUCCESS" },
        { channel: Channel.PUSH, status: "SUCCESS" },
        { channel: Channel.IN_APP, status: "SUCCESS" },
      ])
    );
  });

  it("does not let one failing provider block the others", async () => {
    const user = fakeUser();
    const failingEmailProvider: ChannelProvider = {
      send: vi.fn().mockRejectedValue(new Error("SMTP timeout")),
    };
    const workingPushProvider = successProvider();

    const service = new NotificationService(
      async () => user,
      (channel) => (channel === Channel.EMAIL ? failingEmailProvider : workingPushProvider)
    );

    const result = await service.dispatch(user.id, "Hi", "Body", [Channel.EMAIL, Channel.PUSH]);

    expect(result.results).toEqual(
      expect.arrayContaining([
        { channel: Channel.EMAIL, status: "FAILED", error: "SMTP timeout" },
        { channel: Channel.PUSH, status: "SUCCESS" },
      ])
    );
  });

  it("records a FAILED result when a provider resolves with success: false", async () => {
    const user = fakeUser();
    const rejectingProvider: ChannelProvider = {
      send: vi.fn().mockResolvedValue({ success: false, error: "invalid phone number" }),
    };

    const service = new NotificationService(
      async () => user,
      () => rejectingProvider
    );

    const result = await service.dispatch(user.id, "Hi", "Body", [Channel.SMS]);

    expect(result.results).toEqual([
      { channel: Channel.SMS, status: "FAILED", error: "invalid phone number" },
    ]);
  });

  it("throws a 404 AppError when the user does not exist", async () => {
    const service = new NotificationService(
      async () => null,
      () => successProvider()
    );

    await expect(service.dispatch("missing-user", "Hi", "Body", [Channel.EMAIL])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws an AppError instance specifically", async () => {
    const service = new NotificationService(
      async () => null,
      () => successProvider()
    );

    await expect(service.dispatch("missing-user", "Hi", "Body", [Channel.EMAIL])).rejects.toBeInstanceOf(
      AppError
    );
  });
});
