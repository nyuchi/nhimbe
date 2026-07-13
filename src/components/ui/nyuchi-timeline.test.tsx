import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiTimeline, type TimelineItem } from "./nyuchi-timeline";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

const items: TimelineItem[] = [
  { id: "a", date: "2026-08-02", time: "9:00 AM", title: "Sunday Run", host: "Harare Runners", location: "The Kopje" },
  { id: "b", date: "2026-08-02", time: "2:00 PM", title: "Afternoon Jam", location: "Studio 7" },
  { id: "c", date: "2026-08-05", title: "Book Club", location: "Library" },
];

describe("NyuchiTimeline", () => {
  it("groups rows by day into date-railed sections", () => {
    render(<NyuchiTimeline items={items} />);
    expect(document.querySelector('[data-slot="nyuchi-timeline"]')).toBeTruthy();
    // Two distinct days → two date-rail groups.
    const groups = document.querySelectorAll('[data-slot="nyuchi-timeline"] > div');
    expect(groups.length).toBe(2);
    // All three rows render.
    expect(document.querySelectorAll('[data-slot="nyuchi-timeline-row"]').length).toBe(3);
  });

  it("renders time · title · host · location on a row", () => {
    const { getByText } = render(<NyuchiTimeline items={[items[0]]} />);
    expect(getByText("Sunday Run")).toBeTruthy();
    expect(getByText("9:00 AM")).toBeTruthy();
    expect(getByText("Harare Runners")).toBeTruthy();
    expect(getByText("The Kopje")).toBeTruthy();
  });

  it("renders the loading skeleton and empty state", () => {
    const { rerender, getByText } = render(<NyuchiTimeline items={[]} loading />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    rerender(<NyuchiTimeline items={[]} emptyState={<p>Nothing yet</p>} />);
    expect(getByText("Nothing yet")).toBeTruthy();
  });
});
