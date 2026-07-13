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

  it("renders the branded share card with a labelled modal dialog", () => {
    const { baseElement } = render(
      <ShareDialog open onOpenChange={() => {}} url="https://nhimbe.com/e/abc" title="Hi" />
    );
    const card = baseElement.querySelector('[data-slot="nyuchi-share-card"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute("role")).toBe("dialog");
    expect(card?.getAttribute("aria-modal")).toBe("true");
    // Copy-link + the three external targets render as action buttons.
    const buttons = card?.querySelectorAll("button");
    expect((buttons?.length ?? 0)).toBeGreaterThanOrEqual(4);
  });

  it("is not rendered when closed", () => {
    const { baseElement } = render(
      <ShareDialog open={false} onOpenChange={() => {}} url="https://nhimbe.com/e/abc" />
    );
    expect(baseElement.querySelector('[data-slot="nyuchi-share-card"]')).toBeNull();
  });
});
