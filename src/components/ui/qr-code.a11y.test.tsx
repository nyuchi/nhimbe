import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { QRCode } from "./qr-code";

describe("QRCode accessibility", () => {
  it("has no a11y violations when rendered with a value", async () => {
    const { container } = render(<QRCode value="https://nhimbe.com/e/abc" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("exposes an accessible name on the canvas", () => {
    const { container } = render(<QRCode value="https://nhimbe.com/e/abc" />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    // axe-core flags canvases that are part of UX without an accessible
    // name. We require either role="img" + aria-label, or aria-label
    // alone, so SRs announce the QR target.
    const hasAccessibleName =
      !!canvas?.getAttribute("aria-label") || !!canvas?.getAttribute("aria-labelledby");
    expect(hasAccessibleName).toBe(true);
  });
});
