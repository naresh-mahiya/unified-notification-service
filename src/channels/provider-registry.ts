import { Channel } from "../../generated/prisma/enums.js";
import type { ChannelProvider } from "./channel.types.js";
import { EmailProvider } from "./email.provider.js";
import { SmsProvider } from "./sms.provider.js";
import { PushProvider } from "./push.provider.js";
import { InAppProvider } from "./in-app.provider.js";
import { env } from "../config/env.js";

// Simulated random failures are only meaningful outside the automated test suite — tests
// assert exact outcomes, so they force a 0% failure rate here to stay deterministic.
const failureRate = env.nodeEnv === "test" ? 0 : undefined;

const providers: Record<Channel, ChannelProvider> = {
  [Channel.EMAIL]: new EmailProvider(failureRate),
  [Channel.SMS]: new SmsProvider(failureRate),
  [Channel.PUSH]: new PushProvider(failureRate),
  [Channel.IN_APP]: new InAppProvider(failureRate),
};

export function getProvider(channel: Channel): ChannelProvider {
  return providers[channel];
}
