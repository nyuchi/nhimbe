/**
 * AdminShell — the role prop drives the locked-nav affordances (the server
 * layout owns actual access control; see require-admin.test.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@admin/app/actions/auth", () => ({
  signOutAction: vi.fn(),
}));

import { AdminShell } from "./admin-shell";

const baseUser = { name: "Nyasha Admin", email: "nyasha@nhimbe.com" };

describe("AdminShell", () => {
  it("renders all sections and the signed-in account block", () => {
    render(
      <AdminShell user={{ ...baseUser, role: "super_admin" }}>
        <p>page body</p>
      </AdminShell>,
    );

    for (const label of [
      "Overview",
      "Events",
      "People",
      "Entities",
      "Circles",
      "Calendars",
      "Support",
      "Signage",
      "Settings",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("nyasha@nhimbe.com")).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("locks every item for a moderator (never hides them) — no moderator surface", () => {
    render(
      <AdminShell user={{ ...baseUser, role: "moderator" }}>
        <p>body</p>
      </AdminShell>,
    );

    // The whole (admin) group gates at admin now, so a moderator has no
    // accessible surface — Overview/Events are locked too, not links.
    for (const label of ["Overview", "Events", "People"]) {
      const item = screen.getByText(label).closest("[aria-disabled]");
      expect(item).not.toBeNull();
      expect(item).toHaveAttribute("title", "Requires admin role");
    }
    const settings = screen.getByText("Settings").closest("[aria-disabled]");
    expect(settings).toHaveAttribute("title", "Requires super_admin role");
  });

  it("unlocks admin items for an admin but keeps settings super_admin-locked", () => {
    render(
      <AdminShell user={{ ...baseUser, role: "admin" }}>
        <p>body</p>
      </AdminShell>,
    );

    expect(screen.getByRole("link", { name: /people/i })).toHaveAttribute("href", "/people");
    expect(screen.getByRole("link", { name: /calendars/i })).toHaveAttribute("href", "/calendars");
    expect(screen.getByText("Settings").closest("[aria-disabled]")).not.toBeNull();
  });
});
