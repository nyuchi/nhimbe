import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { NyuchiCalendar } from "./nyuchi-calendar";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

const july2026 = new Date(2026, 6, 1);

// The event-dot color depends on whether the event day is "today"
// (today/selected days render a primary-foreground dot instead of the
// mineral). Pin the clock so the assertion is deterministic on every
// calendar date — this test previously failed only when run ON July 15.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 6, 1, 12));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("NyuchiCalendar", () => {
  it("renders the month label and a full grid of day buttons", () => {
    const { getByText, getAllByRole } = render(<NyuchiCalendar defaultMonth={july2026} />);
    expect(getByText("July 2026")).toBeTruthy();
    // 31 day buttons + 2 nav buttons.
    expect(getAllByRole("button").length).toBe(33);
  });

  it("marks days that have events with a mineral dot and a11y label", () => {
    const { getByLabelText } = render(
      <NyuchiCalendar defaultMonth={july2026} events={[{ date: "2026-07-15", mineral: "cobalt" }]} />,
    );
    const day15 = getByLabelText("July 2026 15, 1 event");
    expect(day15).toBeTruthy();
    const dot = day15.querySelector("div");
    expect(dot?.getAttribute("style")).toContain("--color-cobalt");
  });

  it("navigates months", () => {
    const { getByText, getByLabelText } = render(<NyuchiCalendar defaultMonth={july2026} />);
    fireEvent.click(getByLabelText("Next month"));
    expect(getByText("August 2026")).toBeTruthy();
    fireEvent.click(getByLabelText("Previous month"));
    fireEvent.click(getByLabelText("Previous month"));
    expect(getByText("June 2026")).toBeTruthy();
  });

  it("renders the agenda for the selected day via the render prop", () => {
    const { getByTestId } = render(
      <NyuchiCalendar
        defaultMonth={july2026}
        selectedDate={new Date(2026, 6, 15)}
        events={[{ date: "2026-07-15", mineral: "gold" }]}
        renderAgenda={(date, evs) => <div data-testid="agenda">{`${date.getDate()}:${evs.length}`}</div>}
      />,
    );
    expect(getByTestId("agenda").textContent).toBe("15:1");
  });

  it("updates the agenda when a day is clicked", () => {
    const { getByLabelText, getByTestId } = render(
      <NyuchiCalendar
        defaultMonth={july2026}
        renderAgenda={(date, evs) => <div data-testid="agenda">{`${date.getDate()}:${evs.length}`}</div>}
      />,
    );
    fireEvent.click(getByLabelText("July 2026 9"));
    expect(getByTestId("agenda").textContent).toBe("9:0");
  });

  it("renders a loading skeleton", () => {
    const { container } = render(<NyuchiCalendar loading />);
    const el = container.querySelector('[data-slot="nyuchi-calendar"]');
    expect(el?.hasAttribute("data-loading")).toBe(true);
    expect(within(el as HTMLElement).queryByText("July 2026")).toBeNull();
  });
});
