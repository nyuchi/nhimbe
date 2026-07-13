import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiSourceBadge } from "./nyuchi-source-badge";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-source-badge"]');

describe("NyuchiSourceBadge", () => {
  it("renders the source name and a credibility title", () => {
    const { getByText } = render(<NyuchiSourceBadge sourceName="The Herald" credibility="verified" />);
    expect(getByText("The Herald")).toBeTruthy();
    expect(el()?.getAttribute("title")).toBe("Verified Source");
  });

  it("shows the label text when showLabel is set", () => {
    const { getByText } = render(
      <NyuchiSourceBadge sourceName="X" credibility="disputed" showLabel />,
    );
    expect(getByText("Disputed Source")).toBeTruthy();
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiSourceBadge sourceName="X" loading />);
    expect(el()?.hasAttribute("data-loading")).toBe(true);
  });
});
