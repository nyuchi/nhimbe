import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  renderEventCard,
  renderEventCarousel,
  renderEventsText,
} from "../mcp/render";
import type { AppEvent } from "../mcp/app-api";

const sample = (over: Partial<AppEvent> = {}): AppEvent => ({
  id: "evt_1",
  slug: "sunset-sessions",
  name: "Sunset Sessions",
  startDate: "2026-08-01T18:00:00Z",
  location: { name: "Harare Gardens", addressLocality: "Harare" },
  category: "Music",
  attendeeCount: 42,
  ...over,
});

describe("escapeHtml", () => {
  it("neutralizes HTML-significant characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });
});

describe("renderEventCard", () => {
  it("renders the event name, when, where and a nhimbe link", () => {
    const html = renderEventCard(sample());
    expect(html).toContain("Sunset Sessions");
    expect(html).toContain("Harare");
    expect(html).toContain("https://nhimbe.com/events/sunset-sessions");
  });

  it("escapes a malicious event name", () => {
    const html = renderEventCard(sample({ name: `<script>evil()</script>` }));
    expect(html).not.toContain("<script>evil()");
    expect(html).toContain("&lt;script&gt;");
  });

  it("labels free events as Free and paid events with their price", () => {
    expect(renderEventCard(sample())).toContain("Free");
    expect(
      renderEventCard(sample({ offers: { price: 15, priceCurrency: "USD" } })),
    ).toContain("USD 15");
  });
});

describe("renderEventCarousel", () => {
  it("renders a single card when there is one event (no scroll row)", () => {
    const html = renderEventCarousel([sample()]);
    expect(html).toContain("Sunset Sessions");
    expect(html).not.toContain("overflow-x:auto");
  });

  it("renders a scrolling row for multiple events with a heading", () => {
    const html = renderEventCarousel([sample(), sample({ id: "evt_2", name: "Jazz Night" })], "Near you");
    expect(html).toContain("overflow-x:auto");
    expect(html).toContain("Near you");
    expect(html).toContain("Jazz Night");
  });

  it("renders an empty-state message when there are no events", () => {
    expect(renderEventCarousel([])).toContain("No matching events");
  });
});

describe("renderEventsText", () => {
  it("produces a numbered plain-text list with links", () => {
    const text = renderEventsText([sample()]);
    expect(text).toContain("1. Sunset Sessions");
    expect(text).toContain("https://nhimbe.com/events/sunset-sessions");
  });
});
