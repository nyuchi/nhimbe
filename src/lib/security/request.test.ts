import { describe, it, expect } from "vitest";
import {
  parseBoundedInt,
  readJsonBody,
  clampString,
  clampStringArray,
  DEFAULT_JSON_BODY_LIMIT,
} from "./request";

describe("parseBoundedInt", () => {
  const opts = { min: 1, max: 100, fallback: 20 };

  it("parses a valid integer", () => {
    expect(parseBoundedInt("42", opts)).toBe(42);
  });

  it("falls back on null/undefined/empty", () => {
    expect(parseBoundedInt(null, opts)).toBe(20);
    expect(parseBoundedInt(undefined, opts)).toBe(20);
    expect(parseBoundedInt("", opts)).toBe(20);
    expect(parseBoundedInt("   ", opts)).toBe(20);
  });

  it("falls back on non-numeric input (NaN guard)", () => {
    expect(parseBoundedInt("abc", opts)).toBe(20);
    expect(parseBoundedInt("12abc", opts)).toBe(20);
    expect(parseBoundedInt("Infinity", opts)).toBe(20);
    expect(parseBoundedInt("NaN", opts)).toBe(20);
  });

  it("clamps to the range", () => {
    expect(parseBoundedInt("0", opts)).toBe(1);
    expect(parseBoundedInt("-5", opts)).toBe(1);
    expect(parseBoundedInt("999999", opts)).toBe(100);
  });

  it("truncates fractional input toward zero before clamping", () => {
    expect(parseBoundedInt("50.9", opts)).toBe(50);
    expect(parseBoundedInt("2.1", opts)).toBe(2);
  });
});

describe("readJsonBody", () => {
  function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
    return new Request("https://x.test/api", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
  }

  it("parses a valid JSON object", async () => {
    const res = await readJsonBody<{ a: number }>(jsonRequest('{"a":1}'));
    expect(res).toEqual({ ok: true, data: { a: 1 } });
  });

  it("rejects empty bodies with 400", async () => {
    const res = await readJsonBody(jsonRequest(""));
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await readJsonBody(jsonRequest("{not json"));
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects an over-cap declared Content-Length with 413 before reading", async () => {
    const res = await readJsonBody(
      jsonRequest('{"a":1}', { "content-length": String(DEFAULT_JSON_BODY_LIMIT + 1) }),
      DEFAULT_JSON_BODY_LIMIT,
    );
    expect(res).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects an over-cap actual body with 413 even without Content-Length", async () => {
    const big = JSON.stringify({ blob: "x".repeat(200) });
    const res = await readJsonBody(jsonRequest(big), 50);
    expect(res).toMatchObject({ ok: false, status: 413 });
  });

  it("accepts a body at exactly the cap", async () => {
    const body = '{"a":1}';
    const bytes = new TextEncoder().encode(body).length;
    const res = await readJsonBody(jsonRequest(body), bytes);
    expect(res).toMatchObject({ ok: true });
  });
});

describe("clampString", () => {
  it("returns short strings unchanged", () => {
    expect(clampString("hello", 10)).toBe("hello");
  });

  it("truncates over-length strings", () => {
    expect(clampString("hello world", 5)).toBe("hello");
  });

  it("collapses non-strings to empty string", () => {
    expect(clampString(123, 5)).toBe("");
    expect(clampString(null, 5)).toBe("");
    expect(clampString(undefined, 5)).toBe("");
    expect(clampString({}, 5)).toBe("");
  });
});

describe("clampStringArray", () => {
  const opts = { maxItems: 3, maxItemLength: 4 };

  it("returns [] for non-arrays", () => {
    expect(clampStringArray("nope", opts)).toEqual([]);
    expect(clampStringArray(null, opts)).toEqual([]);
  });

  it("keeps only strings", () => {
    expect(clampStringArray(["a", 1, "b", null, "c"], opts)).toEqual(["a", "b", "c"]);
  });

  it("caps the number of items", () => {
    expect(clampStringArray(["a", "b", "c", "d", "e"], opts)).toEqual(["a", "b", "c"]);
  });

  it("caps the length of each item", () => {
    expect(clampStringArray(["abcdefg"], opts)).toEqual(["abcd"]);
  });
});
