import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TwoFactorSetup } from "./two-factor-setup";

const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

const ENROLL = {
  ok: true,
  json: async () => ({
    factorId: "auth_factor_1",
    qrCode: "data:image/png;base64,AAAA",
    secret: "JBSWY3DPEHPK3PXP",
  }),
};

describe("TwoFactorSetup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enrolls, shows the QR + secret + OTP entry", async () => {
    mockFetch.mockResolvedValueOnce(ENROLL);
    render(<TwoFactorSetup />);
    fireEvent.click(screen.getByRole("button", { name: /set up authenticator app/i }));

    await screen.findByLabelText(/digit 1 of 6/i);
    expect(screen.getByText(/JBSWY3DPEHPK3PXP/)).toBeInTheDocument();
    expect(screen.getByAltText(/authenticator app qr code/i)).toBeInTheDocument();
  });

  it("deletes the unconfirmed factor when the user skips", async () => {
    mockFetch
      .mockResolvedValueOnce(ENROLL)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }); // remove
    render(<TwoFactorSetup />);
    fireEvent.click(screen.getByRole("button", { name: /set up authenticator app/i }));
    await screen.findByLabelText(/digit 1 of 6/i);

    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        "/api/auth/mfa/remove",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(JSON.parse(mockFetch.mock.calls[1][1].body as string)).toEqual({
      factorId: "auth_factor_1",
    });
    // Returns to the not-set-up state.
    expect(
      await screen.findByRole("button", { name: /set up authenticator app/i })
    ).toBeInTheDocument();
  });

  it("turns on two-factor when a valid code is entered", async () => {
    mockFetch
      .mockResolvedValueOnce(ENROLL)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }); // activate
    render(<TwoFactorSetup />);
    fireEvent.click(screen.getByRole("button", { name: /set up authenticator app/i }));
    const first = await screen.findByLabelText(/digit 1 of 6/i);

    // A full-code paste auto-submits (onComplete → activate).
    fireEvent.paste(first, { clipboardData: { getData: () => "123456" } });

    await waitFor(() =>
      expect(mockFetch).toHaveBeenLastCalledWith(
        "/api/auth/mfa/activate",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(JSON.parse(mockFetch.mock.calls[1][1].body as string)).toMatchObject({
      code: "123456",
      factorId: "auth_factor_1",
    });
    expect(
      await screen.findByText(/two-factor authentication is on/i)
    ).toBeInTheDocument();
  });
});
