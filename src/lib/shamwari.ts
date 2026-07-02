"use server";

/**
 * Shamwari (AI Description Wizard) telemetry — best-effort, MongoDB-backed.
 *
 * Server actions the client wizard calls to log tool usage. Writes go to the
 * `shamwari.toolUsage` collection on MongoDB (no Supabase). All writes are
 * best-effort: any failure is swallowed so it can never break the user flow.
 *
 * Conversation/message persistence and feedback capture will be modelled
 * properly when the AI stack is re-platformed onto the Claude API (the
 * `shamwari.conversations`/`messages` collections are built for Anthropic
 * content blocks). For now `startShamwariConversation` mints a grouping id
 * without a conversation row, and feedback is a no-op.
 */

import { getMongoClient } from "@/lib/mongo/client";
import { newId, WRITE_SCHEMA_VERSION } from "@/lib/mongo/ids";

const TOOL_NAME = "generate_event_description";
const SERVER_NAME = "nhimbe/description_wizard";

/** Mint a client-side grouping id for a wizard session. No DB write yet —
 *  toolUsage rows carry this as `conversationId` so they can be grouped later. */
export async function startShamwariConversation(personId: string): Promise<string | null> {
  if (!personId) return null;
  return newId();
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

/** Best-effort log of a wizard tool invocation to shamwari.toolUsage. */
export async function logShamwariToolUsage(input: LogToolUsageInput): Promise<void> {
  if (!input.personId) return;
  try {
    const client = await getMongoClient();
    await client
      .db("shamwari")
      .collection<{ _id: string } & Record<string, unknown>>("toolUsage")
      .insertOne({
        _id: newId(),
        _schemaVersion: WRITE_SCHEMA_VERSION,
        ownerPersonId: input.personId,
        toolName: TOOL_NAME,
        serverName: SERVER_NAME,
        conversationId: input.conversationId,
        toolInput: input.toolParameters,
        toolResult: input.toolResult ?? null,
        success: input.status === "success",
        errorMessage: input.errorMessage ?? null,
        durationMs: input.executionTimeMs ?? null,
        createdAt: new Date(),
      });
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

/** Feedback capture is deferred to the AI re-platform (no feedback collection
 *  in the v3.1 shamwari schema yet). No-op for now, best-effort by contract. */
export async function logShamwariFeedback(_input: LogFeedbackInput): Promise<void> {
  void _input;
}
