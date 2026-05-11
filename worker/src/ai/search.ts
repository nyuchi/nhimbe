/**
 * RAG Search for nhimbe events.
 *
 * Vector similarity over Cloudflare Vectorize for the candidate set, then
 * full event metadata from Supabase events.event (mapped back to the legacy
 * API shape so the frontend keeps consuming it unchanged).
 */

import type { Env, Event, SearchQuery, SearchResult } from "../types";
import { generateEmbedding } from "./embeddings";
import { withTimeout } from "../utils/timeout";
import { withCircuitBreaker } from "../utils/circuit-breaker";
import { fetchEventsByIds } from "../db/event_mapper";

const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export async function searchEvents(env: Env, query: SearchQuery): Promise<SearchResult> {
  const queryEmbedding = await generateEmbedding(env.AI, query.query);

  const filter: Record<string, string | number | boolean> = {};
  if (query.filters?.city) filter.city = query.filters.city;
  if (query.filters?.category) filter.category = query.filters.category;

  const topK = Math.min(query.limit || 10, 100);
  const vectorResults = await withCircuitBreaker("vectorize", () =>
    env.VECTORIZE.query(queryEmbedding, {
      topK,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      returnMetadata: true,
    }),
  );

  if (!vectorResults || vectorResults.matches.length === 0) {
    return { events: [], query: query.query, totalResults: 0 };
  }

  const orderedIds = vectorResults.matches.map((m) => m.id);
  const events = await fetchEventsByIds(env, orderedIds);

  const aiSummary = await withCircuitBreaker(
    "ai",
    () => generateSearchSummary(env.AI, query.query, events),
    `Found ${events.length} events matching your search.`,
  );

  return {
    events,
    query: query.query,
    aiSummary: aiSummary || `Found ${events.length} events matching your search.`,
    totalResults: events.length,
  };
}

async function generateSearchSummary(
  ai: Env["AI"],
  query: string,
  events: Event[],
): Promise<string> {
  if (events.length === 0) return "No events found matching your search.";

  const eventDescriptions = events
    .slice(0, 5)
    .map(
      (e) =>
        `- "${e.name}" on ${e.date.full} at ${e.location.name}, ${e.location.addressLocality} (${e.category})`,
    )
    .join("\n");

  const prompt = `You are a helpful assistant for nhimbe, an African events platform.
Based on the user's search for "${query}", summarize these matching events in 2-3 sentences:

${eventDescriptions}

Be friendly, concise, and highlight what makes these events relevant to the search. Use the nhimbe tagline spirit: "Together we gather, together we grow".`;

  try {
    const response = await withTimeout(
      ai.run(LLM_MODEL, {
        messages: [
          { role: "system", content: "You are a helpful events assistant. Keep responses brief and friendly." },
          { role: "user", content: prompt },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
      10_000,
      null,
    );
    if (!response) return `Found ${events.length} events matching your search.`;
    const result = response as { response?: string };
    return result.response || "Found some great events for you!";
  } catch {
    return `Found ${events.length} events matching your search.`;
  }
}

export async function getRecommendations(
  env: Env,
  userInterests: string[],
  userCity?: string,
): Promise<Event[]> {
  const interestQuery = userInterests.join(" ");
  const queryEmbedding = await generateEmbedding(env.AI, interestQuery);

  const filter: Record<string, string | number | boolean> = {};
  if (userCity) filter.city = userCity;

  const vectorResults = await env.VECTORIZE.query(queryEmbedding, {
    topK: 6,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    returnMetadata: true,
  });

  if (vectorResults.matches.length === 0) return [];
  return fetchEventsByIds(env, vectorResults.matches.map((m) => m.id));
}

export async function findSimilarEvents(
  env: Env,
  eventId: string,
  limit = 4,
): Promise<Event[]> {
  const vectors = await env.VECTORIZE.getByIds([eventId]);
  if (vectors.length === 0) return [];

  const vectorResults = await env.VECTORIZE.query(vectors[0].values, {
    topK: limit + 1,
    returnMetadata: true,
  });

  const similarIds = vectorResults.matches
    .filter((m) => m.id !== eventId)
    .slice(0, limit)
    .map((m) => m.id);

  if (similarIds.length === 0) return [];
  return fetchEventsByIds(env, similarIds);
}
