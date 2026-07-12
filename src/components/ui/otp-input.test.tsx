import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { OtpInput } from "./otp-input";

// A controlled wrapper mirrors how callers use OtpInput (single value string).
function Harness({ onComplete }: { onComplete?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} ariaLabel="Test code" />;
}

function boxes() {
  return Array.from(
    { length: 6 },
    (_, i) => screen.getByLabelText(`Digit ${i + 1} of 6`) as HTMLInputElement,
  );
}
const type = (box: HTMLInputElement, char: string) =>
  fireEvent.change(box, { target: { value: char } });
const join = (b: HTMLInputElement[]) => b.map((x) => x.value).join("");

describe("OtpInput", () => {
  it("builds the value as digits are typed sequentially", () => {
    render(<Harness />);
    const b = boxes();
    "123".split("").forEach((d, i) => type(b[i], d));
    expect(join(b)).toBe("123");
  });

  it("clears only the last filled box on backspace (no left shift)", () => {
    render(<Harness />);
    const b = boxes();
    "1234".split("").forEach((d, i) => type(b[i], d));
    fireEvent.keyDown(b[3], { key: "Backspace" });
    expect(join(b)).toBe("123");
  });

  it("overwrites a middle box in place without collapsing", () => {
    render(<Harness />);
    const b = boxes();
    "1234".split("").forEach((d, i) => type(b[i], d));
    type(b[1], "9");
    expect(join(b)).toBe("1934");
  });

  it("fires onComplete once on the completing digit, not on later edits", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const b = boxes();
    "123456".split("").forEach((d, i) => type(b[i], d));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");
    type(b[0], "9"); // editing an already-complete code must not re-submit
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(join(b)).toBe("923456");
  });

  it("pasting a full code fills every box and completes", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const b = boxes();
    fireEvent.paste(b[0], { clipboardData: { getData: () => "654321" } });
    expect(join(b)).toBe("654321");
    expect(onComplete).toHaveBeenCalledWith("654321");
  });

  it("ignores non-digit input", () => {
    render(<Harness />);
    const b = boxes();
    type(b[0], "a");
    expect(join(b)).toBe("");
  });
});
