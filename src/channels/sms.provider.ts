import type { ChannelProvider, DeliveryResult, NotificationPayload } from "./channel.types.js";

export class SmsProvider implements ChannelProvider {
  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    console.log(`[SMS] To user ${notification.userId} — "${notification.title}": ${notification.body}`);
    return { success: true };
  }
}
