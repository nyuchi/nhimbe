import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import { ResponsiveModal } from "./responsive-modal";

// Force the desktop (Dialog) and mobile (Drawer) branches by overriding
// useIsMobile. We test both code paths because they render different DOM.
const mockUseIsMobile = vi.fn();
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

describe("ResponsiveModal accessibility", () => {
  it("desktop dialog variant has no a11y violations when open", async () => {
    mockUseIsMobile.mockReturnValue(false);
    const { baseElement } = render(
      <ResponsiveModal
        open
        onOpenChange={() => {}}
        title="Edit description"
        description="Tell guests what to expect"
      >
        <p>Modal body</p>
      </ResponsiveModal>
    );
    const results = await axe(baseElement);
    expect(results).toHaveNoViolations();
  });

  it("desktop dialog without description still has accessible name", async () => {
    mockUseIsMobile.mockReturnValue(false);
    const { baseElement } = render(
      <ResponsiveModal open onOpenChange={() => {}} title="Untitled-ish but titled">
        <p>Body</p>
      </ResponsiveModal>
    );
    const results = await axe(baseElement);
    expect(results).toHaveNoViolations();
  });

  it("mobile drawer variant has no a11y violations when open", async () => {
    mockUseIsMobile.mockReturnValue(true);
    const { baseElement } = render(
      <ResponsiveModal
        open
        onOpenChange={() => {}}
        title="Pick a category"
        description="Helps guests find your event"
      >
        <p>Drawer body</p>
      </ResponsiveModal>
    );
    const results = await axe(baseElement);
    expect(results).toHaveNoViolations();
  });
});
