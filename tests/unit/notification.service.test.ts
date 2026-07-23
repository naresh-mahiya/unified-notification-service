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

function fakeLogAttempt() {
  return vi.fn().mockResolvedValue(undefined);
}

describe("NotificationService.dispatch", () => {
  it("skips a channel the user has opted out of, without calling its provider, and logs the skip", async () => {
    const user = fakeUser({ smsEnabled: false });
    const emailProvider = successProvider();
    const smsProvider = successProvider();
    const logAttempt = fakeLogAttempt();

    const service = new NotificationService(
      async () => user,
      (channel) => (channel === Channel.EMAIL ? emailProvider : smsProvider),
      logAttempt
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

    expect(logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, channel: Channel.SMS, status: "SKIPPED" })
    );
    expect(logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, channel: Channel.EMAIL, status: "SUCCESS" })
    );
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
      (channel) => providers[channel]!,
      fakeLogAttempt()
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

  it("does not let one failing provider block the others, and logs the failure with its error", async () => {
    const user = fakeUser();
    const failingEmailProvider: ChannelProvider = {
      send: vi.fn().mockRejectedValue(new Error("SMTP timeout")),
    };
    const workingPushProvider = successProvider();
    const logAttempt = fakeLogAttempt();

    const service = new NotificationService(
      async () => user,
      (channel) => (channel === Channel.EMAIL ? failingEmailProvider : workingPushProvider),
      logAttempt
    );

    const result = await service.dispatch(user.id, "Hi", "Body", [Channel.EMAIL, Channel.PUSH]);

    expect(result.results).toEqual(
      expect.arrayContaining([
        { channel: Channel.EMAIL, status: "FAILED", error: "SMTP timeout" },
        { channel: Channel.PUSH, status: "SUCCESS" },
      ])
    );

    expect(logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ channel: Channel.EMAIL, status: "FAILED", errorMessage: "SMTP timeout" })
    );
  });

  it("records a FAILED result when a provider resolves with success: false", async () => {
    const user = fakeUser();
    const rejectingProvider: ChannelProvider = {
      send: vi.fn().mockResolvedValue({ success: false, error: "invalid phone number" }),
    };
    const logAttempt = fakeLogAttempt();

    const service = new NotificationService(
      async () => user,
      () => rejectingProvider,
      logAttempt
    );

    const result = await service.dispatch(user.id, "Hi", "Body", [Channel.SMS]);

    expect(result.results).toEqual([
      { channel: Channel.SMS, status: "FAILED", error: "invalid phone number" },
    ]);
    expect(logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ channel: Channel.SMS, status: "FAILED", errorMessage: "invalid phone number" })
    );
  });

  it("returns all SKIPPED results (no error) when the user has opted out of every requested channel", async () => {
    const user = fakeUser({ emailEnabled: false, smsEnabled: false });
    const emailProvider = successProvider();
    const smsProvider = successProvider();

    const service = new NotificationService(
      async () => user,
      (channel) => (channel === Channel.EMAIL ? emailProvider : smsProvider),
      fakeLogAttempt()
    );

    const result = await service.dispatch(user.id, "Hi", "Body", [Channel.EMAIL, Channel.SMS]);

    expect(result.results).toEqual([
      { channel: Channel.EMAIL, status: "SKIPPED" },
      { channel: Channel.SMS, status: "SKIPPED" },
    ]);
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(smsProvider.send).not.toHaveBeenCalled();
  });

  it("throws a 404 AppError when the user does not exist, without logging anything", async () => {
    const logAttempt = fakeLogAttempt();
    const service = new NotificationService(
      async () => null,
      () => successProvider(),
      logAttempt
    );

    await expect(service.dispatch("missing-user", "Hi", "Body", [Channel.EMAIL])).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(logAttempt).not.toHaveBeenCalled();
  });

  it("throws an AppError instance specifically", async () => {
    const service = new NotificationService(
      async () => null,
      () => successProvider(),
      fakeLogAttempt()
    );

    await expect(service.dispatch("missing-user", "Hi", "Body", [Channel.EMAIL])).rejects.toBeInstanceOf(
      AppError
    );
  });
});
