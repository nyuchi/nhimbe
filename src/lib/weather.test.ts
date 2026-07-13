import { describe, it, expect } from "vitest";
import { slugifyLocation, weatherEmbedUrl, WEATHER_EMBED_ORIGIN } from "./weather";

describe("slugifyLocation", () => {
  it("lowercases and hyphenates multi-word cities", () => {
    expect(slugifyLocation("Victoria Falls")).toBe("victoria-falls");
  });

  it("drops a trailing country and extra whitespace", () => {
    expect(slugifyLocation("Harare, Zimbabwe")).toBe("harare");
    expect(slugifyLocation("  Cape Town  ")).toBe("cape-town");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugifyLocation("St. Mary's — Town")).toBe("st-mary-s-town");
  });

  it("returns an empty string for blank input", () => {
    expect(slugifyLocation("")).toBe("");
  });
});

describe("weatherEmbedUrl", () => {
  it("builds the widget URL with type + location slug", () => {
    const url = weatherEmbedUrl("Harare");
    expect(url.startsWith(`${WEATHER_EMBED_ORIGIN}/embed/widget?`)).toBe(true);
    expect(url).toContain("type=current");
    expect(url).toContain("location=harare");
  });

  it("honours the requested widget type", () => {
    expect(weatherEmbedUrl("Bulawayo", "5day")).toContain("type=5day");
    expect(weatherEmbedUrl("Bulawayo", "5day")).toContain("location=bulawayo");
  });
});
