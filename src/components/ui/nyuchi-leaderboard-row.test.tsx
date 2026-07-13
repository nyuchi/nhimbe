import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiLeaderboardRow } from "./nyuchi-leaderboard-row";

afterEach(cleanup);

const el = () => document.querySelector('[data-slot="nyuchi-leaderboard-row"]');

describe("NyuchiLeaderboardRow", () => {
  it("renders position, name and a formatted score", () => {
    const { getByText } = render(<NyuchiLeaderboardRow position={1} name="Tendai Moyo" score={2048} />);
    expect(getByText("1")).toBeTruthy();
    expect(getByText("Tendai Moyo")).toBeTruthy();
    expect(getByText("2,048")).toBeTruthy();
  });

  it("highlights the current user and renders the trust badge slot", () => {
    const { getByText } = render(
      <NyuchiLeaderboardRow position={4} name="Me" score={10} isCurrentUser verifiedBadge={<span>V</span>} />,
    );
    expect(getByText("V")).toBeTruthy();
    expect(getByText("Me").className).toContain("font-bold");
  });

  it("fires onClick", () => {
    let clicked = false;
    render(<NyuchiLeaderboardRow position={2} name="X" score={1} onClick={() => (clicked = true)} />);
    fireEvent.click(el()!);
    expect(clicked).toBe(true);
  });
});
