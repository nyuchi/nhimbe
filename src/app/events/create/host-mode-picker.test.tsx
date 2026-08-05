import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HostModePicker } from "./host-mode-picker";

const useAuth = vi.hoisted(() => vi.fn());
vi.mock("@/components/auth/auth-context", () => ({ useAuth }));

const getMyHostEntities = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/host-entities", () => ({ getMyHostEntities }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "person-1", name: "Dev User" } });
});

describe("HostModePicker", () => {
  it("lists a community entity alongside organisations, not dropped", async () => {
    getMyHostEntities.mockResolvedValue([
      { id: "entity-1", name: "Harare Runners Club", entityType: "community", logo: null, description: null, verified: false },
      { id: "entity-2", name: "Acme Org", entityType: "organization", logo: null, description: null, verified: false },
    ]);

    render(<HostModePicker hostMode="person" hostEntityId={null} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Harare Runners Club")).toBeInTheDocument();
    });
    expect(screen.getByText("Acme Org")).toBeInTheDocument();
    expect(screen.queryByText(/no families, organisations, or communities/i)).not.toBeInTheDocument();
  });

  it("selecting a community entity reports hostMode=organization with its entity id", async () => {
    getMyHostEntities.mockResolvedValue([
      { id: "entity-1", name: "Harare Runners Club", entityType: "community", logo: null, description: null, verified: false },
    ]);
    const onChange = vi.fn();

    render(<HostModePicker hostMode="person" hostEntityId={null} onChange={onChange} />);

    const row = await screen.findByText("Harare Runners Club");
    row.closest("button")?.click();

    expect(onChange).toHaveBeenCalledWith("organization", "entity-1");
  });

  it("shows the empty state mentioning communities when there are no entities", async () => {
    getMyHostEntities.mockResolvedValue([]);

    render(<HostModePicker hostMode="person" hostEntityId={null} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/no families, organisations, or communities/i)).toBeInTheDocument();
    });
  });
});
