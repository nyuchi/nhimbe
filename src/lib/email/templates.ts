/**
 * Email templates for nhimbe transactional emails.
 * Each template returns HTML + plain text versions.
 *
 * Migrated from the retired Cloudflare Worker. The shared wrapper now uses the
 * tanzanite palette (primary moved from malachite `#64FFDA` to `#B388FF`).
 */

interface TemplateResult {
  subject: string;
  html: string;
  text: string;
}

// Shared email wrapper with nhimbe branding (tanzanite palette)
function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #0a0a0a; color: #e4e4e7; }
    .container { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
    .header { text-align: center; margin-bottom: 32px; }
    .header h1 { font-size: 18px; color: #B388FF; margin: 0; letter-spacing: 0.5px; }
    .content { background: #18181b; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .event-name { font-size: 20px; font-weight: 600; color: #fafafa; margin: 0 0 12px; }
    .detail { font-size: 14px; color: #a1a1aa; margin: 4px 0; }
    .cta { display: inline-block; background: #B388FF; color: #1A0033; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 16px; }
    .footer { text-align: center; font-size: 12px; color: #71717a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Nhimbe</h1></div>
    ${content}
    <div class="footer">
      <p>Nhimbe — together we gather, together we grow</p>
    </div>
  </div>
</body>
</html>`;
}

// Registration confirmation
export function registrationConfirmed(data: {
  userName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  eventUrl: string;
}): TemplateResult {
  return {
    subject: `You're registered for ${data.eventName}`,
    html: wrapHtml(`
      <div class="content">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${data.userName},</p>
        <p style="margin: 0 0 16px; font-size: 15px;">You're registered for:</p>
        <p class="event-name">${data.eventName}</p>
        <p class="detail">📅 ${data.eventDate}</p>
        <p class="detail">📍 ${data.eventLocation}</p>
        <a href="${data.eventUrl}" class="cta">View Event Details</a>
      </div>
    `),
    text: `Hi ${data.userName},\n\nYou're registered for ${data.eventName}!\n\nDate: ${data.eventDate}\nLocation: ${data.eventLocation}\n\nView details: ${data.eventUrl}\n\n— Nhimbe`,
  };
}

// Event reminder (24h before)
export function eventReminder(data: {
  userName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  eventUrl: string;
}): TemplateResult {
  return {
    subject: `Reminder: ${data.eventName} is tomorrow`,
    html: wrapHtml(`
      <div class="content">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${data.userName},</p>
        <p style="margin: 0 0 16px; font-size: 15px;">Just a reminder — your event is tomorrow:</p>
        <p class="event-name">${data.eventName}</p>
        <p class="detail">📅 ${data.eventDate}</p>
        <p class="detail">📍 ${data.eventLocation}</p>
        <a href="${data.eventUrl}" class="cta">View Event</a>
      </div>
    `),
    text: `Hi ${data.userName},\n\nReminder: ${data.eventName} is tomorrow!\n\nDate: ${data.eventDate}\nLocation: ${data.eventLocation}\n\nView details: ${data.eventUrl}\n\n— Nhimbe`,
  };
}

// Event cancelled
export function eventCancelled(data: {
  userName: string;
  eventName: string;
  eventDate: string;
}): TemplateResult {
  return {
    subject: `${data.eventName} has been cancelled`,
    html: wrapHtml(`
      <div class="content">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${data.userName},</p>
        <p style="margin: 0 0 16px; font-size: 15px;">Unfortunately, the following event has been cancelled:</p>
        <p class="event-name">${data.eventName}</p>
        <p class="detail">📅 ${data.eventDate}</p>
        <p style="margin: 16px 0 0; font-size: 14px; color: #a1a1aa;">
          We apologize for any inconvenience. Check out other events on Nhimbe.
        </p>
      </div>
    `),
    text: `Hi ${data.userName},\n\nUnfortunately, ${data.eventName} (${data.eventDate}) has been cancelled.\n\nWe apologize for any inconvenience.\n\n— Nhimbe`,
  };
}

// Host notification: new registration
export function hostNewRegistration(data: {
  hostName: string;
  attendeeName: string;
  eventName: string;
  attendeeCount: number;
  eventUrl: string;
}): TemplateResult {
  return {
    subject: `${data.attendeeName} registered for ${data.eventName}`,
    html: wrapHtml(`
      <div class="content">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${data.hostName},</p>
        <p style="margin: 0 0 16px; font-size: 15px;">
          <strong>${data.attendeeName}</strong> just registered for your event:
        </p>
        <p class="event-name">${data.eventName}</p>
        <p class="detail">Total attendees: ${data.attendeeCount}</p>
        <a href="${data.eventUrl}" class="cta">Manage Event</a>
      </div>
    `),
    text: `Hi ${data.hostName},\n\n${data.attendeeName} registered for ${data.eventName}.\n\nTotal attendees: ${data.attendeeCount}\n\nManage: ${data.eventUrl}\n\n— Nhimbe`,
  };
}

/** Minimal HTML escape for user-authored text interpolated into templates. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Host update posted — sent to subscribed attendees + the event team
export function eventUpdatePosted(data: {
  eventName: string;
  updateText: string;
  eventUrl: string;
}): TemplateResult {
  const safeText = escapeHtml(data.updateText).replace(/\n/g, "<br>");
  return {
    subject: `Update from the host: ${data.eventName}`,
    html: wrapHtml(`
      <div class="content">
        <p style="margin: 0 0 16px; font-size: 15px;">The host posted an update for:</p>
        <p class="event-name">${data.eventName}</p>
        <p style="margin: 0 0 16px; font-size: 15px;">${safeText}</p>
        <a href="${data.eventUrl}" class="cta">View Event</a>
        <p style="margin: 16px 0 0; font-size: 12px; color: #8a8a8a;">
          You're receiving this because you subscribed to updates for this event.
          Manage this in your profile preferences.
        </p>
      </div>
    `),
    text: `Update for ${data.eventName}:\n\n${data.updateText}\n\nView event: ${data.eventUrl}\n\nYou're receiving this because you subscribed to updates for this event. Manage this in your profile preferences.\n\n— Nhimbe`,
  };
}

// Registration cancelled
export function registrationCancelled(data: {
  userName: string;
  eventName: string;
  eventDate: string;
}): TemplateResult {
  return {
    subject: `Registration cancelled: ${data.eventName}`,
    html: wrapHtml(`
      <div class="content">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${data.userName},</p>
        <p style="margin: 0 0 16px; font-size: 15px;">
          Your registration for the following event has been cancelled:
        </p>
        <p class="event-name">${data.eventName}</p>
        <p class="detail">📅 ${data.eventDate}</p>
      </div>
    `),
    text: `Hi ${data.userName},\n\nYour registration for ${data.eventName} (${data.eventDate}) has been cancelled.\n\n— Nhimbe`,
  };
}

// User feedback / error report → support inbox
export function feedbackReceived(data: {
  category: string;
  message: string;
  path?: string;
  userAgent?: string;
  errorDigest?: string;
  reporter?: string;
}): TemplateResult {
  const safeMessage = escapeHtml(data.message).replace(/\n/g, "<br>");
  const rows: string[] = [
    `<p class="detail"><strong>Category:</strong> ${escapeHtml(data.category)}</p>`,
    `<p class="detail"><strong>Reporter:</strong> ${escapeHtml(data.reporter || "Anonymous")}</p>`,
  ];
  if (data.path) rows.push(`<p class="detail"><strong>Path:</strong> ${escapeHtml(data.path)}</p>`);
  if (data.errorDigest)
    rows.push(`<p class="detail"><strong>Error digest:</strong> ${escapeHtml(data.errorDigest)}</p>`);
  if (data.userAgent)
    rows.push(`<p class="detail"><strong>User agent:</strong> ${escapeHtml(data.userAgent)}</p>`);

  const textLines = [
    `Category: ${data.category}`,
    `Reporter: ${data.reporter || "Anonymous"}`,
    data.path ? `Path: ${data.path}` : null,
    data.errorDigest ? `Error digest: ${data.errorDigest}` : null,
    data.userAgent ? `User agent: ${data.userAgent}` : null,
    "",
    data.message,
  ].filter((l): l is string => l !== null);

  return {
    subject: `New ${data.category} feedback from Nhimbe`,
    html: wrapHtml(`
      <div class="content">
        <p class="event-name">New feedback</p>
        ${rows.join("\n        ")}
        <p style="margin: 16px 0 0; font-size: 15px;">${safeMessage}</p>
      </div>
    `),
    text: `${textLines.join("\n")}\n\n— Nhimbe`,
  };
}
