"use client";

/**
 * `/calendars` — "My calendars": the calendars a person owns plus the ones
 * they follow (NYU-25). Distinct from the singular `/calendar` personal
 * month-view page — this is the index for the followable-stream feature.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, Plus, Users } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { NyuchiEmptyState } from "@/components/ui/nyuchi-empty-state";
import { CreateCalendarModal } from "@/components/modals/calendar-modal";
import { getTheme } from "@/lib/themes";
import {
  getMyOwnedCalendarsAction,
  getFollowedCalendarsAction,
  type CalendarListItem,
} from "@/app/actions/calendars";

function CalendarRow({ calendar }: { calendar: CalendarListItem }) {
  return (
    <li>
      <Link
        href={`/calendars/${calendar.slug}`}
        className="group flex items-center gap-4 rounded-[var(--radius-card,14px)] border border-border bg-card px-4 py-3.5 transition-shadow hover:shadow-md"
      >
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
          style={{ background: getTheme(calendar.theme ?? undefined).gradient }}
          aria-hidden
        >
          <CalendarRange className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {calendar.name}
          </span>
          {calendar.description && (
            <span className="block text-[13px] text-muted-foreground line-clamp-2">
              {calendar.description}
            </span>
          )}
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-text-tertiary">
            <Users className="w-3 h-3" aria-hidden />
            {calendar.followerCount} {calendar.followerCount === 1 ? "follower" : "followers"} ·{" "}
            {calendar.eventCount} {calendar.eventCount === 1 ? "event" : "events"}
          </span>
        </span>
        {calendar.visibility !== "public" && (
          <span className="shrink-0 inline-flex items-center h-7 px-2.5 rounded-full bg-elevated text-text-tertiary text-xs font-medium capitalize">
            {calendar.visibility}
          </span>
        )}
      </Link>
    </li>
  );
}

function MyCalendarsContent() {
  const [owned, setOwned] = useState<CalendarListItem[]>([]);
  const [followed, setFollowed] = useState<CalendarListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyOwnedCalendarsAction(), getFollowedCalendarsAction()])
      .then(([ownedRes, followedRes]) => {
        if (cancelled) return;
        setOwned(ownedRes);
        setFollowed(followedRes);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-[28px] font-bold text-foreground leading-tight">
            My calendars
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Curated event streams you host or follow.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => setIsCreateOpen(true)}
          className="shrink-0 gap-1.5 rounded-full text-sm"
        >
          <Plus className="w-4 h-4" aria-hidden />
          Create a calendar
        </Button>
      </div>

      {!loading && (
        <>
          <section className="mb-10">
            <h2 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">
              Hosting
            </h2>
            {owned.length > 0 ? (
              <ul className="space-y-2">
                {owned.map((c) => (
                  <CalendarRow key={c.id} calendar={c} />
                ))}
              </ul>
            ) : (
              <NyuchiEmptyState
                icon={<CalendarRange className="w-6 h-6" />}
                title="No calendars yet"
                description="Create one to stream your recurring gatherings to followers."
              />
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">
              Following
            </h2>
            {followed.length > 0 ? (
              <ul className="space-y-2">
                {followed.map((c) => (
                  <CalendarRow key={c.id} calendar={c} />
                ))}
              </ul>
            ) : (
              <NyuchiEmptyState
                icon={<Users className="w-6 h-6" />}
                title="Not following any calendars"
                description="Discover a calendar to follow and its events land in your radar."
              />
            )}
          </section>
        </>
      )}

      <CreateCalendarModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          getMyOwnedCalendarsAction().then(setOwned);
        }}
      />
    </div>
  );
}

export default function MyCalendarsPage() {
  return (
    <AuthGuard>
      <MyCalendarsContent />
    </AuthGuard>
  );
}
