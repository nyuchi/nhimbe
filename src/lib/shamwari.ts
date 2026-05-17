"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Shamwari conversation persistence.
 *
 * Schema (verified via Supabase MCP):
 *   shamwari.conversation(id, person_id, conversation_type CHECK ∈
 *     {general,planning,recommendation,support}, couchdb_conversation_id,
 *     scylladb_conversation_id, started_at, last_message_at, mini_app_context,
 *     model_version, message_count)
 *   shamwari.tool_usage(id, conversation_id, identity_id, tool_name,
 *     tool_parameters jsonb, tool_result jsonb, status CHECK ∈
 *     {success,failed,timeout}, error_message, execution_time_ms, created_at)
 *   shamwari.feedback(id, conversation_id, identity_id, feedback_type CHECK
 *     ∈ {thumbs_up,thumbs_down,report_issue,suggestion}, rating 1-5,
 *     feedback_text, issue_category, created_at)
 *
 * Message bodies themselves live in external document stores (CouchDB /
 * ScyllaDB) via the *_conversation_id pointers on the conversation row.
 * The platform-DB row is the metadata + counter + tool-call log.
 *
 * For the AI Description Wizard we treat each Generate/Regenerate call as
 * a tool_usage entry (tool_name='generate_event_description', params =
 * wizard answers, result = generated description). User accept/reject
 * becomes a feedback row. No external doc store writes — they're left
 * null until the platform team wires Couch/Scylla through.
 *
 * All writes are best-effort: any failure here must not break the user
 * flow. We log to console and swallow.
 */

const MINI_APP_CONTEXT = "nhimbe/description_wizard";
const MODEL_VERSION = "qwen-3-30b";
const TOOL_NAME = "generate_event_description";

/** Create a new conversation row. Returns the new conversation id, or null
 *  on failure (caller continues with a null id; subsequent log calls no-op). */
export async function startShamwariConversation(personId: string): Promise<string | null> {
  if (!personId) return null;
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .schema("shamwari")
      .from("conversation")
      .insert({
        person_id: personId,
        conversation_type: "planning", // matches the wizard's intent
        started_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        mini_app_context: MINI_APP_CONTEXT,
        model_version: MODEL_VERSION,
        message_count: 0,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch (e) {
    console.warn("[shamwari] startConversation failed:", e);
    return null;
  }
}

interface LogToolUsageInput {
  personId: string;
  conversationId: string | null;
  toolParameters: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  status: "success" | "failed" | "timeout";
  errorMessage?: string;
  executionTimeMs: number;
}

/** Log a tool invocation. When conversationId is null this writes a tool_usage
 *  row without the conversation link (useful for anonymous one-shot calls). */
export async function logShamwariToolUsage(input: LogToolUsageInput): Promise<void> {
  if (!input.personId) return;
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase.schema("shamwari").from("tool_usage").insert({
      conversation_id: input.conversationId,
      identity_id: input.personId,
      tool_name: TOOL_NAME,
      tool_parameters: input.toolParameters,
      tool_result: input.toolResult ?? null,
      status: input.status,
      error_message: input.errorMessage ?? null,
      execution_time_ms: input.executionTimeMs,
    });
    // Bump the conversation's last_message_at + message_count so a later
    // surface "Recent Shamwari activity" view has the right ordering.
    if (input.conversationId) {
      await supabase
        .schema("shamwari")
        .from("conversation")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", input.conversationId);
    }
  } catch (e) {
    console.warn("[shamwari] logToolUsage failed:", e);
  }
}

interface LogFeedbackInput {
  personId: string;
  conversationId: string | null;
  feedbackType: "thumbs_up" | "thumbs_down" | "report_issue" | "suggestion";
  rating?: number;
  feedbackText?: string;
}

/** Record feedback on a conversation — e.g. thumbs_up when the user accepts
 *  the generated description. */
export async function logShamwariFeedback(input: LogFeedbackInput): Promise<void> {
  if (!input.personId) return;
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase.schema("shamwari").from("feedback").insert({
      conversation_id: input.conversationId,
      identity_id: input.personId,
      feedback_type: input.feedbackType,
      rating: input.rating ?? null,
      feedback_text: input.feedbackText ?? null,
    });
  } catch (e) {
    console.warn("[shamwari] logFeedback failed:", e);
  }
}
