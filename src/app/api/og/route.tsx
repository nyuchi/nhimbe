import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams, origin } = new URL(request.url);

    // Get and sanitize parameters
    const title = sanitizeText(searchParams.get("title"), 100) || "Nhimbe";
    const subtitle = sanitizeText(searchParams.get("subtitle"), 200) || "Together we gather, together we grow";
    const date = sanitizeText(searchParams.get("date"), 50);
    const location = sanitizeText(searchParams.get("location"), 100);
    const category = sanitizeText(searchParams.get("category"), 50);
    const gradientParam = sanitizeText(searchParams.get("gradient"), 20);
    const gradient = (Object.keys(GRADIENTS).includes(gradientParam) ? gradientParam : "mixed") as keyof typeof GRADIENTS;
    const type = sanitizeText(searchParams.get("type"), 20) || "event"; // event, default

    const gradientStyle = GRADIENTS[gradient] || GRADIENTS.mixed;
    const accent = ACCENTS[gradient] || ACCENTS.mixed;

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
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 15% 15%, rgba(255,255,255,0.16) 0%, transparent 45%)",
              display: "flex",
            }}
          />

          {/* Decorative accent blooms, kept behind the content card */}
          <div
            style={{
              position: "absolute",
              top: -60,
              right: -40,
              width: 320,
              height: 320,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`,
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -80,
              left: -60,
              width: 280,
              height: 280,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(179,136,255,0.25) 0%, transparent 70%)",
              display: "flex",
            }}
          />

          {/* Content card — the GitHub-style structured frame: a header row,
              a body that always centers the title/description regardless of
              how much metadata is present, and a footer strip. Nothing is
              pinned to the literal top or bottom edge of the canvas. */}
          <div
            style={{
              position: "relative",
              margin: 48,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(10,10,10,0.38)",
              padding: "44px 56px",
            }}
          >
            {/* Header: brand mark left, category pill right */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${origin}/app-icon-192.png`} width={44} height={44} alt="" />
                <span style={{ fontSize: 26, fontWeight: 600, color: "#FFFFFF" }}>Nhimbe</span>
              </div>
              {category && (
                <div
                  style={{
                    display: "flex",
                    background: accent,
                    color: "#0A0A0A",
                    padding: "8px 18px",
                    borderRadius: 9999,
                    fontSize: 15,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {category}
                </div>
              )}
            </div>

            {/* Body — vertically centered so the title always lands in the
                same visual zone whether or not date/location are present. */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 18,
                maxWidth: "92%",
              }}
            >
              <h1
                style={{
                  fontSize: type === "default" ? 68 : 54,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  lineHeight: 1.15,
                  margin: 0,
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  style={{
                    fontSize: 24,
                    color: "rgba(255,255,255,0.72)",
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>

            {/* Footer strip — date/location pills left, domain right; the
                same structural row every render, GitHub-stats-row style. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 24,
                borderTop: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {date && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19, color: accent }}>
                    <span>📅</span>
                    <span>{date}</span>
                  </div>
                )}
                {location && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 19,
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    <span>📍</span>
                    <span>{location}</span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 17, color: "rgba(255,255,255,0.45)" }}>events.mukoko.com</span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error("[mukoko] GET /api/og failed", e);
    return new Response("Failed to generate image", { status: 500 });
  }
}
