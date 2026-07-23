import type { ChannelProvider, DeliveryResult, NotificationPayload } from "./channel.types.js";

export class EmailProvider implements ChannelProvider {
  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    console.log(`[Email] To user ${notification.userId} — "${notification.title}": ${notification.body}`);
    return { success: true };
  }
}
