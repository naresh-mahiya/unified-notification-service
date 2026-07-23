import { Channel, NotificationStatus } from "../../generated/prisma/enums.js";
import type { ChannelProvider } from "../channels/channel.types.js";
import type { UserWithPreferences } from "../users/user.repository.js";
import type { LogAttemptInput } from "./notification.repository.js";
import { AppError } from "../utils/app-error.js";

export interface ChannelDispatchResult {
  channel: Channel;
  status: NotificationStatus;
  error?: string;
}

export interface DispatchResult {
  userId: string;
  results: ChannelDispatchResult[];
}

type GetUserWithPreferences = (userId: string) => Promise<UserWithPreferences | null>;
type GetProvider = (channel: Channel) => ChannelProvider;
type LogAttempt = (input: LogAttemptInput) => Promise<void>;

const PREFERENCE_KEY_BY_CHANNEL: Record<Channel, keyof UserWithPreferences["preferences"]> = {
  [Channel.EMAIL]: "emailEnabled",
  [Channel.SMS]: "smsEnabled",
  [Channel.PUSH]: "pushEnabled",
  [Channel.IN_APP]: "inAppEnabled",
};

export class NotificationService {
  constructor(
    private readonly getUserWithPreferences: GetUserWithPreferences,
    private readonly getProvider: GetProvider,
    private readonly logAttempt: LogAttempt
  ) {}

  async dispatch(
    userId: string,
    title: string,
    body: string,
    requestedChannels: Channel[]
  ): Promise<DispatchResult> {
    const user = await this.getUserWithPreferences(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const results = await Promise.all(
      requestedChannels.map((channel) => this.dispatchToChannel(user, channel, title, body))
    );

    return { userId, results };
  }

  private async dispatchToChannel(
    user: UserWithPreferences,
    channel: Channel,
    title: string,
    body: string
  ): Promise<ChannelDispatchResult> {
    const preferenceKey = PREFERENCE_KEY_BY_CHANNEL[channel];

    const result = user.preferences[preferenceKey]
      ? await this.send(user, channel, title, body)
      : ({ channel, status: NotificationStatus.SKIPPED } as ChannelDispatchResult);

    await this.logAttempt({
      userId: user.id,
      channel,
      status: result.status,
      title,
      body,
      ...(result.error ? { errorMessage: result.error } : {}),
    });

    return result;
  }

  private async send(
    user: UserWithPreferences,
    channel: Channel,
    title: string,
    body: string
  ): Promise<ChannelDispatchResult> {
    try {
      const provider = this.getProvider(channel);
      const deliveryResult = await provider.send({ userId: user.id, title, body });

      if (!deliveryResult.success) {
        return deliveryResult.error
          ? { channel, status: NotificationStatus.FAILED, error: deliveryResult.error }
          : { channel, status: NotificationStatus.FAILED };
      }

      return { channel, status: NotificationStatus.SUCCESS };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { channel, status: NotificationStatus.FAILED, error };
    }
  }
}
