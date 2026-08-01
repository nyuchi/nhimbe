import { describe, it, expect } from "vitest";
import { AVATAR_STICKERS, isStickerAvatar } from "./avatar-stickers";

describe("avatar stickers", () => {
  it("has one sticker per brand mineral with a unique id and data URI", () => {
    expect(AVATAR_STICKERS.length).toBe(7);
    const ids = new Set(AVATAR_STICKERS.map((s) => s.id));
    const uris = new Set(AVATAR_STICKERS.map((s) => s.dataUri));
    expect(ids.size).toBe(AVATAR_STICKERS.length);
    expect(uris.size).toBe(AVATAR_STICKERS.length);
  });

  it("encodes each sticker as a self-contained SVG data URI", () => {
    for (const sticker of AVATAR_STICKERS) {
      expect(sticker.dataUri).toMatch(/^data:image\/svg\+xml,/);
      const decoded = decodeURIComponent(sticker.dataUri.replace(/^data:image\/svg\+xml,/, ""));
      expect(decoded).toContain(sticker.color);
      expect(decoded).toContain("<svg");
    }
  });

  it("isStickerAvatar recognizes preset URIs and rejects everything else", () => {
    expect(isStickerAvatar(AVATAR_STICKERS[0].dataUri)).toBe(true);
    expect(isStickerAvatar("https://example.com/avatar.png")).toBe(false);
    expect(isStickerAvatar(undefined)).toBe(false);
    expect(isStickerAvatar(null)).toBe(false);
  });
});
