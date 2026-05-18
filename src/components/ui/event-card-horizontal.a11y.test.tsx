import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import { EventCardHorizontal } from "./event-card-horizontal";

// next/link and next/image — render as plain anchors / imgs so axe
// can evaluate the resulting DOM without a Next runtime.
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, ...rest }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...rest} />
  ),
}));

describe("EventCardHorizontal accessibility", () => {
  const baseProps = {
    id: "evt_1",
    title: "Mukoko meetup",
    date: { day: "12", month: "Jun", full: "2026-06-12T18:00:00Z", time: "18:00" },
    location: { name: "Harare Gardens", addressLocality: "Harare", addressCountry: "Zimbabwe" },
    attendeeCount: 12,
    maximumAttendeeCapacity: 50,
  };

  it("has no a11y violations with cover image", async () => {
    const { container } = render(
      <EventCardHorizontal {...baseProps} coverImage="https://example.com/cover.jpg" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no a11y violations with gradient fallback", async () => {
    const { container } = render(
      <EventCardHorizontal
        {...baseProps}
        coverGradient="linear-gradient(135deg, #004D40, #00796B)"
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders pulse-dot strip with descriptive aria-label", () => {
    const { container } = render(<EventCardHorizontal {...baseProps} />);
    const strip = container.querySelector('[data-slot="pulse-dots"]');
    // With 12 attendees of 50 capacity over 16 dots,
    // round(12/50 * 16) = 4 filled dots out of 16 total.
    expect(strip?.getAttribute("aria-label")).toMatch(/\d+ of 16 confirmed/);
  });
});
