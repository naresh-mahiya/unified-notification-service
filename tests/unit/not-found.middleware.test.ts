import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { notFoundHandler } from "../../src/middlewares/not-found.js";

describe("notFoundHandler", () => {
  it("responds 404 with the attempted method and path", () => {
    const req = { method: "GET", originalUrl: "/does-not-exist" } as Request;
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

    notFoundHandler(req, chainable as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Route not found: GET /does-not-exist" });
  });
});
