"use server";

/**
 * Event search server action (Vercel server runtime → MongoDB Atlas Vector
 * Search, with a Qwen summary from the Shamwari gateway).
 *
 * This replaces the retired worker's `/api/search` RAG route. The browser calls
 * `searchEventsAction` directly; all data + AI access stays server-side.
 */

import { chat, isGatewayConfigured } from "@/lib/ai/gateway";
import { semanticSearchEvents, autocompleteEventNames, type SearchMode } from "@/lib/mongo/search";
import type { Event } from "@/lib/api";

export interface SearchEventsResult {
  events: Event[];
  query: string;
  /** One-line friendly summary of the results (Qwen), or a deterministic line. */
  aiSummary: string;
  totalResults: number;
  /** How results were retrieved — "hybrid" (vector⊕text), "vector", or "text". */
  mode: SearchMode;
}

/**
 * Search events semantically and return a short AI summary. Degrades
 * gracefully: no gateway → text search + a plain summary; the action never
 * throws for the expected failure modes.
 */
export async function searchEventsAction(input: {
  query: string;
  limit?: number;
  city?: string;
  category?: string;
}): Promise<SearchEventsResult> {
  const query = input.query?.trim() ?? "";
  if (!query) {
    return { events: [], query: "", aiSummary: "", totalResults: 0, mode: "text" };
  }

  const { events, mode } = await semanticSearchEvents({
    query,
    limit: input.limit,
    city: input.city,
    category: input.category,
  });

  const fallbackSummary =
    events.length === 0
      ? "No events found matching your search."
      : `Found ${events.length} event${events.length === 1 ? "" : "s"} matching your search.`;

  return {
    events,
    query,
    aiSummary: await summarize(query, events, fallbackSummary),
    totalResults: events.length,
    mode,
  };
}

/**
 * Type-ahead suggestions for the search box (event-name prefixes). Best-effort:
 * returns [] for short/empty prefixes or any backend hiccup, so the UI can call
 * it on every keystroke without guarding.
 */
export async function autocompleteEventsAction(prefix: string): Promise<string[]> {
  const q = prefix?.trim() ?? "";
  if (q.length < 2) return [];
  try {
    return await autocompleteEventNames(q, 6);
  } catch {
    return [];
  }
}

/** Ask Qwen for a 2-3 sentence summary of the matches. Best-effort. */
async function summarize(query: string, events: Event[], fallback: string): Promise<string> {
  if (events.length === 0 || !isGatewayConfigured()) return fallback;

  const list = events
    .slice(0, 5)
    .map(
      (e) =>
        `- "${e.name}" on ${e.date.full} at ${e.location.name}, ${e.location.addressLocality} (${e.category})`,
    )
    .join("\n");

  const prompt = `You are a helpful assistant for Nhimbe, an African events platform.
Based on the user's search for "${query}", summarize these matching events in 2-3 sentences:

${list}

Be friendly, concise, and highlight what makes these events relevant to the search. Use the Nhimbe tagline spirit: "Together we gather, together we grow".`;

  try {
    const text = await chat(
      [
        {
          role: "system",
          content: "You are a helpful events assistant. Keep responses brief and friendly.",
        },
        { role: "user", content: prompt },
      ],
      { maxTokens: 150, temperature: 0.7, timeoutMs: 10_000 },
    );
    return text || fallback;
  } catch {
    return fallback;
  }
}
