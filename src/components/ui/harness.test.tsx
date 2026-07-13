import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  NyuchiHarness,
  useNyuchiHarness,
  animStyle,
  prefersReducedMotion,
} from "./harness";

/** Install a `matchMedia` stub with a fixed reduced-motion answer. */
function mockMatchMedia(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  // Reset matchMedia between tests.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

describe("prefersReducedMotion", () => {
  it("returns false when matchMedia is unavailable", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reflects the media query result", () => {
    mockMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    mockMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("animStyle", () => {
  it("returns an animation string honouring the motion tokens", () => {
    const style = animStyle({}, false);
    expect(style.animation).toContain("nyuchi-fade-slide-up");
    expect(style.animation).toContain("var(--motion-duration-md");
    expect(style.animation).toContain("var(--motion-ease-out");
  });

  it("returns an empty style when reduced motion is requested", () => {
    expect(animStyle({}, true)).toEqual({});
  });

  it("includes a stagger delay when provided", () => {
    const style = animStyle({ delay: 100 }, false);
    expect(style.animation).toContain("100ms");
  });
});

// Surfaces hook return values into the DOM for assertion.
function HookProbe() {
  const h = useNyuchiHarness("probe");
  return (
    <div>
      <span data-testid="reduced">{String(h.prefersReducedMotion)}</span>
      <span data-testid="theme">{h.theme}</span>
      <span data-testid="locale">{h.locale}</span>
      <span data-testid="anim">{h.animStyle().animation ?? "none"}</span>
      <span data-testid="types">{`${typeof h.log.info}:${typeof h.reportHealth}:${typeof h.announce}`}</span>
    </div>
  );
}

describe("useNyuchiHarness", () => {
  it("exposes the documented API and animates by default", () => {
    mockMatchMedia(false);
    render(<HookProbe />);
    expect(screen.getByTestId("reduced").textContent).toBe("false");
    expect(screen.getByTestId("anim").textContent).toContain("nyuchi-fade-slide-up");
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("types").textContent).toBe("function:function:function");
  });

  it("suppresses animation when the user prefers reduced motion", () => {
    mockMatchMedia(true);
    render(<HookProbe />);
    expect(screen.getByTestId("reduced").textContent).toBe("true");
    expect(screen.getByTestId("anim").textContent).toBe("none");
  });

  it("injects the shared entry keyframes into the document once", () => {
    mockMatchMedia(false);
    render(<HookProbe />);
    const styles = document.querySelectorAll("#nyuchi-harness-keyframes");
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain("@keyframes nyuchi-fade-slide-up");
  });
});

describe("NyuchiHarness", () => {
  it("renders children in the healthy state", () => {
    mockMatchMedia(false);
    render(
      <NyuchiHarness name="feed">
        <p>hello</p>
      </NyuchiHarness>
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
    const root = document.querySelector('[data-slot="nyuchi-harness"]');
    expect(root?.getAttribute("data-status")).toBe("healthy");
    expect(root?.className).toContain("nyuchi-animate-in");
  });

  it("shows a skeleton in the loading state and does not animate on reduced motion", () => {
    mockMatchMedia(true);
    render(
      <NyuchiHarness name="feed" loading>
        <p>hello</p>
      </NyuchiHarness>
    );
    const root = document.querySelector('[data-slot="nyuchi-harness"]');
    expect(root?.getAttribute("data-status")).toBe("loading");
    expect(root?.getAttribute("role")).toBe("status");
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
  });

  it("catches a render crash with the branded boundary", () => {
    mockMatchMedia(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): React.ReactNode {
      throw new Error("kaboom");
    }
    render(
      <NyuchiHarness name="crashy">
        <Boom />
      </NyuchiHarness>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/crashy failed to load/i)).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
