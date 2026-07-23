import type { ChannelProvider, DeliveryResult, NotificationPayload } from "./channel.types.js";

export class PushProvider implements ChannelProvider {
  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    console.log(`[Push] To user ${notification.userId} — "${notification.title}": ${notification.body}`);
    return { success: true };
  }
}
