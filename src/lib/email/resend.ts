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

/**
 * Every nhimbe transactional email is sent from this verified sender.
 * The sending domain (`notify.mukoko.com`) is the domain verified in Resend;
 * sending from an unverified domain is rejected by the API.
 */
const FROM_ADDRESS = "nhimbe <events@notify.mukoko.com>";

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
    console.warn("[mukoko:email] RESEND_API_KEY not set — skipping email send");
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
      console.error(`[mukoko:email] Resend API error: ${error.message}`);
      return { success: false, error: error.message };
    }

    const data = (await response.json()) as ResendResponse;
    console.log(`[mukoko:email] Email sent successfully: ${data.id}`);
    return { success: true, id: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[mukoko:email] Failed to send email: ${message}`);
    return { success: false, error: message };
  }
}
