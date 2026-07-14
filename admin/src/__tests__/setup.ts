import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock next/navigation (same shape as the root app's test setup).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn((url: string) => {
    // Mirror Next's real redirect(): it throws to halt the caller.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// jsdom lacks ResizeObserver — provide a no-op so harness-wired components
// can mount under test.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeEach(() => {
  vi.clearAllMocks();
});
