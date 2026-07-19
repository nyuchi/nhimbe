/**
 * Resend email client — fetch-based transactional sender (Vercel server runtime).
 *
 * Migrated from the retired Cloudflare Worker. No SDK needed; talks to the
 * Resend REST API directly. The API key is read from `RESEND_API_KEY` inside
 * this module — callers never pass it. Sending is best-effort: a missing key or
 * a Resend failure returns `{ success: false, ... }` and never throws, so email
 * can never break the request that triggered it.
 */

import "server-only";
import { createLogger } from "@/lib/observability";

const emailLog = createLogger("email");

/**
 * Every nhimbe transactional email is sent from this verified sender.
 * The sending domain (`notify.mukoko.com`) is the domain verified in Resend;
 * sending from an unverified domain is rejected by the API.
 */
const FROM_ADDRESS = "Nhimbe <events@notify.mukoko.com>";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface ResendResponse {
  id: string;
}

interface ResendError {
  statusCode: number;
  message: string;
  name: string;
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    emailLog.warn("RESEND_API_KEY not set — skipping email send");
    return { success: false, error: "RESEND_API_KEY not set" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = (await response.json()) as ResendError;
      emailLog.error("Resend API error", { data: { message: error.message } });
      return { success: false, error: error.message };
    }

    const data = (await response.json()) as ResendResponse;
    emailLog.info("Email sent", { data: { id: data.id } });
    return { success: true, id: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    emailLog.error("Failed to send email", {
      error: error instanceof Error ? error : new Error(message),
    });
    return { success: false, error: message };
  }
}
