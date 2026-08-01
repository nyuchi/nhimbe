/**
 * Preset "sticker" avatars — a fixed set of self-contained inline-SVG data
 * URIs, one per brand mineral, so picking one needs no upload, no external
 * request, and no rasterization step. A data: URI passes straight through
 * `getMediaUrl()` and renders wherever `picture`/`avatar` is used as an
 * <img>/<Image> src, so no consumer needs special-casing.
 *
 * Colours match the vivid (dark-mode) mineral swatches in globals.css — fixed
 * or the sticker would read wrong-tinted whichever theme it's rendered in.
 */

export interface AvatarSticker {
  id: string;
  label: string;
  color: string;
  emoji: string;
  dataUri: string;
}

function buildStickerDataUri(color: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${color}"/><text x="32" y="43" font-size="32" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const STICKER_SOURCE: { id: string; label: string; color: string; emoji: string }[] = [
  { id: "tanzanite-bee", label: "Bee", color: "#B388FF", emoji: "🐝" },
  { id: "cobalt-wave", label: "Wave", color: "#00B0FF", emoji: "🌊" },
  { id: "malachite-leaf", label: "Leaf", color: "#64FFDA", emoji: "🌿" },
  { id: "gold-star", label: "Star", color: "#FFD740", emoji: "⭐" },
  { id: "terracotta-earth", label: "Earth", color: "#A0522D", emoji: "🌍" },
  { id: "sodalite-moon", label: "Moon", color: "#3D5AFE", emoji: "🌙" },
  { id: "copper-fire", label: "Fire", color: "#BF5A36", emoji: "🔥" },
];

export const AVATAR_STICKERS: AvatarSticker[] = STICKER_SOURCE.map((s) => ({
  ...s,
  dataUri: buildStickerDataUri(s.color, s.emoji),
}));

/** True when `value` is one of the preset sticker data URIs. */
export function isStickerAvatar(value: string | null | undefined): boolean {
  return !!value && AVATAR_STICKERS.some((s) => s.dataUri === value);
}
