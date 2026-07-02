import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./auth-context";
import type { AppUser } from "@/lib/mongo/users";

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

// Mock the server action that syncs the WorkOS session into identity.persons
// (MongoDB). The browser can't reach Mongo, so the sync runs server-side and
// the client calls it as an action.
const mockSyncCurrentUser = vi.fn();
vi.mock("@/app/actions/auth", () => ({
  syncCurrentUser: (...args: unknown[]) => mockSyncCurrentUser(...args),
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

// Build an AppUser as returned by the syncCurrentUser server action.
function appUser(overrides: Partial<AppUser> & { id: string; workosUserId: string }): AppUser {
  return {
    email: "",
    name: "",
    image: undefined,
    addressLocality: undefined,
    addressCountry: undefined,
    interests: [],
    role: "user",
    onboardingCompleted: false,
    suspended: false,
    ...overrides,
    personId: overrides.personId ?? overrides.id,
  };
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkosUser = null;
    mockAuthLoading = false;
    mockAccessToken = "mock-access-token";
    mockGetAccessToken.mockResolvedValue("mock-access-token");
    mockSyncCurrentUser.mockResolvedValue(null);

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

  it("syncs the user into identity.persons when an AuthKit user exists", async () => {
    mockWorkosUser = {
      id: "user_workos_123",
      email: "test@example.com",
      firstName: "Backend",
      lastName: "User",
    };

    mockSyncCurrentUser.mockResolvedValueOnce(
      appUser({
        id: "usr-backend-1",
        workosUserId: "user_workos_123",
        email: "test@example.com",
        name: "Backend User",
        onboardingCompleted: true,
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

    expect(mockSyncCurrentUser).toHaveBeenCalled();
    expect(screen.getByTestId("authenticated").textContent).toBe("yes");
    expect(screen.getByTestId("user-name").textContent).toBe("Backend User");
  });

  it("stays logged out when the sync returns null (no session / suspended)", async () => {
    mockWorkosUser = {
      id: "user_workos_456",
      email: "fallback@example.com",
      firstName: "Fallback",
      lastName: "User",
    };

    mockSyncCurrentUser.mockResolvedValueOnce(null);

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

  it("tracks name completeness from the synced person", async () => {
    // Note: under the v3.1 persons schema, addressLocality and interests are
    // not yet modeled on the person doc, so profile completeness can only
    // reflect the name today. (Tracked as a follow-up to model those fields.)
    mockWorkosUser = {
      id: "user_workos_789",
      email: "complete@example.com",
      firstName: "Complete",
      lastName: "User",
    };

    mockSyncCurrentUser.mockResolvedValueOnce(
      appUser({
        id: "usr-complete",
        workosUserId: "user_workos_789",
        email: "complete@example.com",
        name: "Complete User",
      }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("profile-name").textContent).toBe("yes");
    });
    expect(screen.getByTestId("profile-city").textContent).toBe("no");
    expect(screen.getByTestId("profile-interests").textContent).toBe("no");
    expect(screen.getByTestId("profile-complete").textContent).toBe("no");
  });

  it("marks profileCompleteness as incomplete when the name is a placeholder", async () => {
    mockWorkosUser = {
      id: "user_workos_incomplete",
      email: "incomplete@example.com",
      firstName: null,
      lastName: null,
    };

    mockSyncCurrentUser.mockResolvedValueOnce(
      appUser({
        id: "usr-incomplete",
        workosUserId: "user_workos_incomplete",
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

    mockSyncCurrentUser.mockResolvedValueOnce(
      appUser({
        id: "usr-123",
        workosUserId: "user_workos_123",
        email: "test@example.com",
        name: "Test",
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
