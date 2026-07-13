import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiUserMenu } from "./nyuchi-user-menu";

afterEach(cleanup);

const trigger = () => document.querySelector('[data-slot="nyuchi-user-menu"]');

describe("NyuchiUserMenu", () => {
  it("renders an accessible trigger with the user name and initials", () => {
    const { getByText } = render(<NyuchiUserMenu name="Tendai Moyo" email="t@example.com" />);
    expect(trigger()?.getAttribute("aria-label")).toBe("Account menu");
    expect(getByText("TM")).toBeTruthy();
    expect(getByText("Tendai Moyo")).toBeTruthy();
  });

  it("wires the trigger to a menu popup", () => {
    render(<NyuchiUserMenu name="Tendai Moyo" onSignOut={() => {}} />);
    // Radix marks the trigger as a popup opener; the content is portalled on open.
    expect(trigger()?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger()?.getAttribute("data-state")).toBe("closed");
  });

  it("renders the compact (icon-only) trigger without name text", () => {
    const { queryByText } = render(<NyuchiUserMenu name="Tendai Moyo" compact />);
    // Initials fallback is always present; the name label block is omitted in compact mode.
    expect(queryByText("Tendai Moyo")).toBeNull();
  });
});
