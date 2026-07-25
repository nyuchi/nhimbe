import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NyuchiCommandPalette, type CommandPaletteItem } from "./nyuchi-command-palette";

const NAV: CommandPaletteItem[] = [
  { id: "nav:discover", label: "Discover", href: "/discover", group: "Go to" },
  { id: "nav:events", label: "All Events", href: "/events", group: "Go to" },
];

function setup(overrides: Partial<React.ComponentProps<typeof NyuchiCommandPalette>> = {}) {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const onSubmitQuery = vi.fn();
  const onSearch = vi.fn(async () => [] as CommandPaletteItem[]);
  render(
    <NyuchiCommandPalette
      open
      onClose={onClose}
      navItems={NAV}
      onSearch={onSearch}
      onSelect={onSelect}
      onSubmitQuery={onSubmitQuery}
      {...overrides}
    />,
  );
  return { onClose, onSelect, onSubmitQuery, onSearch };
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("NyuchiCommandPalette", () => {
  it("renders nothing when closed", () => {
    render(<NyuchiCommandPalette open={false} onClose={vi.fn()} navItems={NAV} onSelect={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the curated nav under a 'Go to' group when open", () => {
    setup();
    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByText("Go to")).toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByText("All Events")).toBeInTheDocument();
  });

  it("filters nav and offers a 'search all' row as you type", () => {
    setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "disc" } });
    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.queryByText("All Events")).toBeNull();
    expect(screen.getByText(/Search all events for/)).toBeInTheDocument();
  });

  it("activates a row on click — calls onSelect and closes", () => {
    const { onSelect, onClose } = setup();
    fireEvent.click(screen.getByText("Discover"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ href: "/discover" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("submits the query via the 'search all' row", () => {
    const { onSubmitQuery } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "jazz" } });
    fireEvent.click(screen.getByText(/Search all events for/));
    expect(onSubmitQuery).toHaveBeenCalledWith("jazz");
  });

  it("Enter activates the highlighted item; Escape closes", () => {
    const { onSelect, onClose } = setup();
    const input = screen.getByRole("combobox");
    // First item (index 0) is selected by default → Discover.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ href: "/discover" }));
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("runs the live search and shows results with their category chip", async () => {
    setup({
      onSearch: vi.fn(async () => [
        {
          id: "event:1",
          label: "Sunset Sessions",
          href: "/events/1",
          group: "Events",
          badge: "Music",
          mineral: "tanzanite",
        },
      ]),
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sunset" } });
    await waitFor(() => expect(screen.getByText("Sunset Sessions")).toBeInTheDocument());
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Music")).toBeInTheDocument();
  });
});
