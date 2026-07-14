import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiSearchView, type SearchResultItem } from "./nyuchi-search-view";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function view() {
  return document.querySelector('[data-slot="nyuchi-search-view"]');
}

const results: SearchResultItem[] = [
  { id: "e1", title: "Sunday Run", category: "Sport", mineral: "malachite", href: "/events/e1" },
  { id: "p1", kind: "place", name: "Harare Gardens", rating: 4.5, mineral: "gold", href: "/places/p1" },
];

describe("NyuchiSearchView", () => {
  it("shows recent and trending discovery when the query is empty", () => {
    const { getByText } = render(
      <NyuchiSearchView query="" onQueryChange={() => {}} recentSearches={["jazz"]} trending={["marathon"]} />,
    );
    expect(view()).toBeTruthy();
    expect(getByText("jazz")).toBeTruthy();
    expect(getByText("marathon")).toBeTruthy();
  });

  it("renders listing + place result cards when a query is present", () => {
    const { getByText } = render(
      <NyuchiSearchView query="run" onQueryChange={() => {}} results={results} />,
    );
    expect(getByText("Sunday Run")).toBeTruthy();
    expect(getByText("Harare Gardens")).toBeTruthy();
    expect(getByText(/2 results for/)).toBeTruthy();
    expect(document.querySelector('[data-slot="nyuchi-place-card"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="nyuchi-listing-card"]')).toBeTruthy();
  });

  it("shows an empty state when a query returns nothing", () => {
    const { getByText } = render(<NyuchiSearchView query="zzz" onQueryChange={() => {}} results={[]} />);
    expect(getByText("No results found")).toBeTruthy();
  });

  it("clears the query via the clear button", () => {
    const onQueryChange = vi.fn();
    const { getByLabelText } = render(<NyuchiSearchView query="run" onQueryChange={onQueryChange} />);
    fireEvent.click(getByLabelText("Clear search"));
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("renders results as a timeline when timeline mode is on (listings only)", () => {
    const listings: SearchResultItem[] = [
      { id: "e1", title: "Sunday Run", href: "/events/e1", date: "2026-08-02", time: "9:00 AM" },
      { id: "e2", title: "Book Club", href: "/events/e2", date: "2026-08-03" },
    ];
    const { getByText } = render(
      <NyuchiSearchView query="run" onQueryChange={() => {}} results={listings} timeline />,
    );
    expect(document.querySelector('[data-slot="nyuchi-timeline"]')).toBeTruthy();
    expect(getByText("Sunday Run")).toBeTruthy();
    expect(getByText("Book Club")).toBeTruthy();
  });

  it("renders category filter chips and an AI summary", () => {
    const { getByText } = render(
      <NyuchiSearchView
        query="run"
        onQueryChange={() => {}}
        results={results}
        aiSummary="Two matches near you."
        categories={[{ id: "concerts", label: "Concerts" }]}
      />,
    );
    const chips = Array.from(document.querySelectorAll('[data-slot="filter-chip"]')).map((c) => c.textContent);
    expect(chips).toContain("Concerts");
    expect(getByText("Two matches near you.")).toBeTruthy();
  });
});
