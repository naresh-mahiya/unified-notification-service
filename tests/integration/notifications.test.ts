import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("POST /api/notifications", () => {
  it("accepts a valid payload and echoes it back", async () => {
    const payload = {
      userId: "user-1",
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
        userId: "user-1",
        body: "Thanks for signing up",
        channels: ["EMAIL"],
      });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "title" })])
    );
  });
});
