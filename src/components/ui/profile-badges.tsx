"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { getProfileBadges, type ProfileBadge } from "@/app/actions/badges";

/**
 * ProfileBadges — Ubuntu reputation badges earned by a person.
 *
 * Data now comes from MongoDB (Mukoko v3.1) via the `getProfileBadges` server
 * action, which reads `ubuntu.badgeAwards` (earned junction) joined to
 * `ubuntu.badges` (definitions). The browser never touches Mongo — this client
 * component just calls the action. When the collections are absent (or empty,
 * as today) the action returns an empty list and this renders nothing.
 *
 * Renders earned badges as a horizontally-scrolling row with the badge
 * icon and name. Locked badges (active in `ubuntu.badges` but not yet earned by
 * this person) appear dimmed at the tail so the surface always feels "there's
 * more to earn". Renders nothing when there are no badges of either kind.
 */

interface ProfileBadgesProps {
  /** `identity.persons._id` (OIDC sub) — the badge award holder id. */
  personId: string;
}

export function ProfileBadges({ personId }: ProfileBadgesProps) {
  const [badges, setBadges] = useState<ProfileBadge[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!personId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { badges: rows } = await getProfileBadges(personId);
        if (!cancelled) setBadges(rows);
      } catch {
        // Degrade silently to "no badges" — the section just won't render.
        if (!cancelled) setBadges([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  if (!loaded) return null;
  const earnedCount = badges.filter((b) => !!b.earned).length;
  if (badges.length === 0) return null;

  return (
    <section data-slot="profile-badges" className="mb-6">
      <header className="flex items-baseline gap-2 mb-3">
        <Award className="w-4 h-4 text-foreground" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
          Badges
        </h2>
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {earnedCount} earned
        </span>
      </header>
      <ul className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
        {badges.map((badge) => (
          <li key={badge.id} className="snap-start shrink-0 w-[140px]">
            <BadgeTile badge={badge} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BadgeTile({ badge }: { badge: ProfileBadge }) {
  const isLocked = !badge.earned;
  return (
    <div
      className="h-full rounded-[var(--radius-lg)] p-3 flex flex-col items-center text-center"
      style={
        isLocked
          ? { background: "var(--muted)", opacity: 0.6 }
          : { background: "var(--nh-lead-soft)", color: "var(--nh-lead)" }
      }
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-2 text-xl"
        style={isLocked ? { background: "var(--background)" } : { background: "var(--background)", color: "var(--nh-lead)" }}
        aria-hidden
      >
        {/* Most badge icons are emoji or single-char glyphs; we render the raw
            value to keep the open-graph icon system flexible. */}
        {badge.icon ?? "•"}
      </div>
      <span className="text-[12px] font-semibold leading-tight text-foreground line-clamp-2">
        {badge.name}
      </span>
      {isLocked && (
        <span className="mt-1 text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
          Locked
        </span>
      )}
    </div>
  );
}
