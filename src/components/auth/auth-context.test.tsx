import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./auth-context";
import type { PersonRow } from "@/lib/supabase/types";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock AuthKit. AuthProvider calls useAuth + useAccessToken from @workos-inc/authkit-nextjs/components.
const mockAuthKitSignOut = vi.fn().mockResolvedValue(undefined);
let mockWorkosUser: { id: string; email: string; firstName: string | null; lastName: string | null } | null = null;
let mockAuthLoading = false;
let mockAccessToken: string | null = null;
const mockGetAccessToken = vi.fn().mockResolvedValue("mock-access-token");

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({
    user: mockWorkosUser,
    loading: mockAuthLoading,
    signOut: mockAuthKitSignOut,
  }),
  useAccessToken: () => ({
    accessToken: mockAccessToken,
    getAccessToken: mockGetAccessToken,
  }),
}));

// Mock Supabase client setter — auth-context calls setSupabaseAccessToken on
// every token rotation. We just want to confirm it's invoked.
const mockSetSupabaseAccessToken = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  setSupabaseAccessToken: (t: string | null) => mockSetSupabaseAccessToken(t),
  getSupabaseBrowserClient: () => ({}),
}));

// Mock the Supabase identity.person upsert. AuthProvider replaces the old
// /api/auth/sync round-trip with this call after PR-34.
const mockUpsertPersonFromWorkos = vi.fn();
vi.mock("@/lib/supabase/api", () => ({
  upsertPersonFromWorkos: (...args: unknown[]) => mockUpsertPersonFromWorkos(...args),
}));

function TestConsumer() {
  const { user, isAuthenticated, isLoading, profileCompleteness, signIn, signOut } = useAuth();
  return (
    <div>
      <div data-testid="loading">{isLoading ? "loading" : "not-loading"}</div>
      <div data-testid="authenticated">{isAuthenticated ? "yes" : "no"}</div>
      <div data-testid="profile-complete">{profileCompleteness.complete ? "yes" : "no"}</div>
      <div data-testid="profile-name">{profileCompleteness.name ? "yes" : "no"}</div>
      <div data-testid="profile-city">{profileCompleteness.addressLocality ? "yes" : "no"}</div>
      <div data-testid="profile-interests">{profileCompleteness.interests ? "yes" : "no"}</div>
      <div data-testid="user-name">{user?.name || "no-user"}</div>
      <button onClick={() => signIn("/dashboard")}>Sign In</button>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkosUser = null;
    mockAuthLoading = false;
    mockAccessToken = "mock-access-token";

    Object.defineProperty(global, "localStorage", {
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      configurable: true,
    });
  });

  // Helper — build a realistic identity.person row that maps cleanly to a
  // NhimbeUser for assertions.
  function personRow(overrides: Partial<PersonRow> & { id: string; workos_user_id: string }): PersonRow {
    return {
      id: overrides.id,
      workos_user_id: overrides.workos_user_id,
      name: null,
      givenname: null,
      familyname: null,
      alternatename: null,
      email: null,
      image: null,
      bio: null,
      description: null,
      address: null,
      knowsabout: null,
      role: "user",
      onboarding_completed: false,
      profile_completed: false,
      email_verified: false,
      last_login_at: null,
      created_at: null,
      updated_at: null,
      ...overrides,
    };
  }

  it("finishes loading when no AuthKit session exists", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("not-loading");
    });
    expect(screen.getByTestId("authenticated").textContent).toBe("no");
  });

  it("shows loading when AuthKit is still resolving the session", async () => {
    mockAuthLoading = true;

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId("loading").textContent).toBe("loading");
  });

  it("syncs with Supabase when AuthKit user exists", async () => {
    mockWorkosUser = {
      id: "user_workos_123",
      email: "test@example.com",
      firstName: "Backend",
      lastName: "User",
    };

    mockUpsertPersonFromWorkos.mockResolvedValueOnce(
      personRow({
        id: "usr-backend-1",
        workos_user_id: "user_workos_123",
        email: "test@example.com",
        name: "Backend User",
        address: { addressLocality: "Harare" },
        knowsabout: ["music", "tech"],
      }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("not-loading");
    });

    expect(mockUpsertPersonFromWorkos).toHaveBeenCalledWith(
      expect.objectContaining({
        workosUserId: "user_workos_123",
        email: "test@example.com",
      }),
    );

    expect(screen.getByTestId("authenticated").textContent).toBe("yes");
    expect(screen.getByTestId("user-name").textContent).toBe("Backend User");
  });

  it("stays logged out when Supabase upsert fails", async () => {
    mockWorkosUser = {
      id: "user_workos_456",
      email: "fallback@example.com",
      firstName: "Fallback",
      lastName: "User",
    };

    mockUpsertPersonFromWorkos.mockResolvedValueOnce(null);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("not-loading");
    });

    expect(screen.getByTestId("authenticated").textContent).toBe("no");
  });

  it("computes profileCompleteness based on user fields", async () => {
    mockWorkosUser = {
      id: "user_workos_789",
      email: "complete@example.com",
      firstName: "Complete",
      lastName: "User",
    };

    mockUpsertPersonFromWorkos.mockResolvedValueOnce(
      personRow({
        id: "usr-complete",
        workos_user_id: "user_workos_789",
        email: "complete@example.com",
        name: "Complete User",
        address: { addressLocality: "Harare" },
        knowsabout: ["music"],
      }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("profile-complete").textContent).toBe("yes");
    });
    expect(screen.getByTestId("profile-name").textContent).toBe("yes");
    expect(screen.getByTestId("profile-city").textContent).toBe("yes");
    expect(screen.getByTestId("profile-interests").textContent).toBe("yes");
  });

  it("marks profileCompleteness as incomplete when fields are missing", async () => {
    mockWorkosUser = {
      id: "user_workos_incomplete",
      email: "incomplete@example.com",
      firstName: null,
      lastName: null,
    };

    mockUpsertPersonFromWorkos.mockResolvedValueOnce(
      personRow({
        id: "usr-incomplete",
        workos_user_id: "user_workos_incomplete",
        email: "incomplete@example.com",
        name: "User",
      }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("profile-complete").textContent).toBe("no");
    });
    expect(screen.getByTestId("profile-name").textContent).toBe("no");
    expect(screen.getByTestId("profile-city").textContent).toBe("no");
    expect(screen.getByTestId("profile-interests").textContent).toBe("no");
  });

  it("signIn redirects to /auth/signin and stores return URL", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("not-loading");
    });

    const signInButton = screen.getByText("Sign In");
    await act(async () => {
      signInButton.click();
    });

    expect(localStorage.setItem).toHaveBeenCalledWith("auth_redirect", "/dashboard");
    expect(mockPush).toHaveBeenCalledWith("/auth/signin");
  });

  it("signOut calls AuthKit signOut and clears local state", async () => {
    mockWorkosUser = {
      id: "user_workos_123",
      email: "test@example.com",
      firstName: "Test",
      lastName: null,
    };

    mockUpsertPersonFromWorkos.mockResolvedValueOnce(
      personRow({
        id: "usr-123",
        workos_user_id: "user_workos_123",
        email: "test@example.com",
        name: "Test",
        address: { addressLocality: "Harare" },
        knowsabout: ["music", "tech"],
      }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("yes");
    });

    const signOutButton = screen.getByText("Sign Out");
    await act(async () => {
      signOutButton.click();
    });

    expect(mockAuthKitSignOut).toHaveBeenCalledWith({ returnTo: "/" });
  });

  it("throws error when useAuth is used outside AuthProvider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow("useAuth must be used within an AuthProvider");

    consoleSpy.mockRestore();
  });
});
