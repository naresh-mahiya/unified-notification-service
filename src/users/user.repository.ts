import { prisma } from "../db/prisma.js";

export interface UserPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
}

export interface UserWithPreferences {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
}

export async function getUserWithPreferences(userId: string): Promise<UserWithPreferences | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { preference: true },
  });

  if (!user || !user.preference) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    preferences: {
      emailEnabled: user.preference.emailEnabled,
      smsEnabled: user.preference.smsEnabled,
      pushEnabled: user.preference.pushEnabled,
      inAppEnabled: user.preference.inAppEnabled,
    },
  };
}
