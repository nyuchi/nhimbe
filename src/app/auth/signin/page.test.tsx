import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignInPage from "./page";

// Drive the sign-in card through its three methods. The global setup mocks
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

  it("renders the headline and all three methods", () => {
    render(<SignInPage />);
    expect(screen.getByRole("heading", { name: /welcome to nhimbe/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with microsoft/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with sso/i })).toBeInTheDocument();
  });

  it("navigates to the OAuth endpoint when a social button is clicked", () => {
    const assign = stubLocationAssign();
    render(<SignInPage />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(assign).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/oauth?provider=google")
    );
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

  it("reveals the SSO input and surfaces an inline error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "No SSO connection for that domain." }),
    });
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign in with sso/i }));
    const ssoInput = screen.getByLabelText(/work email for sso/i);
    fireEvent.change(ssoInput, { target: { value: "person@company.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue with sso/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/sso",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(await screen.findByText(/no sso connection/i)).toBeInTheDocument();
  });

  it("redirects to the URL returned by the SSO endpoint", async () => {
    const assign = stubLocationAssign();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://sso.example.com/start" }),
    });
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign in with sso/i }));
    fireEvent.change(screen.getByLabelText(/work email for sso/i), {
      target: { value: "person@company.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue with sso/i }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://sso.example.com/start")
    );
  });
});
