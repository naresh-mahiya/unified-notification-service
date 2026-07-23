export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
}

export interface DeliveryResult {
  success: boolean;
  error?: string;
}

export interface ChannelProvider {
  send(notification: NotificationPayload): Promise<DeliveryResult>;
}
