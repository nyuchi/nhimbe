import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "./empty";

afterEach(cleanup);

describe("Empty", () => {
  it("renders the icon + title + description composition", () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <svg data-testid="icon" />
          </EmptyMedia>
          <EmptyTitle>No events yet</EmptyTitle>
          <EmptyDescription>Create your first event to get started.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>content</EmptyContent>
      </Empty>
    );
    expect(screen.getByText("No events yet")).toBeInTheDocument();
    expect(screen.getByText(/Create your first event/)).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("marks the correct data-slots", () => {
    const { container } = render(
      <Empty>
        <EmptyTitle>t</EmptyTitle>
      </Empty>
    );
    expect(container.querySelector('[data-slot="empty"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="empty-title"]')).not.toBeNull();
  });

  it("applies the icon media variant styling", () => {
    const { container } = render(
      <EmptyMedia variant="icon">
        <svg />
      </EmptyMedia>
    );
    const media = container.querySelector('[data-slot="empty-icon"]');
    expect(media?.getAttribute("data-variant")).toBe("icon");
    expect(media?.className).toContain("bg-muted");
  });

  it("defaults to the default media variant", () => {
    const { container } = render(<EmptyMedia />);
    const media = container.querySelector('[data-slot="empty-icon"]');
    expect(media?.getAttribute("data-variant")).toBe("default");
    expect(media?.className).toContain("bg-transparent");
  });
});
