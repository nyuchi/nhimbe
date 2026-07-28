import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveActingPerson, recordFeedback, sendEmail } = vi.hoisted(() => ({
  resolveActingPerson: vi.fn(),
  recordFeedback: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/auth/current-person", () => ({ resolveActingPerson }));

vi.mock("@/lib/mongo/feedback", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mongo/feedback")>(
    "@/lib/mongo/feedback",
  );
  return { ...actual, recordFeedback };
});

vi.mock("@/lib/email/resend", () => ({ sendEmail }));

import { submitFeedback } from "./feedback";

beforeEach(() => {
  vi.clearAllMocks();
  resolveActingPerson.mockResolvedValue(null);
  recordFeedback.mockResolvedValue({ stored: true, id: "fb-1" });
  sendEmail.mockResolvedValue({ success: true, id: "email-1" });
});

describe("submitFeedback", () => {
  it("rejects an empty message without touching the sinks", async () => {
    const res = await submitFeedback({ message: "   ", category: "bug" });
    expect(res.success).toBe(false);
    expect(recordFeedback).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("records + emails an anonymous report with captured context", async () => {
    const res = await submitFeedback({
      message: "Broken button",
      category: "bug",
      email: "guest@example.com",
      path: "/events/1",
      userAgent: "jsdom",
    });

    expect(res.success).toBe(true);
    const record = recordFeedback.mock.calls[0][0];
    expect(record.authenticated).toBe(false);
    expect(record.contactEmail).toBe("guest@example.com");
    expect(record.path).toBe("/events/1");
    expect(record.category).toBe("bug");

    expect(sendEmail).toHaveBeenCalledOnce();
    const email = sendEmail.mock.calls[0][0];
    expect(email.replyTo).toBe("guest@example.com");
  });

  it("attaches the acting person and ignores a supplied email when signed in", async () => {
    resolveActingPerson.mockResolvedValue({
      _id: "person-9",
      email: "member@nhimbe.com",
      name: "Ada",
    });
    await submitFeedback({ message: "Idea!", category: "idea", email: "spoof@evil.com" });

    const record = recordFeedback.mock.calls[0][0];
    expect(record.authenticated).toBe(true);
    expect(record.personId).toBe("person-9");
    expect(record.contactEmail).toBe("member@nhimbe.com");
  });

  it("normalizes an unknown category to 'other'", async () => {
    await submitFeedback({ message: "hmm", category: "garbage" });
    expect(recordFeedback.mock.calls[0][0].category).toBe("other");
  });

  it("drops an invalid signed-out email rather than storing it", async () => {
    await submitFeedback({ message: "hi", category: "other", email: "not-an-email" });
    expect(recordFeedback.mock.calls[0][0].contactEmail).toBeUndefined();
  });

  it("still succeeds when the store fails but email works", async () => {
    recordFeedback.mockResolvedValue({ stored: false, error: "down" });
    const res = await submitFeedback({ message: "hi", category: "bug" });
    expect(res.success).toBe(true);
  });

  it("still succeeds when email fails but the store works", async () => {
    sendEmail.mockResolvedValue({ success: false, error: "no key" });
    const res = await submitFeedback({ message: "hi", category: "bug" });
    expect(res.success).toBe(true);
  });

  it("fails gracefully when BOTH sinks fail — never throws", async () => {
    recordFeedback.mockResolvedValue({ stored: false, error: "down" });
    sendEmail.mockResolvedValue({ success: false, error: "no key" });
    const res = await submitFeedback({ message: "hi", category: "bug" });
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("survives a resolver that throws (something is already broken)", async () => {
    resolveActingPerson.mockRejectedValue(new Error("session boom"));
    const res = await submitFeedback({ message: "report", category: "bug" });
    expect(res.success).toBe(true);
    expect(recordFeedback.mock.calls[0][0].authenticated).toBe(false);
  });
});
