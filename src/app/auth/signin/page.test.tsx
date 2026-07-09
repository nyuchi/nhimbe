import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignInPage from "./page";

// Drive the sign-in card through its two methods. The global setup mocks
// `next/navigation` with an empty URLSearchParams (so return_to defaults to "/"
// and there is no config error) and stubs `global.fetch`.

const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

function stubLocationAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign, href: "http://localhost/" },
  });
  return assign;
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the headline and defaults to the email-code method", () => {
    render(<SignInPage />);
    expect(screen.getByRole("heading", { name: /welcome to nhimbe/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email me a code/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use a password instead/i })).toBeInTheDocument();
  });

  it("sends a magic-auth code then shows the code step", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "person@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a code/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/magic/start",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  it("signs in with a password and navigates on success", async () => {
    const assign = stubLocationAssign();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /use a password instead/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "s3cret-passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/password",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("steps up to the authenticator code when the password path returns mfa", async () => {
    const assign = stubLocationAssign();
    // 1st fetch: password route reports MFA required (no session yet).
    // 2nd fetch: mfa/verify completes and returns { ok: true }.
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mfa: true,
          pendingAuthenticationToken: "pat_abc",
          challengeId: "auth_challenge_1",
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /use a password instead/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "s3cret-passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    // The authenticator step takes over the card.
    const codeInput = await screen.findByLabelText(/authenticator code/i);
    fireEvent.change(codeInput, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        "/api/auth/mfa/verify",
        expect.objectContaining({ method: "POST" })
      )
    );
    // The pending token + code are handed to the verify call.
    const lastBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(lastBody).toMatchObject({
      code: "654321",
      pendingAuthenticationToken: "pat_abc",
      challengeId: "auth_challenge_1",
    });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("surfaces an inline error when the password is rejected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "That email or password is incorrect." }),
    });
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /use a password instead/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/email or password is incorrect/i);
  });
});
