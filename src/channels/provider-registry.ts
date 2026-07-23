import { Channel } from "../../generated/prisma/enums.js";
import type { ChannelProvider } from "./channel.types.js";
import { EmailProvider } from "./email.provider.js";
import { SmsProvider } from "./sms.provider.js";
import { PushProvider } from "./push.provider.js";
import { InAppProvider } from "./in-app.provider.js";

const providers: Record<Channel, ChannelProvider> = {
  [Channel.EMAIL]: new EmailProvider(),
  [Channel.SMS]: new SmsProvider(),
  [Channel.PUSH]: new PushProvider(),
  [Channel.IN_APP]: new InAppProvider(),
};

export function getProvider(channel: Channel): ChannelProvider {
  return providers[channel];
}
