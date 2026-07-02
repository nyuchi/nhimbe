"use client";

import { useEffect, useMemo, useState } from "react";
import { Vote, Clock, CheckCircle2 } from "lucide-react";
import { getEventPolls, castVote, type PollView } from "@/app/actions/polls";

/**
 * EventPolls — surfaces events.polls documents attached to this event.
 *
 * The browser never touches the database: this component reads polls and casts
 * votes through the `polls` server actions (Vercel server runtime → MongoDB).
 * The acting person is resolved server-side via AuthKit, so the client no
 * longer needs the viewer's person id — `canVote` from the action gates the UI.
 *
 * Storage (`events.polls`): each poll embeds `options` ({ id, text }) and
 * `votes` ({ personId, optionId, votedAt }). The action returns per-poll
 * tallies plus the viewer's own option. Re-voting is idempotent.
 */

interface EventPollsProps {
  eventId: string;
}

export function EventPolls({ eventId }: EventPollsProps) {
  const [polls, setPolls] = useState<PollView[]>([]);
  const [canVote, setCanVote] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busyPollId, setBusyPollId] = useState<string | null>(null);

  // Fetch the polls for this event + per-poll vote tallies + the viewer's vote.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getEventPolls(eventId);
        if (cancelled) return;
        setPolls(result.polls);
        setCanVote(result.canVote);
      } catch {
        if (!cancelled) setPolls([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const onVote = async (poll: PollView, optionId: string) => {
    if (!canVote || poll.isClosed || busyPollId) return;
    if (poll.myOptionId === optionId) return; // no-op re-click
    setBusyPollId(poll.id);
    try {
      const result = await castVote(poll.id, optionId);
      // Apply the server's authoritative tally + viewer option for this poll.
      setPolls((cur) =>
        cur.map((p) =>
          p.id === result.pollId
            ? { ...p, tally: result.tally, myOptionId: result.myOptionId }
            : p,
        ),
      );
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
          canVote={canVote && !poll.isClosed}
          busy={busyPollId === poll.id}
          onVote={(optionId) => onVote(poll, optionId)}
        />
      ))}
    </section>
  );
}

function PollCard({
  poll,
  canVote,
  busy,
  onVote,
}: {
  poll: PollView;
  canVote: boolean;
  busy: boolean;
  onVote: (optionId: string) => void;
}) {
  const total = useMemo(() => {
    let n = 0;
    for (const c of Object.values(poll.tally)) n += c;
    return n;
  }, [poll.tally]);
  const closesIn = closesInLabel(poll.closesAt);

  return (
    <article
      className="rounded-[var(--radius-lg)] bg-card border border-border p-5"
      data-slot="event-poll-card"
    >
      <div className="flex items-start gap-3 mb-3">
        <h4 className="font-serif text-base font-semibold text-foreground leading-snug flex-1">
          {poll.question}
        </h4>
        {poll.isClosed ? (
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
          const count = poll.tally[opt.id] ?? 0;
          const pct = total === 0 ? 0 : Math.round((count / total) * 100);
          const mine = poll.myOptionId === opt.id;
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
        {!canVote && !poll.isClosed && " · sign in to vote"}
        {poll.myOptionId && " · your vote saved"}
      </footer>
    </article>
  );
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
