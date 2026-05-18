import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { FileUpload } from "./file-upload";

describe("FileUpload accessibility", () => {
  it("idle dropzone has no a11y violations", async () => {
    const { container } = render(<FileUpload onFiles={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders an explicit browse button as the keyboard affordance", () => {
    const { container } = render(<FileUpload onFiles={() => {}} />);
    const dropzone = container.querySelector('[data-slot="file-upload-dropzone"]');
    const browseBtn = dropzone?.querySelector("button");
    expect(browseBtn).not.toBeNull();
    expect(browseBtn?.textContent).toMatch(/browse/i);
  });

  it("file input has an accessible label", () => {
    const { container } = render(<FileUpload onFiles={() => {}} />);
    const input = container.querySelector('input[type="file"]');
    expect(input?.getAttribute("aria-label")).toBeTruthy();
  });

  it("disabled state has no a11y violations", async () => {
    const { container } = render(<FileUpload onFiles={() => {}} disabled />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
