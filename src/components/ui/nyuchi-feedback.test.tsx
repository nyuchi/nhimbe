import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiEmptyState } from "./nyuchi-empty-state";
import { NyuchiAlertBanner } from "./nyuchi-alert-banner";
import { NyuchiNotificationItem } from "./nyuchi-notification-item";
import { NyuchiOnboardingStep } from "./nyuchi-onboarding-step";
import { NyuchiSuccessScreen } from "./nyuchi-success-screen";
import { NyuchiActionSheet } from "./nyuchi-action-sheet";
import { NyuchiShareCard } from "./nyuchi-share-card";
import { NyuchiContentComposer } from "./nyuchi-content-composer";

afterEach(cleanup);

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);

describe("NyuchiEmptyState", () => {
  it("composes the Empty primitive and renders title/description", () => {
    render(<NyuchiEmptyState title="No events found" description="Try adjusting filters" />);
    const el = slot("nyuchi-empty-state");
    expect(el).not.toBeNull();
    // Built on the Empty family — reuses the empty parts, not a re-impl.
    expect(el?.getAttribute("data-slot")).toBe("nyuchi-empty-state");
    expect(slot("empty-title")?.textContent).toBe("No events found");
    expect(slot("empty-description")?.textContent).toBe("Try adjusting filters");
  });

  it("defaults the mineral cue to tanzanite and fires both actions", () => {
    const onAction = vi.fn();
    const onSecondary = vi.fn();
    render(
      <NyuchiEmptyState
        icon={<svg />}
        title="Empty"
        actionLabel="Primary"
        onAction={onAction}
        secondaryLabel="Secondary"
        onSecondary={onSecondary}
      />,
    );
    expect(slot("nyuchi-empty-state")?.getAttribute("data-mineral")).toBe("tanzanite");
    fireEvent.click(document.querySelector("button")!);
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe("NyuchiAlertBanner", () => {
  it("renders the severity label + role=alert and dismisses", () => {
    const onDismiss = vi.fn();
    render(
      <NyuchiAlertBanner
        type="Event update"
        severity="severe"
        headline="This event has been cancelled"
        onDismiss={onDismiss}
      />,
    );
    const el = slot("nyuchi-alert-banner");
    expect(el?.getAttribute("role")).toBe("alert");
    expect(el?.getAttribute("data-severity")).toBe("severe");
    expect(el?.textContent).toContain("This event has been cancelled");
    fireEvent.click(document.querySelector('[aria-label="Dismiss alert"]')!);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("NyuchiNotificationItem", () => {
  it("renders a loading skeleton", () => {
    render(<NyuchiNotificationItem type="event" title="x" timestamp="now" loading />);
    expect(slot("nyuchi-notification-item")?.getAttribute("data-loading")).not.toBeNull();
  });

  it("marks unread rows and fires onClick", () => {
    const onClick = vi.fn();
    render(
      <NyuchiNotificationItem
        type="like"
        title="Ada liked your event"
        timestamp="2m"
        onClick={onClick}
      />,
    );
    const el = slot("nyuchi-notification-item");
    expect(el?.getAttribute("data-read")).toBe("false");
    fireEvent.click(el!);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("NyuchiOnboardingStep", () => {
  it("renders children in the slot and fires onNext", () => {
    const onNext = vi.fn();
    render(
      <NyuchiOnboardingStep title="Welcome" description="Let's go" onNext={onNext}>
        <input aria-label="name" />
      </NyuchiOnboardingStep>,
    );
    expect(slot("nyuchi-onboarding-step")).not.toBeNull();
    expect(document.querySelector('[aria-label="name"]')).not.toBeNull();
    fireEvent.click(document.querySelector("button")!);
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe("NyuchiSuccessScreen", () => {
  it("announces politely and fires the primary action", () => {
    const onClick = vi.fn();
    render(
      <NyuchiSuccessScreen
        title="Event published!"
        message="It's live"
        primaryAction={{ label: "View event", onClick }}
      />,
    );
    const el = slot("nyuchi-success-screen");
    expect(el?.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(document.querySelector("button")!);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("NyuchiActionSheet", () => {
  it("renders nothing when closed", () => {
    render(<NyuchiActionSheet open={false} onClose={() => {}} actions={[]} />);
    expect(slot("nyuchi-action-sheet")).toBeNull();
  });

  it("runs an action then closes", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <NyuchiActionSheet
        open
        onClose={onClose}
        title="Guest"
        actions={[{ id: "approve", label: "Approve", onSelect }]}
      />,
    );
    const el = slot("nyuchi-action-sheet");
    expect(el?.getAttribute("aria-modal")).toBe("true");
    const approve = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Approve",
    )!;
    fireEvent.click(approve);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("NyuchiShareCard", () => {
  it("exposes the deep link and fires copy without closing", () => {
    const onCopyLink = vi.fn();
    const onClose = vi.fn();
    render(
      <NyuchiShareCard
        open
        onClose={onClose}
        title="My event"
        url="https://nhimbe.com/e/abc"
        onCopyLink={onCopyLink}
      />,
    );
    const el = slot("nyuchi-share-card");
    expect(el?.getAttribute("data-url")).toBe("https://nhimbe.com/e/abc");
    const copy = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Copy link"),
    )!;
    fireEvent.click(copy);
    expect(onCopyLink).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("NyuchiContentComposer", () => {
  it("submits trimmed text and clears the field", () => {
    const onSubmit = vi.fn();
    render(<NyuchiContentComposer onSubmit={onSubmit} submitLabel="Post" showToolbar={false} />);
    const textarea = document.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "  hello kraal  " } });
    const post = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Post",
    )!;
    fireEvent.click(post);
    expect(onSubmit).toHaveBeenCalledWith("hello kraal");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("disables submit when empty", () => {
    render(<NyuchiContentComposer onSubmit={() => {}} submitLabel="Post" showToolbar={false} />);
    const post = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Post",
    ) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
  });
});
