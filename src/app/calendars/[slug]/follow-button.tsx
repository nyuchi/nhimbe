"use client";

/**
 * Follow/Following pill for a calendar page (NYU-25).
 *
 * The page resolves the viewer's session server-side and hands this pill its
 * initial state; toggling calls the idempotent follow/unfollow server actions
 * with an optimistic flip (reverted on failure). Logged-out visitors get a
 * link into the hosted AuthKit sign-in with a `return_to` deep link back to
 * this calendar.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, LogIn, Plus } from "lucide-react";
import { followCalendarAction, unfollowCalendarAction } from "@/app/actions/calendars";
import { useT } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  calendarId: string;
  slug: string;
  isAuthenticated: boolean;
  initialFollowing: boolean;
  initialFollowerCount: number;
}

export function FollowButton({
  calendarId,
  slug,
  isAuthenticated,
  initialFollowing,
  initialFollowerCount,
}: FollowButtonProps) {
  const { t } = useT();
  const [following, setFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isAuthenticated) {
    return (
      <Link
        href={`/auth/hosted?return_to=${encodeURIComponent(`/calendars/${slug}`)}`}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <LogIn className="size-4" aria-hidden />
        {t("calendars.signInToFollow")}
      </Link>
    );
  }

  const toggle = () => {
    const wasFollowing = following;
    const previousCount = followerCount;
    // Optimistic flip — reverted if the action fails.
    setFollowing(!wasFollowing);
    setFollowerCount(Math.max(0, previousCount + (wasFollowing ? -1 : 1)));
    setError(null);

    startTransition(async () => {
      try {
        const result = wasFollowing
          ? await unfollowCalendarAction(calendarId)
          : await followCalendarAction(calendarId);
        setFollowing(result.following);
        setFollowerCount(result.followerCount);
      } catch (err) {
        setFollowing(wasFollowing);
        setFollowerCount(previousCount);
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors disabled:opacity-60",
          following
            ? "border border-border bg-card text-foreground hover:border-primary/40"
            : "bg-primary text-primary-foreground hover:opacity-90",
        )}
      >
        {following ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {following ? t("calendars.following") : t("calendars.follow")}
      </button>
      <span className="text-[13px] text-muted-foreground" data-slot="calendar-follower-count">
        {followerCount === 1
          ? t("calendars.follower")
          : t("calendars.followers", { count: followerCount })}
      </span>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
