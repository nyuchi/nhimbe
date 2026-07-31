import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { PublishBar } from "./nyuchi-create-listing";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

describe("nyuchi-create-listing shell", () => {
  it("PublishBar fires onPublish and shows the loading label", () => {
    const onPublish = vi.fn();
    const { getByRole, rerender } = render(<PublishBar label="Continue" onPublish={onPublish} />);
    fireEvent.click(getByRole("button"));
    expect(onPublish).toHaveBeenCalledOnce();
    rerender(<PublishBar label="Continue" loading onPublish={onPublish} />);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.textContent).toContain("Publishing");
    expect(btn.disabled).toBe(true);
  });
});
