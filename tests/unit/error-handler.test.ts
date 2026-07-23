import { afterEach, describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { errorHandler } from "../../src/middlewares/error-handler.js";
import { AppError } from "../../src/utils/app-error.js";

function mockRes() {
  const res = { statusCode: 200, body: undefined as unknown };
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

describe("errorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps an AppError to its own status code and message", () => {
    const { res, chainable } = mockRes();

    errorHandler(new AppError(403, "Forbidden"), {} as any, chainable as unknown as Response, () => {});

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
  });

  it("maps an unexpected error to a generic 500 without leaking its message, but still logs it server-side", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, chainable } = mockRes();
    const unexpected = new Error("connection string contains a password");

    errorHandler(unexpected, {} as any, chainable as unknown as Response, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("password");
    expect(consoleSpy).toHaveBeenCalledWith(unexpected);
  });
});
