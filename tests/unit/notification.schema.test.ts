import { describe, expect, it } from "vitest";
import { notificationRequestSchema } from "../../src/notifications/notification.schema.js";

const validPayload = {
  userId: "user-1",
  title: "Welcome",
  body: "Thanks for signing up",
  channels: ["EMAIL", "SMS"],
};

describe("notificationRequestSchema", () => {
  it("accepts a fully valid payload", () => {
    const result = notificationRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validPayload);
  });

  it.each(["userId", "title", "body"] as const)("rejects a payload missing %s", (field) => {
    const { [field]: _omitted, ...payload } = validPayload;
    const result = notificationRequestSchema.safeParse(payload);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === field)).toBe(true);
  });

  it("rejects an empty channels array", () => {
    const result = notificationRequestSchema.safeParse({ ...validPayload, channels: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "channels")).toBe(true);
  });

  it("rejects a channels array containing an unknown channel value", () => {
    const result = notificationRequestSchema.safeParse({ ...validPayload, channels: ["FAX"] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "channels.0")).toBe(true);
  });

  it("rejects an empty string for a required text field", () => {
    const result = notificationRequestSchema.safeParse({ ...validPayload, title: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "title")).toBe(true);
  });
});
