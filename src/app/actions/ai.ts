"use server";

/**
 * Shamwari — AI event-description generation (server action).
 *
 * "Shamwari" means "friend" in Shona: the AI that helps hosts write compelling
 * event descriptions. This replaces the retired worker's `/api/ai/description/*`
 * routes. Generation now runs on Vercel's server runtime and calls Qwen through
 * the Shamwari Cloudflare AI Gateway (`src/lib/ai/gateway.ts`).
 *
 * Prompts are ported verbatim from the worker so hosts get the same voice.
 * When the gateway isn't configured (or errors), we degrade to a deterministic
 * fallback description rather than surfacing a 500 — the wizard stays usable.
 */

import { chat, isGatewayConfigured } from "@/lib/ai/gateway";
import type { DescriptionContext, GeneratedDescription } from "@/lib/api";

const SYSTEM_PROMPT = `You are Shamwari, the AI assistant for nhimbe - an African events platform.
"Shamwari" means "friend" in Shona, and you help hosts create compelling event descriptions.

Guidelines:
- Write in a warm, inviting tone that reflects Ubuntu philosophy: "Together we gather, together we grow"
- Keep descriptions concise but informative (2-3 short paragraphs, about 100-150 words)
- Start with a hook that captures attention
- Clearly communicate what attendees will experience or learn
- End with a call to action or reason to attend
- Use inclusive language that welcomes diverse attendees
- Avoid clichés and generic marketing speak
- Make it easy to scan with clear structure
- Do NOT use emojis unless the event is very casual/fun`;

function userPrompt(context: DescriptionContext): string {
  return `Generate an event description based on these details:

Event Name: ${context.eventName || "Not specified"}
Category: ${context.category || "Community"}
Format: ${context.isOnline ? "Online/Virtual" : "In-person"}
Event Type: ${context.eventType || "Not specified"}
Target Audience: ${context.targetAudience || "General public"}
What Attendees Will Gain: ${context.keyTakeaways || "Not specified"}
Special Highlights: ${context.highlights || "None specified"}

Write a compelling description that would make someone want to attend this event. Only output the description text, nothing else.`;
}

/**
 * Generate an event description from the wizard answers. Falls back to a
 * deterministic template if the gateway is unconfigured or fails.
 */
export async function generateEventDescription(
  context: DescriptionContext,
): Promise<GeneratedDescription> {
  if (!isGatewayConfigured()) {
    return { description: fallbackDescription(context) };
  }

  try {
    const text = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(context) },
      ],
      { maxTokens: 400, temperature: 0.7, timeoutMs: 15_000 },
    );
    const description = text.trim() || fallbackDescription(context);
    return { description, suggestions: await generateSuggestions(description) };
  } catch (err) {
    console.error("[shamwari] description generation failed:", err);
    return { description: fallbackDescription(context) };
  }
}

/**
 * Rewrite a description in response to host feedback ("make it shorter", etc.).
 */
export async function regenerateEventDescription(
  context: DescriptionContext,
  feedback: string,
): Promise<GeneratedDescription> {
  if (!isGatewayConfigured()) {
    return { description: fallbackDescription(context) };
  }

  const system = `You are a skilled event copywriter for nhimbe, an African events platform.
Rewrite the event description based on the user's feedback.

Guidelines:
- Write in a warm, inviting tone
- Keep descriptions concise (2-3 paragraphs, about 100-150 words)
- Address the specific feedback provided
- Do NOT use emojis unless requested`;

  const user = `Rewrite this event description with the following adjustment:

Event Name: ${context.eventName || "Not specified"}
Category: ${context.category || "Community"}
Event Type: ${context.eventType || "Not specified"}
Target Audience: ${context.targetAudience || "General public"}

User feedback: ${feedback}

Write an improved description that addresses this feedback. Only output the description text.`;

  try {
    const text = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { maxTokens: 400, temperature: 0.7, timeoutMs: 15_000 },
    );
    return { description: text.trim() || fallbackDescription(context) };
  } catch (err) {
    console.error("[shamwari] description regeneration failed:", err);
    return { description: fallbackDescription(context) };
  }
}

/** Ask the model for 2-3 improvement suggestions. Best-effort — empty on failure. */
async function generateSuggestions(description: string): Promise<string[]> {
  try {
    const text = await chat(
      [
        {
          role: "system",
          content:
            "You are an event marketing expert. Analyze descriptions and suggest specific improvements. Return only a JSON array of 2-3 short suggestions.",
        },
        {
          role: "user",
          content: `Analyze this event description and provide 2-3 brief suggestions for improvement:\n\n"${description}"\n\nRespond with JSON array only, like: ["suggestion 1", "suggestion 2"]`,
        },
      ],
      { maxTokens: 150, temperature: 0.5, timeoutMs: 10_000 },
    );
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed: unknown = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === "string").slice(0, 3);
      }
    }
  } catch {
    // Suggestions are optional; never let them break generation.
  }
  return [];
}

/** Deterministic description used when the gateway is unavailable. */
function fallbackDescription(context: DescriptionContext): string {
  const parts: string[] = [];
  parts.push(context.eventType ? `Join us for ${context.eventType.toLowerCase()}` : "Join us for this gathering");
  if (context.targetAudience) parts.push(`designed for ${context.targetAudience.toLowerCase()}`);

  let description = parts.join(" ") + ".";
  if (context.keyTakeaways) description += ` ${context.keyTakeaways}`;
  if (context.highlights) description += `\n\nHighlights: ${context.highlights}`;
  description += "\n\nWe look forward to seeing you there!";
  return description;
}
