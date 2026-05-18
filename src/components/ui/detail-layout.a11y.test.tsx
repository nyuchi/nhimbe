import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import { DetailLayout } from "./detail-layout";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("DetailLayout accessibility", () => {
  it("has no a11y violations with hero, sidebar, metadata, actions", async () => {
    const { container } = render(
      <DetailLayout
        backHref="/events"
        backLabel="All events"
        heroImage={
          // eslint-disable-next-line @next/next/no-img-element
          <img src="https://example.com/hero.jpg" alt="Event hero" />
        }
        metadata={<span>Saturday • 7pm</span>}
        actions={<button type="button">Share</button>}
        sidebar={
          <div>
            <h2>Sidebar</h2>
            <p>Ticket info</p>
          </div>
        }
      >
        <article>
          <h1>Event title</h1>
          <p>Description body</p>
        </article>
      </DetailLayout>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no a11y violations with minimal props", async () => {
    const { container } = render(
      <DetailLayout backHref="/">
        <h1>Just content</h1>
      </DetailLayout>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
