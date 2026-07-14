import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Capture the options /callback hands to handleAuth so the tests can drive
// its onSuccess hook directly (no WorkOS round-trip).
const captured = vi.hoisted(() => ({ options: null as Record<string, unknown> | null }));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  handleAuth: vi.fn((options: Record<string, unknown>) => {
    captured.options = options;
    return vi.fn();
  }),
}));

const syncPersonFromWorkos = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mongo/users")>();
  return { ...actual, syncPersonFromWorkos };
});

// users.ts (via importOriginal) pulls databases → the Mongo client; stub it.
vi.mock("@/lib/mongo/databases", () => ({ personsCollection: vi.fn() }));

// Observability binds console methods at module load, so spy at the logger
// level to assert the [mukoko] logging of swallowed failures.
const callbackLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({
  createLogger: vi.fn(() => callbackLogger),
}));

// Importing the route registers the handleAuth call and captures its options.
import "./route";

type OnSuccess = (data: { user: Record<string, unknown> }) => Promise<void>;

const sessionUser = {
  id: "user_123",
  email: "amai@example.com",
  firstName: "Amai",
  lastName: "Mukoko",
  profilePictureUrl: "https://img.example/a.png",
  emailVerified: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  syncPersonFromWorkos.mockResolvedValue({ id: "person-1" });
});

describe("/callback handleAuth wiring", () => {
  it("registers onSuccess alongside the returnPathname", () => {
    expect(captured.options).not.toBeNull();
    expect(captured.options).toMatchObject({ returnPathname: "/" });
    expect(typeof captured.options?.onSuccess).toBe("function");
  });

  it("onSuccess provisions the person from the session user", async () => {
    const onSuccess = captured.options?.onSuccess as OnSuccess;
    await onSuccess({ user: sessionUser });

    expect(syncPersonFromWorkos).toHaveBeenCalledTimes(1);
    expect(syncPersonFromWorkos).toHaveBeenCalledWith({
      workosUserId: "user_123",
      email: "amai@example.com",
      name: "Amai Mukoko",
      givenName: "Amai",
      familyName: "Mukoko",
      picture: "https://img.example/a.png",
      emailVerified: true,
    });
  });

  it("onSuccess NEVER throws into the auth flow when the upsert fails", async () => {
    syncPersonFromWorkos.mockRejectedValue(new Error("MONGODB_URI unset"));

    const onSuccess = captured.options?.onSuccess as OnSuccess;
    await expect(onSuccess({ user: sessionUser })).resolves.toBeUndefined();

    // The failure is logged via the [mukoko] logger, not rethrown.
    expect(callbackLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("provisioning failed"),
      expect.objectContaining({
        data: { workosUserId: "user_123" },
        error: expect.any(Error),
      }),
    );
  });

  it("onSuccess is idempotent across repeated logins (same keyed input)", async () => {
    const onSuccess = captured.options?.onSuccess as OnSuccess;
    await onSuccess({ user: sessionUser });
    await onSuccess({ user: sessionUser });
    const [a, b] = syncPersonFromWorkos.mock.calls;
    expect(a).toEqual(b);
  });
});
