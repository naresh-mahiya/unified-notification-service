import type { ChannelProvider, DeliveryResult, NotificationPayload } from "./channel.types.js";

const DEFAULT_FAILURE_RATE = 0.1;

export class SmsProvider implements ChannelProvider {
  constructor(private readonly failureRate: number = DEFAULT_FAILURE_RATE) {}

  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    console.log(`[SMS] To user ${notification.userId} — "${notification.title}": ${notification.body}`);

    if (Math.random() < this.failureRate) {
      return { success: false, error: "Simulated SMS delivery failure (carrier rejected message)" };
    }

    return { success: true };
  }
}
