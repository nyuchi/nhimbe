import type { Env, AnalyticsQueueMessage, EmailQueueMessage } from "../types";
import { sendEmail } from "../email/resend";
import * as templates from "../email/templates";
import { supabaseFetch } from "../db/supabase";

export async function processAnalyticsMessage(message: AnalyticsQueueMessage, env: Env): Promise<void> {
  console.log(`[mukoko:queue] Processing analytics: ${message.type} for event ${message.eventId}`);

  if (env.ANALYTICS) {
    env.ANALYTICS.writeDataPoint({
      blobs: [message.type, message.eventId, message.userId || "anonymous"],
      doubles: [Date.now()],
      indexes: [message.type],
    });
  }

  switch (message.type) {
    case "view": {
      // Atomic increment via SECURITY DEFINER function — concurrent views
      // don't lose increments to the read-modify-write race.
      try {
        await supabaseFetch(env, {
          schema: "events",
          path: "rpc/increment_view_count",
          method: "POST",
          body: { p_event_id: message.eventId },
        });
      } catch (err) {
        console.error("[mukoko:queue] Failed to bump view_count:", err);
      }
      break;
    }
    case "rsvp":
    case "referral":
    case "review":
      // Counters for these flows are bumped at write-time inside their route
      // handlers; nothing additional to do on the analytics bus yet.
      break;
  }
}

const SITE_URL = "https://nhimbe.com";

export async function processEmailMessage(message: EmailQueueMessage, env: Env): Promise<void> {
  console.log(`[mukoko:queue] Processing email: ${message.type} to ${message.to}`);

  if (!env.RESEND_API_KEY) {
    console.warn("[mukoko:queue] RESEND_API_KEY not set — skipping email");
    return;
  }

  const data = message.templateData as Record<string, unknown>;
  let template: { subject: string; html: string; text: string };

  switch (message.type) {
    case "registration_confirmation":
      template = templates.registrationConfirmed({
        userName: (data.userName as string) || "there",
        eventName: (data.eventName as string) || "Event",
        eventDate: (data.eventDate as string) || "",
        eventLocation: (data.eventLocation as string) || "",
        eventUrl: `${SITE_URL}/events/${data.eventId}`,
      });
      break;
    case "event_reminder":
      template = templates.eventReminder({
        userName: (data.userName as string) || "there",
        eventName: (data.eventName as string) || "Event",
        eventDate: (data.eventDate as string) || "",
        eventLocation: (data.eventLocation as string) || "",
        eventUrl: `${SITE_URL}/events/${data.eventId}`,
      });
      break;
    case "event_cancelled":
      template = templates.eventCancelled({
        userName: (data.userName as string) || "there",
        eventName: (data.eventName as string) || "Event",
        eventDate: (data.eventDate as string) || "",
      });
      break;
    case "host_new_registration":
      template = templates.hostNewRegistration({
        hostName: (data.hostName as string) || "Host",
        attendeeName: (data.attendeeName as string) || "Someone",
        eventName: (data.eventName as string) || "Event",
        attendeeCount: (data.attendeeCount as number) || 0,
        eventUrl: `${SITE_URL}/events/${data.eventId}`,
      });
      break;
    case "registration_cancelled":
      template = templates.registrationCancelled({
        userName: (data.userName as string) || "there",
        eventName: (data.eventName as string) || "Event",
        eventDate: (data.eventDate as string) || "",
      });
      break;
    default:
      console.warn(`[mukoko:queue] Unknown email type: ${message.type}`);
      return;
  }

  await sendEmail(env.RESEND_API_KEY, {
    from: (data.from as string) || "nhimbe <notifications@nhimbe.com>",
    to: message.to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}
