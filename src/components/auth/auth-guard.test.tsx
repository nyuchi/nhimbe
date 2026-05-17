import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthGuard } from './auth-guard';

// Mock the auth context
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Create a mutable auth state for testing
let mockAuthState: {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { role: 'user' | 'moderator' | 'admin' | 'super_admin' } | null;
} = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
};

const ROLE_HIERARCHY = { user: 0, moderator: 1, admin: 2, super_admin: 3 } as const;

vi.mock('./auth-context', () => ({
  useAuth: () => mockAuthState,
  hasPermission: (a: keyof typeof ROLE_HIERARCHY, b: keyof typeof ROLE_HIERARCHY) =>
    ROLE_HIERARCHY[a] >= ROLE_HIERARCHY[b],
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      isAuthenticated: false,
      isLoading: true,
      user: null,
    };
  });

  it('shows loading spinner while checking auth state', () => {
    mockAuthState = {
      isAuthenticated: false,
      isLoading: true,
      user: null,
    };

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    // Should show loader, not content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    // Loader should be present (Loader2 component renders an SVG with animate-spin class)
    const loader = document.querySelector('.animate-spin');
    expect(loader).toBeInTheDocument();
  });

  it('redirects unauthenticated users to sign in page', async () => {
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
    };

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    // Should redirect to sign in
    expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    // Should not show content
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows protected content for authenticated users', () => {
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { role: 'user' },
    };

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    // Should NOT redirect
    expect(mockPush).not.toHaveBeenCalled();
    // Should show content
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('blocks content when requiredRole is not met', () => {
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { role: 'user' },
    };

    render(
      <AuthGuard requiredRole="admin">
        <div>Admin Content</div>
      </AuthGuard>
    );

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
    expect(screen.getByText('Not authorized')).toBeInTheDocument();
  });

  it('shows content when requiredRole is met', () => {
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { role: 'admin' },
    };

    render(
      <AuthGuard requiredRole="admin">
        <div>Admin Content</div>
      </AuthGuard>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('does not render children when not authenticated', () => {
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
    };

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
