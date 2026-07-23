import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";

describe("POST /api/notifications", () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Test User",
        email: `test-user-${Date.now()}@example.com`,
        preference: {
          create: { emailEnabled: true, smsEnabled: true, pushEnabled: true, inAppEnabled: true },
        },
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.notificationPreference.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it("accepts a valid payload for an existing user and echoes it back", async () => {
    const payload = {
      userId: testUserId,
      title: "Welcome",
      body: "Thanks for signing up",
      channels: ["EMAIL", "SMS"],
    };

    const res = await request(app).post("/api/notifications").send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(payload);
  });

  it("rejects a payload missing title", async () => {
    const res = await request(app)
      .post("/api/notifications")
      .send({
        userId: testUserId,
        body: "Thanks for signing up",
        channels: ["EMAIL"],
      });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "title" })])
    );
  });

  it("returns 404 when the user does not exist", async () => {
    const res = await request(app).post("/api/notifications").send({
      userId: "does-not-exist",
      title: "Welcome",
      body: "Thanks for signing up",
      channels: ["EMAIL"],
    });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
  });
});
