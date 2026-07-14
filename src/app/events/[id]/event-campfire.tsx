"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, Send } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import {
  getCampfireThread,
  postCampfireMessage,
  type CampfireAuthor,
  type CampfireMessage,
} from "@/app/actions/campfire";

/**
 * EventCampfire — surfaces the campfire conversation thread attached to an
 * event when events.event.campfireConversationId is set. The campfire is
 * "live chat around the gathering" — distinct from the circle stream (which is
 * the event's persistent community).
 *
 * Data path: the browser never touches Mongo. Reads and writes go through the
 * `src/app/actions/campfire.ts` server actions (Node runtime), which resolve
 * the acting person via AuthKit / the dev bypass and read/write the
 * campfire.* collections on the Mukoko cluster.
 *
 * Strategy:
 *   - Loads the most recent 20 messages on mount via getCampfireThread().
 *   - Composer posts via postCampfireMessage(); the server records the
 *     sender's read receipt so a notification badge elsewhere stays accurate.
 *   - Renders nothing when there's no conversation id — graceful no-op.
 *
 * Realtime: Supabase realtime channels were the natural upgrade in the old
 * model; on Mongo, polling or a change-stream relay would replace it. Left out
 * of this slice to keep scope tight — messages refresh on send.
 */

interface EventCampfireProps {
  conversationId: string | null | undefined;
}

const MAX_MESSAGES = 20;

export function EventCampfire({ conversationId }: EventCampfireProps) {
  const { user } = useAuth();
  const viewerPersonId = (user as { person_id?: string } | null)?.person_id ?? null;
  const [messages, setMessages] = useState<CampfireMessage[]>([]);
  const [authors, setAuthors] = useState<Map<string, CampfireAuthor>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Initial load via the server action (which also records the read receipt).
  useEffect(() => {
    if (!conversationId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const thread = await getCampfireThread(conversationId);
        if (cancelled) return;
        setMessages(thread.messages.slice(-MAX_MESSAGES));
        const map = new Map<string, CampfireAuthor>();
        thread.authors.forEach((a) => map.set(a.id, a));
        setAuthors(map);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Scroll the message list to the bottom whenever new messages appear.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const onSend = async () => {
    if (!viewerPersonId || !conversationId || !draft.trim() || sending) return;
    const text = draft.trim();
    setSending(true);
    try {
      const { message, author } = await postCampfireMessage(conversationId, text);
      setMessages((cur) => [...cur, message]);
      setAuthors((cur) => new Map(cur).set(author.id, author));
      setDraft("");
    } catch {
      // Leave the draft in place so the user can retry.
    } finally {
      setSending(false);
    }
  };

  if (!conversationId || !loaded) return null;

  return (
    <section data-slot="event-campfire" className="mt-8 rounded-[var(--radius-lg)] bg-card border border-border overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <Flame className="w-4 h-4" style={{ color: "var(--nh-sunset)" }} aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
          Campfire
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          live chat
        </span>
        <span className="flex-1" />
        <span className="text-[11px] text-muted-foreground">{messages.length} {messages.length === 1 ? "message" : "messages"}</span>
      </header>

      <div
        ref={scrollRef}
        className="px-5 py-4 max-h-[360px] overflow-y-auto space-y-3"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages yet. Light the first flame.
          </p>
        )}
        {messages.map((m) => {
          const author = authors.get(m.senderPersonId);
          const label = author?.name || "Guest";
          const isMe = viewerPersonId === m.senderPersonId;
          return (
            <article key={m.id} className={`flex items-start gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
              <Avatar label={label} image={author?.image ?? null} isMe={isMe} />
              <div className={`flex-1 min-w-0 ${isMe ? "text-right" : ""}`}>
                <header className={`flex items-baseline gap-2 mb-1 text-[11px] ${isMe ? "justify-end" : ""}`}>
                  <span className="font-semibold text-foreground">{isMe ? "You" : label}</span>
                  <time className="text-muted-foreground" dateTime={m.sentAt}>
                    {formatRelative(m.sentAt)}
                  </time>
                </header>
                <div
                  className={`inline-block px-3 py-2 rounded-[var(--radius-md)] text-sm max-w-[85%] ${isMe ? "text-left" : ""}`}
                  style={isMe ? { background: "var(--nh-lead-soft)", color: "var(--nh-lead)" } : { background: "var(--muted)" }}
                >
                  {m.text}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {viewerPersonId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="flex items-center gap-2 px-4 py-3 border-t border-border"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Drop a log on the fire…"
            className="flex-1 h-10 px-4 rounded-full bg-muted text-sm placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--nh-lead)]"
            disabled={sending}
            aria-label="Type a message"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full text-[color:var(--nh-on-lead)] transition-opacity disabled:opacity-50"
            style={{ background: "var(--nh-lead)" }}
          >
            <Send className="w-4 h-4" aria-hidden />
          </button>
        </form>
      ) : (
        <footer className="px-5 py-3 text-[11px] text-muted-foreground text-center border-t border-border">
          Sign in to join the campfire.
        </footer>
      )}
    </section>
  );
}

function Avatar({ label, image, isMe }: { label: string; image: string | null; isMe: boolean }) {
  const initials = label.trim().slice(0, 1).toUpperCase() || "•";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={label} className="w-8 h-8 rounded-full object-cover shrink-0" />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-semibold shrink-0"
      style={isMe ? { background: "var(--nh-lead)", color: "var(--nh-on-lead)" } : { background: "var(--muted)", color: "var(--foreground)" }}
    >
      {initials}
    </span>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))}h`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
