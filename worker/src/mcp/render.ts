/**
 * Inline-HTML renderers for MCP tool results.
 *
 * Per the nhimbe MCP brief, event results are returned as inline HTML: a
 * horizontally-scrolling CAROUSEL when there are several events, a single CARD
 * when there is one. The markup is fully self-contained (inline styles, no
 * external assets) so any MCP host that renders `text/html` resources shows it
 * verbatim, and it carries the nhimbe palette (tanzanite lead, warm-neutral
 * surfaces). All interpolated values are HTML-escaped.
 */

import type { AppEvent } from "./app-api";

const APP_ORIGIN = "https://nhimbe.com";

/** Escape the five HTML-significant characters so event text can't break out. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function eventUrl(ev: AppEvent): string {
  const path = ev.slug ? `/events/${ev.slug}` : `/events/${ev.id}`;
  return `${APP_ORIGIN}${path}`;
}

function whenLabel(ev: AppEvent): string {
  if (ev.date?.full) return ev.date.full + (ev.date.time ? ` · ${ev.date.time}` : "");
  if (ev.startDate) {
    const d = new Date(ev.startDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      });
    }
  }
  return "Date to be announced";
}

function whereLabel(ev: AppEvent): string {
  const loc = ev.location;
  if (!loc) return "Location to be announced";
  if (loc.type === "VirtualLocation" || ev.eventAttendanceMode === "OnlineEventAttendanceMode") {
    return "Online";
  }
  return [loc.name, loc.addressLocality].filter(Boolean).join(" · ") || "Location to be announced";
}

function priceLabel(ev: AppEvent): string {
  const price = ev.offers?.price;
  if (price == null || price === 0 || price === "0") return "Free";
  const currency = ev.offers?.priceCurrency ? `${ev.offers.priceCurrency} ` : "";
  return `${currency}${escapeHtml(price)}`;
}

/** A single event card. `flush` drops the outer wrapper for use inside a carousel. */
function cardMarkup(ev: AppEvent): string {
  const cover = ev.image
    ? `background-image:url('${escapeHtml(ev.image)}');background-size:cover;background-position:center;`
    : "background:radial-gradient(120% 140% at 82% -10%, rgba(179,136,255,0.40), transparent 60%),linear-gradient(120deg,#1E1D1A,#131211);";

  const category = ev.category
    ? `<span style="position:absolute;left:12px;top:12px;font:700 10px/1 system-ui;letter-spacing:.05em;text-transform:uppercase;color:#1A0033;background:#B388FF;padding:4px 9px;border-radius:9999px;">${escapeHtml(ev.category)}</span>`
    : "";

  const attendees =
    typeof ev.attendeeCount === "number" && ev.attendeeCount > 0
      ? `<span style="color:#B2AFA8;">${ev.attendeeCount} going</span>`
      : "";

  return `<a href="${escapeHtml(eventUrl(ev))}" style="display:block;text-decoration:none;color:#F5F5F4;background:#131211;border:1px solid #2A2927;border-radius:16px;overflow:hidden;min-width:260px;max-width:320px;font-family:system-ui,-apple-system,sans-serif;">
  <div style="position:relative;height:104px;border-bottom:1px solid #2A2927;${cover}">${category}</div>
  <div style="padding:14px;">
    <div style="font:600 12px/1.3 system-ui;color:#B388FF;letter-spacing:.02em;">${escapeHtml(whenLabel(ev))}</div>
    <div style="font:700 17px/1.25 Georgia,serif;margin:5px 0 6px;color:#F5F5F4;">${escapeHtml(ev.name)}</div>
    <div style="font:400 13px/1.4 system-ui;color:#B2AFA8;">${escapeHtml(whereLabel(ev))}</div>
    <div style="display:flex;gap:12px;margin-top:10px;font:600 12px/1 system-ui;">
      <span style="color:#64FFDA;">${escapeHtml(priceLabel(ev))}</span>
      ${attendees}
    </div>
  </div>
</a>`;
}

/** Render one event as a standalone card. */
export function renderEventCard(ev: AppEvent): string {
  return `<div style="max-width:340px;">${cardMarkup(ev)}</div>`;
}

/** Render many events as a horizontally-scrolling carousel (single card if one). */
export function renderEventCarousel(events: AppEvent[], heading?: string): string {
  if (events.length === 0) {
    return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#B2AFA8;padding:16px;">No matching events right now — try a wider area or different interests.</div>`;
  }
  if (events.length === 1) return renderEventCard(events[0]);

  const title = heading
    ? `<div style="font:700 14px/1.2 system-ui;color:#F5F5F4;margin:0 2px 10px;">${escapeHtml(heading)}</div>`
    : "";
  const cards = events.map(cardMarkup).join("");
  return `<div style="font-family:system-ui,-apple-system,sans-serif;">${title}<div style="display:flex;gap:14px;overflow-x:auto;padding:2px 2px 12px;">${cards}</div></div>`;
}

/** Plain-text fallback (the MCP `text` content block alongside the HTML resource). */
export function renderEventsText(events: AppEvent[]): string {
  if (events.length === 0) return "No matching events found.";
  return events
    .map((ev, i) => `${i + 1}. ${ev.name} — ${whenLabel(ev)} — ${whereLabel(ev)} (${priceLabel(ev)})\n   ${eventUrl(ev)}`)
    .join("\n");
}
