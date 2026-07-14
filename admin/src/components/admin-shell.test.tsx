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

  it("locks admin- and super_admin-only items for a moderator (never hides them)", () => {
    render(
      <AdminShell user={{ ...baseUser, role: "moderator" }}>
        <p>body</p>
      </AdminShell>,
    );

    // Moderator-accessible: rendered as links.
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /events/i })).toHaveAttribute("href", "/events");

    // Locked: visible but inert with the role hint.
    const people = screen.getByText("People").closest("[aria-disabled]");
    expect(people).not.toBeNull();
    expect(people).toHaveAttribute("title", "Requires admin role");
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
