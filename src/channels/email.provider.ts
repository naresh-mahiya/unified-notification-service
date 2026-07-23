import type { ChannelProvider, DeliveryResult, NotificationPayload } from "./channel.types.js";

const DEFAULT_FAILURE_RATE = 0.1;

export class EmailProvider implements ChannelProvider {
  constructor(private readonly failureRate: number = DEFAULT_FAILURE_RATE) {}

  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    console.log(`[Email] To user ${notification.userId} — "${notification.title}": ${notification.body}`);

    if (Math.random() < this.failureRate) {
      return { success: false, error: "Simulated email delivery failure (SMTP timeout)" };
    }

    return { success: true };
  }
}
