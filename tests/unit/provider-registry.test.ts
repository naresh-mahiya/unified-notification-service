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

  it("every provider resolves with a successful delivery result", async () => {
    const notification = { userId: "user-1", title: "Hi", body: "World" };

    for (const channel of Object.values(Channel)) {
      const result = await getProvider(channel).send(notification);
      expect(result).toEqual({ success: true });
    }
  });
});
