"use client";

import { useEffect, useMemo, useState } from "react";
import { Vote, Clock, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * EventPolls — surfaces events.poll rows attached to this event.
 *
 * Schema (verified via Supabase MCP):
 *   events.poll(id, event_id, question, options jsonb, closes_at,
 *               is_closed, accepted_answer jsonb, suggested_answer jsonb,
 *               created_by, created_at)
 *   events.poll_vote(poll_id, person_id, option_id text, voted_at)
 *
 * The options jsonb is the schema.org suggestedAnswer pattern: an array
 * of `{ id: string, text: string }` objects. We narrow defensively because
 * the column is freeform (legacy rows may carry just strings).
 *
 * Votes are idempotent per (poll, person) — the composite-key conflict
 * means changing a vote is a delete-then-insert. We do it as two queries
 * rather than upsert because option_id is part of the row body, not the
 * key; PostgREST upsert on the PK would write any option without checking.
 */

interface EventPollsProps {
  eventId: string;
}

interface PollRow {
  id: string;
  question: string;
  options: PollOption[];
  closes_at: string | null;
  is_closed: boolean;
}

interface PollOption {
  id: string;
  text: string;
}

interface VoteRow {
  poll_id: string;
  option_id: string;
}

function normaliseOptions(raw: unknown): PollOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o, i): PollOption | null => {
      if (typeof o === "string") return { id: String(i), text: o };
      if (o && typeof o === "object") {
        const obj = o as Record<string, unknown>;
        const id = typeof obj.id === "string" ? obj.id : String(i);
        const text = typeof obj.text === "string" ? obj.text : typeof obj.name === "string" ? obj.name : null;
        if (!text) return null;
        return { id, text };
      }
      return null;
    })
    .filter((o): o is PollOption => o !== null);
}

export function EventPolls({ eventId }: EventPollsProps) {
  const { user } = useAuth();
  const viewerPersonId = (user as { person_id?: string } | null)?.person_id ?? null;

  const [polls, setPolls] = useState<PollRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tallies, setTallies] = useState<Map<string, Map<string, number>>>(new Map());
  const [myVotes, setMyVotes] = useState<Map<string, string>>(new Map());
  const [busyPollId, setBusyPollId] = useState<string | null>(null);

  // Fetch the polls for this event + per-poll vote tallies.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: rawPolls } = await supabase
        .schema("events")
        .from("poll")
        .select("id,question,options,closes_at,is_closed")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const normalised: PollRow[] = ((rawPolls as Array<{ id: string; question: string; options: unknown; closes_at: string | null; is_closed: boolean }> | null) ?? []).map((p) => ({
        id: p.id,
        question: p.question,
        options: normaliseOptions(p.options),
        closes_at: p.closes_at,
        is_closed: p.is_closed,
      }));
      setPolls(normalised);

      if (normalised.length > 0) {
        const ids = normalised.map((p) => p.id);
        const { data: voteRows } = await supabase
          .schema("events")
          .from("poll_vote")
          .select("poll_id,option_id")
          .in("poll_id", ids);
        const counts = new Map<string, Map<string, number>>();
        ((voteRows as VoteRow[] | null) ?? []).forEach((v) => {
          const inner = counts.get(v.poll_id) ?? new Map<string, number>();
          inner.set(v.option_id, (inner.get(v.option_id) ?? 0) + 1);
          counts.set(v.poll_id, inner);
        });
        if (!cancelled) setTallies(counts);

        if (viewerPersonId) {
          const { data: mine } = await supabase
            .schema("events")
            .from("poll_vote")
            .select("poll_id,option_id")
            .in("poll_id", ids)
            .eq("person_id", viewerPersonId);
          const map = new Map<string, string>();
          ((mine as VoteRow[] | null) ?? []).forEach((v) => map.set(v.poll_id, v.option_id));
          if (!cancelled) setMyVotes(map);
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, viewerPersonId]);

  const onVote = async (poll: PollRow, optionId: string) => {
    if (!viewerPersonId || poll.is_closed || busyPollId) return;
    if (myVotes.get(poll.id) === optionId) return; // no-op re-click
    setBusyPollId(poll.id);
    const supabase = getSupabaseBrowserClient();
    try {
      // Change-vote = delete prior row then insert new one.
      await supabase
        .schema("events")
        .from("poll_vote")
        .delete()
        .eq("poll_id", poll.id)
        .eq("person_id", viewerPersonId);
      await supabase.schema("events").from("poll_vote").insert({
        poll_id: poll.id,
        person_id: viewerPersonId,
        option_id: optionId,
        voted_at: new Date().toISOString(),
      });
      // Optimistic local update — increment new, decrement prior.
      const prior = myVotes.get(poll.id);
      setTallies((cur) => {
        const next = new Map(cur);
        const inner = new Map(next.get(poll.id) ?? new Map<string, number>());
        if (prior) inner.set(prior, Math.max(0, (inner.get(prior) ?? 0) - 1));
        inner.set(optionId, (inner.get(optionId) ?? 0) + 1);
        next.set(poll.id, inner);
        return next;
      });
      setMyVotes((cur) => {
        const next = new Map(cur);
        next.set(poll.id, optionId);
        return next;
      });
    } finally {
      setBusyPollId(null);
    }
  };

  if (!loaded || polls.length === 0) return null;

  return (
    <section data-slot="event-polls" className="mt-8 space-y-4">
      <header className="flex items-center gap-2">
        <Vote className="w-4 h-4 text-foreground" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
          Polls
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {polls.length} {polls.length === 1 ? "poll" : "polls"}
        </span>
      </header>
      {polls.map((poll) => (
        <PollCard
          key={poll.id}
          poll={poll}
          tally={tallies.get(poll.id) ?? new Map()}
          myOption={myVotes.get(poll.id) ?? null}
          canVote={!!viewerPersonId && !poll.is_closed}
          busy={busyPollId === poll.id}
          onVote={(optionId) => onVote(poll, optionId)}
        />
      ))}
    </section>
  );
}

function PollCard({
  poll,
  tally,
  myOption,
  canVote,
  busy,
  onVote,
}: {
  poll: PollRow;
  tally: Map<string, number>;
  myOption: string | null;
  canVote: boolean;
  busy: boolean;
  onVote: (optionId: string) => void;
}) {
  const total = useMemo(() => {
    let n = 0;
    for (const c of tally.values()) n += c;
    return n;
  }, [tally]);
  const closesIn = closesInLabel(poll.closes_at);

  return (
    <article
      className="rounded-[var(--radius-lg)] bg-card border border-border p-5"
      data-slot="event-poll-card"
    >
      <div className="flex items-start gap-3 mb-3">
        <h4 className="font-serif text-base font-semibold text-foreground leading-snug flex-1">
          {poll.question}
        </h4>
        {poll.is_closed ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground shrink-0">
            <CheckCircle2 className="w-3 h-3" aria-hidden /> Closed
          </span>
        ) : closesIn ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground shrink-0">
            <Clock className="w-3 h-3" aria-hidden /> {closesIn}
          </span>
        ) : null}
      </div>
      <ul className="space-y-2">
        {poll.options.map((opt) => {
          const count = tally.get(opt.id) ?? 0;
          const pct = total === 0 ? 0 : Math.round((count / total) * 100);
          const mine = myOption === opt.id;
          return (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => onVote(opt.id)}
                disabled={!canVote || busy}
                aria-pressed={mine}
                className="relative w-full text-left px-3 py-2.5 rounded-[var(--radius-md)] border transition-colors disabled:cursor-default disabled:opacity-70"
                style={{
                  borderColor: mine ? "transparent" : "var(--border)",
                  background: mine ? "var(--nh-lead-soft)" : "transparent",
                }}
              >
                {/* Tally fill bar — behind the text, malachite-tinted */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-[var(--radius-md)]"
                  style={{
                    width: `${pct}%`,
                    background:
                      "color-mix(in srgb, var(--nh-lead) 14%, transparent)",
                    pointerEvents: "none",
                  }}
                />
                <span className="relative flex items-center gap-3">
                  <span className={`flex-1 text-sm ${mine ? "font-semibold" : ""}`} style={mine ? { color: "var(--nh-lead)" } : undefined}>
                    {opt.text}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {pct}% · {count}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="mt-3 text-[11px] text-muted-foreground">
        {total} {total === 1 ? "vote" : "votes"}
        {!canVote && !poll.is_closed && " · sign in to vote"}
        {mine(myOption) && " · your vote saved"}
      </footer>
    </article>
  );
}
function mine(opt: string | null): boolean {
  return !!opt;
}

function closesInLabel(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return "Closed";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Closes in ${days}d`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `Closes in ${hours}h`;
  const mins = Math.max(1, Math.floor(ms / (60 * 1000)));
  return `Closes in ${mins}m`;
}
