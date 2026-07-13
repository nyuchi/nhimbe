import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiArticleCard } from "./nyuchi-article-card";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function card() {
  return document.querySelector('[data-slot="nyuchi-article-card"]');
}

describe("NyuchiArticleCard", () => {
  it("renders a row with title, source and a fact-check label", () => {
    const { getByText } = render(
      <NyuchiArticleCard title="Diaspora remittances rise" sourceName="Herald" factCheckStatus="verified" variant="row" />,
    );
    expect(card()?.getAttribute("data-variant")).toBe("row");
    expect(getByText("Diaspora remittances rise")).toBeTruthy();
    expect(getByText("Verified")).toBeTruthy();
  });

  it("renders a hero variant as a link when href is set", () => {
    render(<NyuchiArticleCard title="Big story" variant="hero" href="/news/1" />);
    const el = card();
    expect(el?.tagName).toBe("A");
    expect(el?.getAttribute("data-variant")).toBe("hero");
    expect(el?.getAttribute("href")).toBe("/news/1");
  });

  it("fires onClick on the compact variant", () => {
    const onClick = vi.fn();
    render(<NyuchiArticleCard title="Clickable" variant="compact" onClick={onClick} />);
    fireEvent.click(card()!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiArticleCard title="x" loading />);
    expect(card()?.hasAttribute("data-loading")).toBe(true);
  });
});
