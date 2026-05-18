// Augment Vitest's assertion types so `expect(results).toHaveNoViolations()`
// type-checks alongside the matcher that `setup.ts` registers via
// `expect.extend(axeMatchers)`.

import type { AxeMatchers } from "vitest-axe";
import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> extends AxeMatchers {
    // T parameter required to satisfy the generic of `Assertion`.
    _vitestAxe?: T;
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
