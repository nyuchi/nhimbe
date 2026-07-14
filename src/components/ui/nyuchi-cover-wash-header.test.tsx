import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiCoverWashHeader } from "./nyuchi-cover-wash-header";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

describe("NyuchiCoverWashHeader", () => {
  it("renders the title, meta row and emits the --event-primary wash var", () => {
    const { getByText } = render(
      <NyuchiCoverWashHeader
        title="Harare Jazz Night"
        subtitle="An evening of live music"
        mineral="tanzanite"
        date="Sat, Aug 2"
        location="The Kopje"
        host="Harare Runners"
      />,
    );
    const root = document.querySelector('[data-slot="nyuchi-cover-wash-header"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(getByText("Harare Jazz Night")).toBeTruthy();
    expect(getByText("An evening of live music")).toBeTruthy();
    expect(getByText("Sat, Aug 2")).toBeTruthy();
    // The whole point of the component: it seeds --event-primary + --wash.
    expect(root.style.getPropertyValue("--event-primary")).toContain("--color-tanzanite");
    expect(root.style.getPropertyValue("--wash")).toContain("color-mix");
  });

  it("renders the gradient variant and a CTA slot", () => {
    const { getByText } = render(
      <NyuchiCoverWashHeader title="Book Club" accent="var(--color-cobalt)">
        <button>RSVP</button>
      </NyuchiCoverWashHeader>,
    );
    const root = document.querySelector('[data-slot="nyuchi-cover-wash-header"]') as HTMLElement;
    expect(root.getAttribute("data-variant")).toBe("gradient");
    expect(getByText("RSVP")).toBeTruthy();
  });
});
