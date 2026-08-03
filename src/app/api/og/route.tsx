import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Five African Minerals color gradients for OG images
const GRADIENTS = {
  malachite: "linear-gradient(135deg, #004D40 0%, #00796B 50%, #64FFDA 100%)",
  amethyst: "linear-gradient(135deg, #4B0082 0%, #7B1FA2 50%, #B388FF 100%)",
  amber: "linear-gradient(135deg, #5D4037 0%, #8B4513 50%, #FFD740 100%)",
  mixed: "linear-gradient(135deg, #004D40 0%, #4B0082 35%, #5D4037 70%, #00796B 100%)",
  sunset: "linear-gradient(135deg, #FF6B6B 0%, #FFD740 50%, #64FFDA 100%)",
};
const ACCENTS: Record<keyof typeof GRADIENTS, string> = {
  malachite: "#64FFDA",
  amethyst: "#B388FF",
  amber: "#FFD740",
  mixed: "#64FFDA",
  sunset: "#FFD740",
};
// The five African Minerals, used as scattered confetti dots (mzizi.dev's
// hexagon-confetti technique, reinterpreted with nhimbe's own circular
// "seed" motif rather than mzizi's hexagon/bee imagery).
const MINERAL_DOTS = ["#64FFDA", "#B388FF", "#FFD740", "#FF6B6B", "#8B4513"];
const CONFETTI: Array<{ top?: number; bottom?: number; left?: number; right?: number; size: number; color: string; opacity: number }> = [
  { top: 56, right: 80, size: 22, color: MINERAL_DOTS[0], opacity: 0.5 },
  { top: 120, right: 200, size: 14, color: MINERAL_DOTS[2], opacity: 0.4 },
  { top: 40, right: 340, size: 16, color: MINERAL_DOTS[1], opacity: 0.35 },
  { bottom: 190, right: 60, size: 26, color: MINERAL_DOTS[3], opacity: 0.4 },
  { bottom: 90, right: 170, size: 12, color: MINERAL_DOTS[2], opacity: 0.5 },
  { bottom: 260, right: 260, size: 18, color: MINERAL_DOTS[4], opacity: 0.35 },
  { bottom: 40, left: 420, size: 14, color: MINERAL_DOTS[0], opacity: 0.3 },
];

// Sanitize text input to prevent XSS and injection attacks
function sanitizeText(input: string | null, maxLength: number = 200): string {
  if (!input) return "";

  // Limit length first to bound processing time, then strip dangerous chars.
  // Use character-class-only replacement (no nested quantifiers) to avoid ReDoS.
  let sanitized = input.slice(0, maxLength);

  // Iteratively strip tags until stable to handle nested/malformed tags like "<<script>"
  let previous = "";
  while (previous !== sanitized) {
    previous = sanitized;
    sanitized = sanitized.replace(/<[^>]*>/g, "");
  }

  // Remove remaining dangerous characters
  sanitized = sanitized.replace(/[<>'"&]/g, "").trim();

  return sanitized;
}

/**
 * Fetch a Google Font as a TTF ArrayBuffer for Satori (next/og), subset to
 * only the glyphs actually used on this card. Requests a legacy desktop-Safari
 * user agent because Google's CSS API serves woff2 (unsupported by Satori) to
 * modern user agents but ttf/woff to older ones.
 */
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  if (!text) return null;
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (
      await fetch(cssUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36" },
      })
    ).text();
    const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch (e) {
    console.error(`[mukoko] loadGoogleFont(${family}) failed`, e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url);

    // Get and sanitize parameters
    const title = sanitizeText(searchParams.get("title"), 100) || "Nhimbe";
    const subtitle = sanitizeText(searchParams.get("subtitle"), 200) || "Together we gather, together we grow";
    const date = sanitizeText(searchParams.get("date"), 50);
    const location = sanitizeText(searchParams.get("location"), 100);
    const category = sanitizeText(searchParams.get("category"), 50);
    const url = sanitizeText(searchParams.get("url"), 80);
    const gradientParam = sanitizeText(searchParams.get("gradient"), 20);
    const gradient = (Object.keys(GRADIENTS).includes(gradientParam) ? gradientParam : "mixed") as keyof typeof GRADIENTS;
    const type = sanitizeText(searchParams.get("type"), 20) || "event"; // event, default

    const gradientStyle = GRADIENTS[gradient] || GRADIENTS.mixed;
    const accent = ACCENTS[gradient] || ACCENTS.mixed;

    const kicker = category ? category.toUpperCase() : "COMMUNITY EVENTS";
    const metaLine = [date, location].filter(Boolean).join("   ·   ");

    // Glyph-subset each font to only the text it actually renders, per the
    // Satori/next-og convention — keeps each fetch small and fast.
    const [serifBold, sansRegular, sansMedium, monoMedium] = await Promise.all([
      loadGoogleFont("Noto Serif", 700, title),
      loadGoogleFont("Noto Sans", 400, `Nhimbe${subtitle}`),
      loadGoogleFont("Noto Sans", 600, "Nhimbe"),
      loadGoogleFont("JetBrains Mono", 500, `${kicker}${metaLine}${url}·`),
    ]);

    const fonts = [
      serifBold && { name: "Noto Serif", data: serifBold, weight: 700 as const, style: "normal" as const },
      sansRegular && { name: "Noto Sans", data: sansRegular, weight: 400 as const, style: "normal" as const },
      sansMedium && { name: "Noto Sans", data: sansMedium, weight: 600 as const, style: "normal" as const },
      monoMedium && { name: "JetBrains Mono", data: monoMedium, weight: 500 as const, style: "normal" as const },
    ].filter((f): f is NonNullable<typeof f> => Boolean(f));

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            background: gradientStyle,
            position: "relative",
            fontFamily: "Noto Sans",
          }}
        >
          {/* Near-black wash over the full-bleed gradient — an rgba() overlay
              (not div-level `opacity`, which satori doesn't reliably blend
              over a gradient) so the mineral colors stay visible but muted,
              mzizi.dev-style. */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(6,6,8,0.86)", display: "flex" }} />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "radial-gradient(circle at 8% 92%, rgba(255,255,255,0.10) 0%, transparent 50%)",
              display: "flex",
            }}
          />

          {/* Scattered mineral confetti dots — nhimbe's own circular take on
              mzizi.dev's hexagon-confetti card background. Satori requires
              every absolute-position side actually set (no `undefined`), so
              unset sides are omitted from the style object entirely rather
              than passed as `undefined` or `"auto"`. */}
          {CONFETTI.map((dot, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                ...(dot.top !== undefined ? { top: dot.top } : {}),
                ...(dot.bottom !== undefined ? { bottom: dot.bottom } : {}),
                ...(dot.left !== undefined ? { left: dot.left } : {}),
                ...(dot.right !== undefined ? { right: dot.right } : {}),
                width: dot.size,
                height: dot.size,
                borderRadius: "50%",
                background: dot.color,
                opacity: dot.opacity,
                display: "flex",
              }}
            />
          ))}

          {/* Content column — generous padding on all sides (nothing pinned
              to the literal canvas edge) with the body vertically centered
              so title placement stays consistent whether metadata is present
              or not. */}
          <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", padding: "56px 72px" }}>
            {/* Header: brand mark + wordmark (Noto Sans — only the title is
                set in the serif heading face) */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${origin}/app-icon-192.png`} width={40} height={40} alt="" />
              <span style={{ fontFamily: "Noto Sans", fontSize: 24, fontWeight: 600, color: "#FFFFFF" }}>Nhimbe</span>
            </div>

            {/* Body */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, maxWidth: "88%" }}>
              <span
                style={{
                  fontFamily: "JetBrains Mono",
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: 4,
                  color: accent,
                }}
              >
                {kicker}
              </span>

              <h1
                style={{
                  fontFamily: "Noto Serif",
                  fontSize: type === "default" ? 66 : 52,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  lineHeight: 1.15,
                  margin: 0,
                }}
              >
                {title}
              </h1>

              {subtitle && (
                <p style={{ fontFamily: "Noto Sans", fontSize: 23, color: "rgba(255,255,255,0.72)", margin: 0, lineHeight: 1.4 }}>
                  {subtitle}
                </p>
              )}

              {metaLine && (
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 18, color: "rgba(255,255,255,0.85)" }}>{metaLine}</span>
              )}
            </div>

            {/* Footer — the event's own link, mono + accent-coloured, the
                way mzizi.dev signs its card off with "mzizi.dev". */}
            {url && (
              <div style={{ display: "flex", paddingTop: 8 }}>
                <span style={{ fontFamily: "JetBrains Mono", fontSize: 18, fontWeight: 500, color: accent }}>{url}</span>
              </div>
            )}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts,
      }
    );
  } catch (e) {
    console.error("[mukoko] GET /api/og failed", e);
    return new Response("Failed to generate image", { status: 500 });
  }
}
