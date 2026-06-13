"use server";

/**
 * Event poll server actions (Vercel server runtime → MongoDB).
 *
 * Replaces the browser-side Supabase reads/writes that used to live in
 * `event-polls.tsx` (`events.poll` + `events.poll_vote`). The browser can't
 * talk to Mongo, so listing polls and casting votes both run here.
 *
 * Storage model (`events.polls`, validated on the cluster):
 *   { _id, eventId, createdByPersonId, question, options[], votes[],
 *     allowMultipleSelection, isActive, totalResponseCount, closesAt?, ... }
 *
 * `options` is the schema.org suggestedAnswer pattern — an array of
 * `{ id, text }` (legacy rows may carry bare strings, normalised below).
 * `votes` is embedded on the poll document as `{ personId, optionId, votedAt }`.
 *
 * Votes are one-per-(poll, person). Changing a vote pulls the prior embedded
 * vote and pushes the new one in a single update, so re-voting can never leave
 * a person with two live votes on the same poll.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { pollsCollection, personsCollection } from "@/lib/mongo/databases";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import type { PollDoc } from "@/lib/mongo/types";

export interface PollOptionView {
  id: string;
  text: string;
}

export interface PollView {
  id: string;
  question: string;
  options: PollOptionView[];
  /** ISO 8601 close instant, or null. */
  closesAt: string | null;
  isClosed: boolean;
  /** optionId → vote count. */
  tally: Record<string, number>;
  /** The viewer's chosen optionId on this poll, or null. */
  myOptionId: string | null;
}

export interface EventPollsView {
  /** True once the viewer is resolved as a votable person. */
  canVote: boolean;
  polls: PollView[];
}

export interface CastVoteResult {
  pollId: string;
  tally: Record<string, number>;
  myOptionId: string | null;
}

/** Embedded vote shape on `events.polls.votes`. */
interface PollVote {
  personId: string;
  optionId: string;
  votedAt: Date;
}

/**
 * Resolve the acting person's `identity.persons._id`. Returns null when there
 * is no session (anonymous viewers can read polls but not vote). Never throws
 * on the read path — a missing person just means "can't vote".
 */
async function resolveViewerPersonId(): Promise<string | null> {
  const workosUserId = isDevBypass() ? DEV_WORKOS_ID : (await withAuth()).user?.id ?? null;
  if (!workosUserId) return null;
  const persons = await personsCollection();
  const person = await persons.findOne({ workosUserId }, { projection: { _id: 1 } });
  return person?._id ?? null;
}

function normaliseOptions(raw: unknown): PollOptionView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o, i): PollOptionView | null => {
      if (typeof o === "string") return { id: String(i), text: o };
      if (o && typeof o === "object") {
        const obj = o as Record<string, unknown>;
        const id = typeof obj.id === "string" ? obj.id : String(i);
        const text =
          typeof obj.text === "string"
            ? obj.text
            : typeof obj.name === "string"
              ? obj.name
              : null;
        if (!text) return null;
        return { id, text };
      }
      return null;
    })
    .filter((o): o is PollOptionView => o !== null);
}

/** Coerce the freeform `votes` array into the embedded vote shape. */
function readVotes(raw: unknown): PollVote[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v): PollVote[] => {
    if (!v || typeof v !== "object") return [];
    const obj = v as Record<string, unknown>;
    if (typeof obj.personId !== "string" || typeof obj.optionId !== "string") return [];
    return [
      {
        personId: obj.personId,
        optionId: obj.optionId,
        votedAt: obj.votedAt instanceof Date ? obj.votedAt : new Date(),
      },
    ];
  });
}

function isClosed(doc: Pick<PollDoc, "isActive" | "closesAt">): boolean {
  if (doc.isActive === false) return true;
  if (doc.closesAt) return new Date(doc.closesAt).getTime() <= Date.now();
  return false;
}

function tallyOf(votes: PollVote[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of votes) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
  return counts;
}

function toView(doc: PollDoc, viewerPersonId: string | null): PollView {
  const votes = readVotes(doc.votes);
  return {
    id: doc._id,
    question: doc.question,
    options: normaliseOptions(doc.options),
    closesAt: doc.closesAt ? new Date(doc.closesAt).toISOString() : null,
    isClosed: isClosed(doc),
    tally: tallyOf(votes),
    myOptionId: viewerPersonId
      ? votes.find((v) => v.personId === viewerPersonId)?.optionId ?? null
      : null,
  };
}

/** List a single event's polls with per-poll tallies and the viewer's vote. */
export async function getEventPolls(eventId: string): Promise<EventPollsView> {
  if (!eventId) return { canVote: false, polls: [] };
  const viewerPersonId = await resolveViewerPersonId();
  const col = await pollsCollection();
  const docs = await col.find({ eventId }).sort({ createdAt: -1 }).toArray();
  return {
    canVote: Boolean(viewerPersonId),
    polls: docs.map((doc) => toView(doc, viewerPersonId)),
  };
}

/**
 * Cast (or change) the viewer's vote on a poll. Idempotent re-clicks are a
 * no-op. Returns the recomputed tally and the viewer's current option.
 */
export async function castVote(pollId: string, optionId: string): Promise<CastVoteResult> {
  if (!pollId || !optionId) throw new Error("A poll and an option are required.");

  const viewerPersonId = await resolveViewerPersonId();
  if (!viewerPersonId) throw new Error("You must be signed in to vote.");

  const col = await pollsCollection();
  const poll = await col.findOne({ _id: pollId });
  if (!poll) throw new Error("That poll no longer exists.");
  if (isClosed(poll)) throw new Error("This poll is closed.");

  const options = normaliseOptions(poll.options);
  if (!options.some((o) => o.id === optionId)) {
    throw new Error("That is not a valid option for this poll.");
  }

  const existing = readVotes(poll.votes);
  const prior = existing.find((v) => v.personId === viewerPersonId);

  // Idempotent re-click: nothing to write, return the current state.
  if (prior?.optionId === optionId) {
    return { pollId, tally: tallyOf(existing), myOptionId: optionId };
  }

  const now = new Date();
  const nextVote: PollVote = { personId: viewerPersonId, optionId, votedAt: now };

  // Pull any prior vote(s) by this person, then push the new one. Two stages so
  // a change-vote can't transiently leave the person with two live votes.
  if (prior) {
    await col.updateOne(
      { _id: pollId },
      { $pull: { votes: { personId: viewerPersonId } } as Record<string, unknown> },
    );
  }
  const updated = await col.findOneAndUpdate(
    { _id: pollId },
    {
      $push: { votes: nextVote } as Record<string, unknown>,
      $set: { updatedAt: now },
    },
    { returnDocument: "after" },
  );

  const finalVotes = updated ? readVotes(updated.votes) : [...existing.filter((v) => v.personId !== viewerPersonId), nextVote];

  // Keep the denormalised counter consistent with the embedded votes.
  await col.updateOne({ _id: pollId }, { $set: { totalResponseCount: finalVotes.length } });

  return { pollId, tally: tallyOf(finalVotes), myOptionId: optionId };
}
