"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { getProfileBadges, type ProfileBadge } from "@/app/actions/badges";
import { NyuchiBadgeDisplay, type BadgeItem, type BadgeRarity } from "@/components/ui/nyuchi-badge-display";

const RARITIES: readonly BadgeRarity[] = ["common", "uncommon", "rare", "legendary"];

/** Coerce the free-form `ubuntu.badges.rarity` into the brand palette scale. */
function toRarity(rarity: string | null): BadgeRarity | undefined {
  const r = rarity?.toLowerCase();
  return RARITIES.find((v) => v === r);
}

/** Map an Ubuntu ProfileBadge to the brand NyuchiBadgeDisplay item shape. */
function toBadgeItem(badge: ProfileBadge): BadgeItem {
  return {
    id: badge.id,
    name: badge.name,
    description: badge.description ?? undefined,
    icon: badge.icon ?? undefined,
    rarity: toRarity(badge.rarity),
    locked: !badge.earned,
    earnedAt: badge.earned?.awardedAt,
  };
}

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
      {/* Branded Ubuntu badge grid (mineral rarity tints; locked badges dim). */}
      <NyuchiBadgeDisplay badges={badges.map(toBadgeItem)} />
    </section>
  );
}
