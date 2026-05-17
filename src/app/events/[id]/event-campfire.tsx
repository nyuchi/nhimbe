"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, Send } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * EventCampfire — surfaces the campfire.conversation thread attached to an
 * event when events.event.campfire_conversation_id is set. The campfire
 * is "live chat around the gathering" — distinct from the Kraal stream
 * (which is the event's persistent community).
 *
 * Schema (verified via Supabase MCP):
 *   campfire.conversation(id, name, conversation_type, owner_type, owner_id,
 *     circle_id, event_id, last_message_at, message_count, is_archived)
 *   campfire.message(id, conversation_id, sender, text, datesent,
 *     reply_to, edited_at, is_deleted, message_type)
 *   campfire.participant(conversation_id, person_id, role, joined_at,
 *     last_read_at, is_muted)
 *
 * Strategy:
 *   - Loads the most recent 20 messages on mount.
 *   - Composer writes a new campfire.message row with sender=viewer person id.
 *   - participant.last_read_at is updated on render so a notification
 *     badge elsewhere stays accurate.
 *   - Renders nothing when there's no conversation id — graceful no-op.
 *
 * Realtime: Supabase realtime channels would be the natural upgrade —
 * left out of this slice to keep scope tight; messages refresh on send.
 */

interface EventCampfireProps {
  conversationId: string | null | undefined;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender: string;
  text: string;
  datesent: string;
  is_deleted: boolean | null;
}

interface AuthorRow {
  id: string;
  name: string | null;
  givenname: string | null;
  familyname: string | null;
  image: string | null;
}

const MAX_MESSAGES = 20;

export function EventCampfire({ conversationId }: EventCampfireProps) {
  const { user } = useAuth();
  const viewerPersonId = (user as { person_id?: string } | null)?.person_id ?? null;
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, AuthorRow>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Initial load + viewer-read receipt.
  useEffect(() => {
    if (!conversationId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: rawMessages } = await supabase
        .schema("campfire")
        .from("message")
        .select("id,conversation_id,sender,text,datesent,is_deleted")
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .order("datesent", { ascending: true })
        .limit(MAX_MESSAGES);
      if (cancelled) return;
      const msgs = ((rawMessages as MessageRow[] | null) ?? []).filter((m) => !!m.text);
      setMessages(msgs);

      if (msgs.length > 0) {
        const senderIds = Array.from(new Set(msgs.map((m) => m.sender)));
        const { data: people } = await supabase
          .schema("identity")
          .from("person")
          .select("id,name,givenname,familyname,image")
          .in("id", senderIds);
        const map = new Map<string, AuthorRow>();
        ((people as AuthorRow[] | null) ?? []).forEach((p) => map.set(p.id, p));
        if (!cancelled) setAuthors(map);
      }
      setLoaded(true);

      // Best-effort read receipt — only if the viewer is a participant.
      if (viewerPersonId) {
        await supabase
          .schema("campfire")
          .from("participant")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("person_id", viewerPersonId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, viewerPersonId]);

  // Scroll the message list to the bottom whenever new messages appear.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const onSend = async () => {
    if (!viewerPersonId || !conversationId || !draft.trim() || sending) return;
    const text = draft.trim();
    setSending(true);
    const supabase = getSupabaseBrowserClient();
    try {
      const { data: inserted } = await supabase
        .schema("campfire")
        .from("message")
        .insert({
          conversation_id: conversationId,
          sender: viewerPersonId,
          text,
          datesent: new Date().toISOString(),
          messagetype: "Message",
        })
        .select("id,conversation_id,sender,text,datesent,is_deleted")
        .single();
      if (inserted) {
        setMessages((cur) => [...cur, inserted as MessageRow]);
        setDraft("");
        // Ensure the sender's row appears in the authors map.
        if (!authors.has(viewerPersonId)) {
          const { data: me } = await supabase
            .schema("identity")
            .from("person")
            .select("id,name,givenname,familyname,image")
            .eq("id", viewerPersonId)
            .maybeSingle();
          if (me) setAuthors((cur) => new Map(cur).set(viewerPersonId, me as AuthorRow));
        }
      }
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
          const author = authors.get(m.sender);
          const label = author ? (author.name || [author.givenname, author.familyname].filter(Boolean).join(" ") || "Guest") : "Guest";
          const isMe = viewerPersonId === m.sender;
          return (
            <article key={m.id} className={`flex items-start gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
              <Avatar label={label} image={author?.image ?? null} isMe={isMe} />
              <div className={`flex-1 min-w-0 ${isMe ? "text-right" : ""}`}>
                <header className={`flex items-baseline gap-2 mb-1 text-[11px] ${isMe ? "justify-end" : ""}`}>
                  <span className="font-semibold text-foreground">{isMe ? "You" : label}</span>
                  <time className="text-muted-foreground" dateTime={m.datesent}>
                    {formatRelative(m.datesent)}
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
