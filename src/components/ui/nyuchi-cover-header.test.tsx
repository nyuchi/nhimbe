import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiCoverHeader } from "./nyuchi-cover-header";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-cover-header"]');

describe("NyuchiCoverHeader", () => {
  it("renders the name and subtitle", () => {
    const { getByText } = render(<NyuchiCoverHeader name="Harare Runners" subtitle="Sports circle" />);
    expect(getByText("Harare Runners")).toBeTruthy();
    expect(getByText("Sports circle")).toBeTruthy();
  });

  it("exposes a banner role and renders badge + action slots", () => {
    const { getByText } = render(
      <NyuchiCoverHeader name="X" badge={<span>BADGE</span>} action={<button>Edit</button>} />,
    );
    expect(el()?.getAttribute("role")).toBe("banner");
    expect(getByText("BADGE")).toBeTruthy();
    expect(getByText("Edit")).toBeTruthy();
  });

  it("renders the avatar image when provided", () => {
    render(<NyuchiCoverHeader name="X" avatar="/a.png" />);
    expect(document.querySelector('img[src="/a.png"]')).toBeTruthy();
  });
});
