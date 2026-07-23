import { describe, expect, it } from "vitest";
import { Channel } from "../../generated/prisma/enums.js";
import { getProvider } from "../../src/channels/provider-registry.js";
import { EmailProvider } from "../../src/channels/email.provider.js";
import { SmsProvider } from "../../src/channels/sms.provider.js";
import { PushProvider } from "../../src/channels/push.provider.js";
import { InAppProvider } from "../../src/channels/in-app.provider.js";

describe("provider registry", () => {
  it("maps each channel to its matching provider", () => {
    expect(getProvider(Channel.EMAIL)).toBeInstanceOf(EmailProvider);
    expect(getProvider(Channel.SMS)).toBeInstanceOf(SmsProvider);
    expect(getProvider(Channel.PUSH)).toBeInstanceOf(PushProvider);
    expect(getProvider(Channel.IN_APP)).toBeInstanceOf(InAppProvider);
  });

  // The registry forces a 0% failure rate under NODE_ENV=test (see provider-registry.ts),
  // so this stays deterministic even though the real providers simulate random failures.
  it("every provider resolves with a successful delivery result", async () => {
    const notification = { userId: "user-1", title: "Hi", body: "World" };

    for (const channel of Object.values(Channel)) {
      const result = await getProvider(channel).send(notification);
      expect(result).toEqual({ success: true });
    }
  });
});

describe("provider failure simulation", () => {
  const providerClasses = [
    { name: "EmailProvider", Provider: EmailProvider },
    { name: "SmsProvider", Provider: SmsProvider },
    { name: "PushProvider", Provider: PushProvider },
    { name: "InAppProvider", Provider: InAppProvider },
  ];

  it.each(providerClasses)("$name always succeeds when constructed with a 0% failure rate", async ({ Provider }) => {
    const provider = new Provider(0);
    const result = await provider.send({ userId: "user-1", title: "Hi", body: "World" });
    expect(result).toEqual({ success: true });
  });

  it.each(providerClasses)(
    "$name always fails with a descriptive error when constructed with a 100% failure rate",
    async ({ Provider }) => {
      const provider = new Provider(1);
      const result = await provider.send({ userId: "user-1", title: "Hi", body: "World" });
      expect(result.success).toBe(false);
      expect(result.error).toEqual(expect.any(String));
      expect(result.error!.length).toBeGreaterThan(0);
    }
  );
});
