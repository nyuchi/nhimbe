import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AvatarPicker } from "./avatar-picker";
import { AVATAR_STICKERS } from "@/lib/avatar-stickers";

const uploadMedia = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  uploadMedia,
  getMediaUrl: (key: string) => `https://assets-s001.mukoko.com/${key}`,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AvatarPicker", () => {
  it("shows initials when there is no value", () => {
    render(
      <AvatarPicker name="Amai Zw" value={undefined} onChange={vi.fn()} onCheckGravatar={vi.fn()} />,
    );
    expect(screen.getByText("AZ")).toBeInTheDocument();
  });

  it("uploads a chosen file and reports the resolved URL", async () => {
    uploadMedia.mockResolvedValueOnce({ key: "avatars/x.png", url: "avatars/x.png", message: "Uploaded" });
    const onChange = vi.fn();
    render(<AvatarPicker name="Amai" value={undefined} onChange={onChange} onCheckGravatar={vi.fn()} />);

    const input = screen.getByLabelText("Upload a profile photo") as HTMLInputElement;
    const file = new File(["x"], "avatar.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("https://assets-s001.mukoko.com/avatars/x.png"));
  });

  it("sets the avatar to the found Gravatar URL", async () => {
    const onCheckGravatar = vi.fn().mockResolvedValueOnce("https://www.gravatar.com/avatar/abc");
    const onChange = vi.fn();
    render(<AvatarPicker name="Amai" value={undefined} onChange={onChange} onCheckGravatar={onCheckGravatar} />);

    fireEvent.click(screen.getByRole("button", { name: /use gravatar/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("https://www.gravatar.com/avatar/abc"));
  });

  it("shows a not-found message when there is no Gravatar", async () => {
    const onCheckGravatar = vi.fn().mockResolvedValueOnce(null);
    render(<AvatarPicker name="Amai" value={undefined} onChange={vi.fn()} onCheckGravatar={onCheckGravatar} />);

    fireEvent.click(screen.getByRole("button", { name: /use gravatar/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/no gravatar found/i);
  });

  it("sets the avatar to a clicked sticker", () => {
    const onChange = vi.fn();
    render(<AvatarPicker name="Amai" value={undefined} onChange={onChange} onCheckGravatar={vi.fn()} />);

    const sticker = AVATAR_STICKERS[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(sticker.label, "i") }));

    expect(onChange).toHaveBeenCalledWith(sticker.dataUri);
  });
});
