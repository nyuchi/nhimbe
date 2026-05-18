import '@testing-library/jest-dom';
import { expect, vi } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

// Register vitest-axe matchers globally (`toHaveNoViolations`, etc.).
// Doing it here avoids re-extending in every test file and keeps the
// matcher available across the suite.
expect.extend(axeMatchers);

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockReturnValue(null);
  Object.defineProperty(document, 'cookie', {
    writable: true,
    value: '',
  });
});
