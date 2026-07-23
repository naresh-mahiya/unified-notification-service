import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";

describe("notification history", () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "History Test User",
        email: `history-test-${Date.now()}@example.com`,
        preference: {
          create: { emailEnabled: true, smsEnabled: false, pushEnabled: true, inAppEnabled: true },
        },
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { userId: testUserId } });
    await prisma.notificationPreference.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
  });

  it("records one log row per channel outcome, and GET /:userId/history returns them", async () => {
    const dispatchRes = await request(app).post("/api/notifications").send({
      userId: testUserId,
      title: "Order Shipped",
      body: "Your order is on its way",
      channels: ["EMAIL", "SMS"],
    });
    expect(dispatchRes.status).toBe(201);

    const historyRes = await request(app).get(`/api/notifications/${testUserId}/history`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.userId).toBe(testUserId);
    expect(historyRes.body.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "EMAIL", status: "SUCCESS", title: "Order Shipped" }),
        expect.objectContaining({ channel: "SMS", status: "SKIPPED", title: "Order Shipped" }),
      ])
    );
  });

  it("returns 404 when requesting history for a user that does not exist", async () => {
    const res = await request(app).get("/api/notifications/does-not-exist/history");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
  });
});
