import { render } from "@testing-library/react";
import { describe, it, expect, beforeAll } from "vitest";
import { axe } from "vitest-axe";
import { LazySection } from "./lazy-section";

// jsdom doesn't ship IntersectionObserver. Provide a minimal stub
// (proper class so `new IntersectionObserver()` works) — the section
// stays in its fallback state, which is what axe evaluates here.
class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [] as IntersectionObserverEntry[];
  }
}

beforeAll(() => {
  // @ts-expect-error — jsdom env, loose constructor signature on purpose.
  global.IntersectionObserver = MockIntersectionObserver;
});

describe("LazySection accessibility", () => {
  it("default skeleton fallback has no a11y violations", async () => {
    const { container } = render(
      <LazySection>
        <div>Heavy content</div>
      </LazySection>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("custom fallback has no a11y violations", async () => {
    const { container } = render(
      <LazySection fallback={<p>Loading section…</p>}>
        <div>Heavy content</div>
      </LazySection>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("marks the wrapper with data-mounted", () => {
    const { container } = render(
      <LazySection>
        <div>Heavy content</div>
      </LazySection>
    );
    const wrapper = container.querySelector('[data-slot="lazy-section"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("data-mounted")).toBe("false");
  });
});
