import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiAvatarStack } from "./nyuchi-avatar-stack";

afterEach(cleanup);

describe("NyuchiAvatarStack", () => {
  it("renders initials fallbacks and an accessible group label", () => {
    const { getByText } = render(
      <NyuchiAvatarStack
        people={[{ name: "Tendai Moyo" }, { name: "Rudo Chikara" }]}
        label="going"
      />,
    );
    const group = document.querySelector('[data-slot="nyuchi-avatar-stack"]');
    expect(group).toBeTruthy();
    expect(group?.getAttribute("aria-label")).toBe("2 going");
    expect(getByText("TM")).toBeTruthy();
    expect(getByText("RC")).toBeTruthy();
  });

  it("collapses beyond max into a +N overflow bubble", () => {
    const people = [
      { name: "A One" },
      { name: "B Two" },
      { name: "C Three" },
      { name: "D Four" },
      { name: "E Five" },
    ];
    const { getByText } = render(<NyuchiAvatarStack people={people} max={3} total={42} label="going" />);
    // total 42, showing 3 → +39 overflow bubble.
    expect(getByText("+39")).toBeTruthy();
    expect(document.querySelector('[aria-label="42 going"]')).toBeTruthy();
  });
});
