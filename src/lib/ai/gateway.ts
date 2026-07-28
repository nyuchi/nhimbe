/**
 * Shamwari AI Gateway client (Cloudflare AI Gateway).
 *
 * nhimbe's AI — text generation (Qwen) and embeddings (BGE) — runs through the
 * "shamwari" Cloudflare AI Gateway, called over HTTPS from Vercel's server
 * runtime. This replaces the retired worker's direct Workers AI bindings.
 * Retrieval is MongoDB Atlas Vector Search over embeddings produced here.
 *
 * Cloudflare is now used for exactly two things: R2 storage and this gateway.
 *
 * Config (set on Vercel, server-only):
 *   SHAMWARI_AI_GATEWAY_URL        — gateway base for the Workers AI provider, e.g.
 *     https://gateway.ai.cloudflare.com/v1/<account_id>/shamwari/workers-ai
 *   SHAMWARI_AI_GATEWAY_TOKEN      — provider bearer (Workers AI Run scope). Sent as
 *     `Authorization: Bearer` — this is the credential Workers AI itself checks.
 *   SHAMWARI_AI_GATEWAY_AUTH_TOKEN — optional. Only needed when the "shamwari"
 *     gateway has Authenticated Gateway enabled (it does). Sent as
 *     `cf-aig-authorization: Bearer` — an "AI Gateway Run" scoped token that
 *     authenticates the caller *to the gateway* (separate from the provider
 *     credential above). Omit for an unauthenticated gateway.
 */

import "server-only";

const GATEWAY_URL = process.env.SHAMWARI_AI_GATEWAY_URL;
const GATEWAY_TOKEN = process.env.SHAMWARI_AI_GATEWAY_TOKEN;
const GATEWAY_AUTH_TOKEN = process.env.SHAMWARI_AI_GATEWAY_AUTH_TOKEN;

/**
 * Generation model fronted by the gateway. Overridable via
 * `SHAMWARI_GENERATION_MODEL` (a Vercel env var) so the model can be swapped
 * without a code change/deploy; defaults to Qwen3-30B.
 */
export const QWEN_MODEL = process.env.SHAMWARI_GENERATION_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8";
/**
 * Embedding model fronted by the gateway (BGE base, 768-dim). Overridable via
 * `SHAMWARI_EMBEDDING_MODEL`, but ONLY swap for another 768-dim model — the
 * Atlas `event_vector_index` is pinned to EMBEDDING_DIMENSIONS below, so a model
 * with a different output size would break vector search until the index is
 * rebuilt.
 */
export const EMBEDDING_MODEL = process.env.SHAMWARI_EMBEDDING_MODEL || "@cf/baai/bge-base-en-v1.5";
/** Dimensionality of EMBEDDING_MODEL — used by the Atlas vector index. */
export const EMBEDDING_DIMENSIONS = 768;

/** Thrown when the gateway isn't configured on the deployment. Callers degrade
 * to a graceful fallback rather than surfacing a 500. */
export class AiGatewayNotConfiguredError extends Error {
  constructor() {
    super("[mukoko] Shamwari AI Gateway is not configured (SHAMWARI_AI_GATEWAY_URL / _TOKEN)");
    this.name = "AiGatewayNotConfiguredError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function isGatewayConfigured(): boolean {
  return Boolean(GATEWAY_URL && GATEWAY_TOKEN);
}

async function gatewayRun<T>(model: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!GATEWAY_URL || !GATEWAY_TOKEN) throw new AiGatewayNotConfiguredError();
  const url = `${GATEWAY_URL.replace(/\/$/, "")}/${model}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GATEWAY_TOKEN}`,
    "Content-Type": "application/json",
  };
  // Authenticated Gateway: the second credential that lets us through the
  // gateway front door, distinct from the Workers AI provider token above.
  if (GATEWAY_AUTH_TOKEN) headers["cf-aig-authorization"] = `Bearer ${GATEWAY_AUTH_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[mukoko] Shamwari gateway ${model} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

interface WorkersAiTextResult {
  result?: { response?: string };
  response?: string;
}

/** Chat completion via Qwen on the gateway. Returns the trimmed text. */
export async function chat(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const data = await gatewayRun<WorkersAiTextResult>(
    QWEN_MODEL,
    { messages, max_tokens: opts.maxTokens ?? 400, temperature: opts.temperature ?? 0.7 },
    opts.timeoutMs ?? 20_000,
  );
  const response = data.result?.response ?? data.response;
  return typeof response === "string" ? response.trim() : "";
}

interface WorkersAiEmbeddingResult {
  result?: { data?: number[][] };
  data?: number[][];
}

/** Embed a batch of texts via BGE on the gateway. Returns one vector per input. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const data = await gatewayRun<WorkersAiEmbeddingResult>(
    EMBEDDING_MODEL,
    { text: texts },
    20_000,
  );
  return data.result?.data ?? data.data ?? [];
}

/** Embed a single text. Returns null on empty result. */
export async function embedOne(text: string): Promise<number[] | null> {
  const [vector] = await embed([text]);
  return vector ?? null;
}
