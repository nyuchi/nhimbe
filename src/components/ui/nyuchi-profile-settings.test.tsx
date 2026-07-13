import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiProfileSettings, type SettingsSection } from "./nyuchi-profile-settings";

afterEach(cleanup);

const sections: SettingsSection[] = [
  { id: "account", label: "Account", content: <div>ACCOUNT PANEL</div> },
  { id: "privacy", label: "Privacy", content: <div>PRIVACY PANEL</div> },
];

describe("NyuchiProfileSettings", () => {
  it("shows the first section by default and switches on nav click", () => {
    const { getByText, queryByText } = render(<NyuchiProfileSettings sections={sections} />);
    expect(getByText("ACCOUNT PANEL")).toBeTruthy();
    expect(queryByText("PRIVACY PANEL")).toBeNull();
    fireEvent.click(getByText("Privacy"));
    expect(getByText("PRIVACY PANEL")).toBeTruthy();
  });

  it("renders and wires the save bar when enabled", () => {
    let saved = false;
    const { getByText } = render(
      <NyuchiProfileSettings sections={sections} showSaveBar onSave={() => (saved = true)} />,
    );
    fireEvent.click(getByText("Save changes"));
    expect(saved).toBe(true);
  });
});
