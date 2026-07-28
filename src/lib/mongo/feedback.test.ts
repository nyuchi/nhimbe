import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const feedback = { insertOne: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  DB: { system: "system" },
  getCollection: vi.fn(async () => feedback),
}));

import {
  FEEDBACK_CATEGORIES,
  normalizeFeedbackCategory,
  recordFeedback,
} from "./feedback";

beforeEach(() => {
  vi.clearAllMocks();
  feedback.insertOne.mockResolvedValue({ acknowledged: true });
});

describe("normalizeFeedbackCategory", () => {
  it("passes known categories through", () => {
    for (const c of FEEDBACK_CATEGORIES) {
      expect(normalizeFeedbackCategory(c)).toBe(c);
    }
  });

  it("defaults unknown / wrong-typed values to 'other'", () => {
    expect(normalizeFeedbackCategory("nonsense")).toBe("other");
    expect(normalizeFeedbackCategory(undefined)).toBe("other");
    expect(normalizeFeedbackCategory(42)).toBe("other");
  });
});

describe("recordFeedback", () => {
  it("inserts a well-formed doc and reports the new id", async () => {
    const res = await recordFeedback({
      category: "bug",
      message: "It broke",
      path: "/events/123",
      userAgent: "jsdom",
      personId: "person-1",
      contactEmail: "a@b.com",
      authenticated: true,
    });

    expect(res.stored).toBe(true);
    expect(res.id).toBeTruthy();
    expect(feedback.insertOne).toHaveBeenCalledOnce();

    const doc = feedback.insertOne.mock.calls[0][0];
    expect(doc._id).toBe(res.id);
    expect(doc._schemaVersion).toBeTruthy();
    expect(doc.category).toBe("bug");
    expect(doc.message).toBe("It broke");
    expect(doc.status).toBe("open");
    expect(doc.authenticated).toBe(true);
    expect(doc.personId).toBe("person-1");
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  it("omits optional fields when not provided", async () => {
    await recordFeedback({ category: "idea", message: "Do this", authenticated: false });
    const doc = feedback.insertOne.mock.calls[0][0];
    expect("path" in doc).toBe(false);
    expect("personId" in doc).toBe(false);
    expect("contactEmail" in doc).toBe(false);
    expect(doc.authenticated).toBe(false);
  });

  it("never throws — a write failure returns stored:false with the reason", async () => {
    feedback.insertOne.mockRejectedValueOnce(new Error("validator rejected"));
    const res = await recordFeedback({ category: "other", message: "hi", authenticated: false });
    expect(res.stored).toBe(false);
    expect(res.error).toContain("validator rejected");
  });
});
