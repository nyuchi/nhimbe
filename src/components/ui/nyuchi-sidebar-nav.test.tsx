import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiSidebarNav, type NavItem } from "./nyuchi-sidebar-nav";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function nav() {
  return document.querySelector('[data-slot="nyuchi-sidebar-nav"]');
}

const items: NavItem[] = [
  { key: "dash", label: "Dashboard", href: "/admin" },
  { key: "users", label: "Users", href: "/admin/users", badge: 3 },
  { key: "settings", label: "Settings", disabled: true, trailing: <span data-testid="lock">L</span> },
];

describe("NyuchiSidebarNav", () => {
  it("renders items and marks the active one with aria-current", () => {
    const { getByText } = render(<NyuchiSidebarNav items={items} activeKey="dash" title="Admin" />);
    expect(nav()?.getAttribute("aria-label")).toBe("Admin");
    const active = getByText("Dashboard").closest("a");
    expect(active?.getAttribute("aria-current")).toBe("page");
  });

  it("renders a count badge", () => {
    const { getByText } = render(<NyuchiSidebarNav items={items} />);
    expect(getByText("3")).toBeTruthy();
  });

  it("renders disabled items inert with a trailing node", () => {
    const { getByText, getByTestId } = render(<NyuchiSidebarNav items={items} />);
    const el = getByText("Settings").closest("[aria-disabled]");
    expect(el).toBeTruthy();
    expect(getByTestId("lock")).toBeTruthy();
  });

  it("fires onSelect for button items (no href)", () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <NyuchiSidebarNav items={[{ key: "a", label: "Action" }]} onSelect={onSelect} />,
    );
    fireEvent.click(getByText("Action"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });
});
