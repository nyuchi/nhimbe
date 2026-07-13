import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiProfileBlock } from "./nyuchi-profile-block";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-profile-block"]');

describe("NyuchiProfileBlock", () => {
  it("renders name, subtitle and stats", () => {
    const { getByText } = render(
      <NyuchiProfileBlock
        name="Tendai Moyo"
        subtitle="Harare, Zimbabwe"
        stats={[
          { label: "Hosted", value: 12 },
          { label: "Attended", value: 34 },
        ]}
      />,
    );
    expect(getByText("Tendai Moyo")).toBeTruthy();
    expect(getByText("Harare, Zimbabwe")).toBeTruthy();
    expect(getByText("Hosted")).toBeTruthy();
  });

  it("shows the trust breakdown when a tier or score is present", () => {
    const { getByText } = render(
      <NyuchiProfileBlock
        name="X"
        verificationTier="licensed"
        platformStatus="living"
        trustScore={0.5}
        ubuntuPoints={120}
      />,
    );
    expect(getByText("Licensed Professional")).toBeTruthy();
    expect(getByText("Active")).toBeTruthy();
    expect(getByText("0.500")).toBeTruthy();
  });

  it("renders a custom verified badge slot", () => {
    const { getByText } = render(
      <NyuchiProfileBlock name="X" verificationTier="community" verifiedBadge={<span>BADGE</span>} />,
    );
    expect(getByText("BADGE")).toBeTruthy();
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiProfileBlock name="X" loading />);
    expect(el()?.hasAttribute("data-loading")).toBe(true);
  });
});
