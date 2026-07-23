import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { validate } from "../../src/middlewares/validate.js";
import { notificationRequestSchema } from "../../src/notifications/notification.schema.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
  };
  const chainable = {
    status(code: number) {
      res.statusCode = code;
      return chainable;
    },
    json(body: unknown) {
      res.body = body;
      return chainable;
    },
  };
  return { res, chainable };
}

describe("validate middleware", () => {
  const middleware = validate(notificationRequestSchema);

  it("calls next() and replaces req.body with the parsed data on a valid payload", () => {
    const req = {
      body: { userId: "u1", title: "Hi", body: "World", channels: ["EMAIL"] },
    } as Request;
    const { res, chainable } = mockRes();
    let nextCalled = false;

    middleware(req, chainable as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(req.body).toEqual({ userId: "u1", title: "Hi", body: "World", channels: ["EMAIL"] });
  });

  it("responds 400 with field details and does not call next() on an invalid payload", () => {
    const req = { body: { title: "" } } as Request;
    const { res, chainable } = mockRes();
    let nextCalled = false;

    middleware(req, chainable as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "Validation failed",
        details: expect.any(Array),
      })
    );
  });
});
