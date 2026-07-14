import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { NyuchiMetaTile } from "./nyuchi-meta-tile";

afterEach(cleanup);

describe("NyuchiMetaTile", () => {
  it("renders a date chip with primary + secondary lines", () => {
    const { getByText } = render(
      <NyuchiMetaTile date={{ month: "August", day: 2 }} primary="Sat, Aug 2" secondary="9:00 AM" />,
    );
    expect(document.querySelector('[data-slot="nyuchi-meta-tile"]')).toBeTruthy();
    expect(getByText("Aug")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
    expect(getByText("Sat, Aug 2")).toBeTruthy();
    expect(getByText("9:00 AM")).toBeTruthy();
  });

  it("renders an icon chip variant with a caption and trailing slot", () => {
    const { getByText } = render(
      <NyuchiMetaTile
        icon={MapPin}
        caption="Where"
        primary="The Kopje"
        secondary="Harare, Zimbabwe"
        trailing={<button>Go</button>}
      />,
    );
    expect(getByText("Where")).toBeTruthy();
    expect(getByText("The Kopje")).toBeTruthy();
    expect(getByText("Go")).toBeTruthy();
  });
});
