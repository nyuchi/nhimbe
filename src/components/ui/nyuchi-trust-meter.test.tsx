import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiTrustMeter } from "./nyuchi-trust-meter";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-trust-meter"]');

describe("NyuchiTrustMeter", () => {
  it("renders the composite score with meter semantics", () => {
    const { getByText } = render(<NyuchiTrustMeter trustScore={0.35} />);
    expect(getByText("0.350")).toBeTruthy();
    expect(el()?.getAttribute("role")).toBe("meter");
    expect(el()?.getAttribute("aria-valuenow")).toBe("0.35");
  });

  it("renders the signal breakdown unless compact", () => {
    const { getByText, rerender } = render(
      <NyuchiTrustMeter trustScore={0.3} verificationScore={0.2} ubuntuScore={0.1} ubuntuPoints={42} />,
    );
    expect(getByText("Verification")).toBeTruthy();
    expect(getByText("Ubuntu")).toBeTruthy();
    rerender(<NyuchiTrustMeter trustScore={0.3} compact />);
    expect(document.querySelector('[data-slot="nyuchi-trust-meter"]')?.textContent).not.toContain("Verification");
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiTrustMeter trustScore={0} loading />);
    expect(el()?.hasAttribute("data-loading")).toBe(true);
  });
});
