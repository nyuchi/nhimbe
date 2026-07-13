import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiProgrammeItem } from "./nyuchi-programme-item";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function item() {
  return document.querySelector('[data-slot="nyuchi-programme-item"]');
}

describe("NyuchiProgrammeItem", () => {
  it("renders the time, title, speaker, and role", () => {
    const { getByText } = render(
      <NyuchiProgrammeItem time="10:00" title="Keynote" speaker="Ada" speakerRole="Host" description="Opening remarks" />,
    );
    expect(getByText("10:00")).toBeTruthy();
    expect(getByText("Keynote")).toBeTruthy();
    expect(getByText("Ada")).toBeTruthy();
    expect(getByText("· Host")).toBeTruthy();
    expect(getByText("Opening remarks")).toBeTruthy();
    expect(item()?.getAttribute("role")).toBe("listitem");
  });

  it("applies the mineral color to the timeline dot", () => {
    render(<NyuchiProgrammeItem time="11:00" title="Panel" mineral="cobalt" />);
    const dot = item()?.querySelector(".rounded-full");
    expect(dot?.getAttribute("style")).toContain("--color-cobalt");
  });

  it("drops the connector line on the last item", () => {
    const { rerender } = render(<NyuchiProgrammeItem time="9" title="A" isLast={false} />);
    expect(item()?.querySelector(".bg-border")).not.toBeNull();
    rerender(<NyuchiProgrammeItem time="9" title="A" isLast />);
    expect(item()?.querySelector(".bg-border")).toBeNull();
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiProgrammeItem time="" title="" loading />);
    expect(item()?.hasAttribute("data-loading")).toBe(true);
    expect(item()?.className).toContain("animate-pulse");
  });
});
