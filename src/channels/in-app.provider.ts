import type { ChannelProvider, DeliveryResult, NotificationPayload } from "./channel.types.js";

const DEFAULT_FAILURE_RATE = 0.1;

// Unlike the other channels, in-app has no external service to call — "delivering" it just
// means the message becomes available for the user to see next time they open the app, which
// in practice is the NotificationLog row itself. This still implements the same interface so
// the dispatch logic doesn't need to treat it as a special case.
export class InAppProvider implements ChannelProvider {
  constructor(private readonly failureRate: number = DEFAULT_FAILURE_RATE) {}

  async send(notification: NotificationPayload): Promise<DeliveryResult> {
    console.log(`[In-App] Queued for user ${notification.userId} — "${notification.title}": ${notification.body}`);

    if (Math.random() < this.failureRate) {
      return { success: false, error: "Simulated in-app delivery failure (write conflict)" };
    }

    return { success: true };
  }
}
