import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { ShareDialog } from "./share-dialog";

describe("ShareDialog accessibility", () => {
  it("has no a11y violations when open with a description", async () => {
    const { baseElement } = render(
      <ShareDialog
        open
        onOpenChange={() => {}}
        url="https://nhimbe.com/e/abc"
        title="Share this event"
        description="Send a link to your friends"
      />
    );
    // baseElement is needed because Radix portals the dialog outside
    // the rendered container into document.body.
    const results = await axe(baseElement);
    expect(results).toHaveNoViolations();
  });

  it("has no a11y violations when open without a description", async () => {
    const { baseElement } = render(
      <ShareDialog open onOpenChange={() => {}} url="https://nhimbe.com/e/abc" />
    );
    const results = await axe(baseElement);
    expect(results).toHaveNoViolations();
  });

  it("renders each channel link with rel='noopener noreferrer'", () => {
    const { baseElement } = render(
      <ShareDialog open onOpenChange={() => {}} url="https://nhimbe.com/e/abc" title="Hi" />
    );
    const channels = baseElement.querySelector('[data-slot="share-dialog-channels"]');
    const links = channels?.querySelectorAll("a");
    expect(links?.length).toBeGreaterThan(0);
    links?.forEach((a) => {
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.getAttribute("target")).toBe("_blank");
    });
  });
});
