import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiUserCard } from "./nyuchi-user-card";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-user-card"]');

describe("NyuchiUserCard", () => {
  it("renders name, email and role pill", () => {
    const { getByText } = render(
      <NyuchiUserCard name="Tendai Moyo" email="t@example.com" role="Host" />,
    );
    expect(getByText("Tendai Moyo")).toBeTruthy();
    expect(getByText("t@example.com")).toBeTruthy();
    expect(getByText("Host")).toBeTruthy();
  });

  it("falls back to initials when no avatar", () => {
    const { getByText } = render(<NyuchiUserCard name="Tendai Moyo" />);
    expect(getByText("TM")).toBeTruthy();
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiUserCard name="X" loading />);
    expect(el()?.hasAttribute("data-loading")).toBe(true);
    expect(el()?.className).toContain("animate-pulse");
  });
});
