import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiGroupCard } from "./nyuchi-group-card";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-group-card"]');

describe("NyuchiGroupCard", () => {
  it("renders name, member count and topics", () => {
    const { getByText } = render(
      <NyuchiGroupCard name="Harare Devs" memberCount={1200} topics={["Tech", "Careers"]} />,
    );
    expect(getByText("Harare Devs")).toBeTruthy();
    expect(getByText("1,200 members")).toBeTruthy();
    expect(getByText("Tech")).toBeTruthy();
  });

  it("toggles the join label and fires onJoin without bubbling to the card", () => {
    let joins = 0;
    let cardClicks = 0;
    const { getByText, rerender } = render(
      <NyuchiGroupCard name="X" memberCount={1} onClick={() => (cardClicks += 1)} onJoin={() => (joins += 1)} />,
    );
    fireEvent.click(getByText("Join Circle"));
    expect(joins).toBe(1);
    expect(cardClicks).toBe(0);
    rerender(<NyuchiGroupCard name="X" memberCount={1} joined onJoin={() => (joins += 1)} />);
    expect(getByText("Joined")).toBeTruthy();
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiGroupCard name="X" memberCount={0} loading />);
    expect(el()?.hasAttribute("data-loading")).toBe(true);
  });
});
