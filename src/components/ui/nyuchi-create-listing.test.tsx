import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import {
  CoverThemePicker,
  FormSection,
  FormRow,
  FormTextArea,
  PublishBar,
  CreateHeader,
  MINERAL_GRADIENTS,
} from "./nyuchi-create-listing";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

describe("nyuchi-create-listing shell", () => {
  it("CoverThemePicker selects a swatch", () => {
    const onSelect = vi.fn();
    const { getByLabelText } = render(<CoverThemePicker selected={1} onSelect={onSelect} />);
    // The selected swatch is aria-pressed.
    expect(getByLabelText("Theme 2").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(getByLabelText("Theme 4"));
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(MINERAL_GRADIENTS.length).toBe(5);
  });

  it("FormRow renders label, subtitle, and fires onClick", () => {
    const onClick = vi.fn();
    const { getByText } = render(<FormRow label="Capacity" subtitle="Max 100" onClick={onClick} />);
    expect(getByText("Capacity")).toBeTruthy();
    expect(getByText("Max 100")).toBeTruthy();
    fireEvent.click(document.querySelector('[data-slot="form-row"]')!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("FormTextArea proxies changes", () => {
    const onChange = vi.fn();
    const { getByPlaceholderText } = render(<FormTextArea placeholder="Notes" onChange={onChange} />);
    fireEvent.change(getByPlaceholderText("Notes"), { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("PublishBar fires onPublish and shows the loading label", () => {
    const onPublish = vi.fn();
    const { getByRole, rerender } = render(<PublishBar label="Continue" onPublish={onPublish} />);
    fireEvent.click(getByRole("button"));
    expect(onPublish).toHaveBeenCalledOnce();
    rerender(<PublishBar label="Continue" loading onPublish={onPublish} />);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.textContent).toContain("Publishing");
    expect(btn.disabled).toBe(true);
  });

  it("FormSection and CreateHeader render their slots", () => {
    const onCancel = vi.fn();
    const { getByText } = render(
      <FormSection>
        <CreateHeader title="New event" onCancel={onCancel} />
      </FormSection>,
    );
    expect(document.querySelector('[data-slot="form-section"]')).not.toBeNull();
    expect(getByText("New event")).toBeTruthy();
    fireEvent.click(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
