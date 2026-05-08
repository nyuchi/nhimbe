import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth, type NhimbeUser } from "./auth-context";

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

    global.fetch = vi.fn();
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

  it("syncs with backend when AuthKit user exists", async () => {
    const backendUser: NhimbeUser = {
      id: "usr-backend-1",
      email: "test@example.com",
      name: "Backend User",
      addressLocality: "Harare",
      interests: ["music", "tech"],
      personId: "usr-backend-1",
      workosUserId: "user_workos_123",
      role: "user",
    };

    mockWorkosUser = {
      id: "user_workos_123",
      email: "test@example.com",
      firstName: "Backend",
      lastName: "User",
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: backendUser }),
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("not-loading");
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/sync"),
      expect.objectContaining({ method: "POST" }),
    );

    expect(screen.getByTestId("authenticated").textContent).toBe("yes");
    expect(screen.getByTestId("user-name").textContent).toBe("Backend User");
  });

  it("stays logged out when backend sync fails", async () => {
    mockWorkosUser = {
      id: "user_workos_456",
      email: "fallback@example.com",
      firstName: "Fallback",
      lastName: "User",
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

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
    const backendUser: NhimbeUser = {
      id: "usr-complete",
      email: "complete@example.com",
      name: "Complete User",
      addressLocality: "Harare",
      interests: ["music"],
      personId: "usr-complete",
      workosUserId: "user_workos_789",
      role: "user",
    };

    mockWorkosUser = {
      id: "user_workos_789",
      email: "complete@example.com",
      firstName: "Complete",
      lastName: "User",
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: backendUser }),
    });

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
    const backendUser: NhimbeUser = {
      id: "usr-incomplete",
      email: "incomplete@example.com",
      name: "User",
      personId: "usr-incomplete",
      workosUserId: "user_workos_incomplete",
      role: "user",
    };

    mockWorkosUser = {
      id: "user_workos_incomplete",
      email: "incomplete@example.com",
      firstName: null,
      lastName: null,
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: backendUser }),
    });

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
    const backendUser: NhimbeUser = {
      id: "usr-123",
      email: "test@example.com",
      name: "Test",
      addressLocality: "Harare",
      interests: ["music", "tech"],
      personId: "usr-123",
      workosUserId: "user_workos_123",
      role: "user",
    };

    mockWorkosUser = {
      id: "user_workos_123",
      email: "test@example.com",
      firstName: "Test",
      lastName: null,
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: backendUser }),
    });

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
