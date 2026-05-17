"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * ProfileBadges — Ubuntu reputation badges earned by a person.
 *
 * Schema (verified via Supabase MCP):
 *   ubuntu.user_badges(identity_id, badge_id text, earned_at,
 *                      nft_token_id, nft_minted, nft_minted_at)
 *   ubuntu.badges(id text, name, description, icon, badge_type,
 *                 points_required, contribution_count_required,
 *                 specific_requirement jsonb, is_nft_badge,
 *                 nft_contract_address, nft_chain)
 *
 * Renders earned badges as a horizontally-scrolling row with the badge
 * icon, name, and an NFT chip when nft_minted=true. Locked badges
 * (registered in ubuntu.badges but not yet earned by this person) appear
 * dimmed at the tail so the surface always feels "there's more to earn".
 *
 * The PK on user_badges is presumed to be (identity_id, badge_id); we
 * read with .eq("identity_id", personId) and join via in-clause to
 * ubuntu.badges. Renders nothing when there are no badges of either kind.
 */

interface ProfileBadgesProps {
  personId: string;
}

interface BadgeDef {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  badge_type: string | null;
  is_nft_badge: boolean | null;
}

interface EarnedBadge {
  badge_id: string;
  earned_at: string;
  nft_minted: boolean | null;
}

interface MergedBadge {
  def: BadgeDef;
  earned?: EarnedBadge;
}

const MAX_LOCKED_SHOWN = 4;

export function ProfileBadges({ personId }: ProfileBadgesProps) {
  const [merged, setMerged] = useState<MergedBadge[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!personId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: earnedRows } = await supabase
        .schema("ubuntu")
        .from("user_badges")
        .select("badge_id,earned_at,nft_minted")
        .eq("identity_id", personId);
      const earned = ((earnedRows as EarnedBadge[] | null) ?? []).slice();
      const earnedIds = earned.map((e) => e.badge_id);

      const { data: badgeDefs } = await supabase
        .schema("ubuntu")
        .from("badges")
        .select("id,name,description,icon,badge_type,is_nft_badge")
        .limit(80);
      const defs = (badgeDefs as BadgeDef[] | null) ?? [];

      const earnedSet = new Set(earnedIds);
      const earnedMerged: MergedBadge[] = earned.flatMap((e) => {
        const def = defs.find((d) => d.id === e.badge_id);
        return def ? [{ def, earned: e } as MergedBadge] : [];
      });
      // Sort earned by most recent first so the shiniest sits first.
      earnedMerged.sort((a, b) => +new Date(b.earned!.earned_at) - +new Date(a.earned!.earned_at));

      const locked: MergedBadge[] = defs
        .filter((d) => !earnedSet.has(d.id))
        .slice(0, MAX_LOCKED_SHOWN)
        .map((d) => ({ def: d }));

      if (!cancelled) {
        setMerged([...earnedMerged, ...locked]);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  if (!loaded) return null;
  const earnedCount = merged.filter((m) => !!m.earned).length;
  if (merged.length === 0) return null;

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
        {merged.map(({ def, earned }) => (
          <li key={def.id} className="snap-start shrink-0 w-[140px]">
            <BadgeTile def={def} earned={earned} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BadgeTile({ def, earned }: { def: BadgeDef; earned?: EarnedBadge }) {
  const isLocked = !earned;
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
        {/* Most badge.icon entries are emoji or single-char glyphs; we render
            the raw value to keep the open-graph icon system flexible. */}
        {def.icon ?? "•"}
      </div>
      <span className="text-[12px] font-semibold leading-tight text-foreground line-clamp-2">
        {def.name}
      </span>
      {earned?.nft_minted && (
        <span
          className="mt-1 text-[9px] font-semibold uppercase tracking-[0.05em] px-1.5 py-0.5 rounded-full"
          style={{ background: "var(--background)", color: "var(--nh-accent)" }}
        >
          NFT
        </span>
      )}
      {isLocked && (
        <span className="mt-1 text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
          Locked
        </span>
      )}
    </div>
  );
}
