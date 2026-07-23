import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { getUserWithPreferences } from "../../src/users/user.repository.js";

describe("getUserWithPreferences", () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Repo Test User",
        email: `repo-test-${Date.now()}@example.com`,
        preference: {
          create: { emailEnabled: true, smsEnabled: false, pushEnabled: true, inAppEnabled: true },
        },
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.notificationPreference.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it("returns the user with their preferences when found", async () => {
    const result = await getUserWithPreferences(testUserId);

    expect(result).toEqual({
      id: testUserId,
      name: "Repo Test User",
      email: expect.stringContaining("repo-test-"),
      preferences: {
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        inAppEnabled: true,
      },
    });
  });

  it("returns null when the user does not exist", async () => {
    const result = await getUserWithPreferences("does-not-exist");
    expect(result).toBeNull();
  });
});
