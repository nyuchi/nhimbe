"use client";

import { useEffect, useState } from "react";
import { User, Building2, Home, BadgeCheck, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getEventHostInfo, type EventHostInfo } from "@/lib/supabase/api";
import { useAuth } from "@/components/auth/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface EventEntityHostCardProps {
  eventId: string;
  onResolved?: (found: boolean) => void;
}

// nhimbe hosts come in three flavours:
//   - Person       → identity.person row
//   - Family       → identity.entity (entity_type='family')
//   - Organization → identity.entity (entity_type='organization')
// Family + Organization share one table under the "Entity" umbrella (per
// the platform DB's identity.entity CHECK constraint). Person stands alone.
// The Follow target on engagement.follow_action uses owner_type as
// followed_type so all three branches read symmetrically.

interface HostReputation {
  ubuntuScore: number;
  eventsOrganized: number;
  followerCount: number;
}

/** Reads ubuntu.impact_scores for a person — shown on the host card when
 *  the host is a real person (not an organization). All fields default to 0
 *  when no row exists, so a new host's card stays clean.
 */
async function loadHostReputation(personId: string): Promise<HostReputation | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .schema("ubuntu")
      .from("impact_scores")
      .select("ubuntu_score,events_organized,follower_count")
      .eq("identity_id", personId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      ubuntuScore: Number(data.ubuntu_score ?? 0),
      eventsOrganized: data.events_organized ?? 0,
      followerCount: data.follower_count ?? 0,
    };
  } catch {
    return null;
  }
}

function HostAvatar({ info }: { info: EventHostInfo }) {
  const [errored, setErrored] = useState(false);
  if (info.avatar && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={info.avatar}
        alt={info.name}
        className="w-10 h-10 rounded-full object-cover"
        onError={() => setErrored(true)}
      />
    );
  }
  const Icon = info.ownerType === "family" ? Home : info.ownerType === "person" ? User : Building2;
  return (
    <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center shrink-0">
      <Icon className="w-5 h-5 text-text-secondary" aria-hidden />
    </div>
  );
}

export function EventEntityHostCard({ eventId, onResolved }: EventEntityHostCardProps) {
  const { user } = useAuth();
  const viewerPersonId = (user as { person_id?: string } | null)?.person_id ?? null;
  const [hostInfo, setHostInfo] = useState<EventHostInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reputation, setReputation] = useState<HostReputation | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    getEventHostInfo(eventId)
      .then((info) => {
        setHostInfo(info);
        onResolved?.(info !== null);
      })
      .finally(() => setLoaded(true));
  }, [eventId, onResolved]);

  // Reputation only makes sense for the Person branch — Family and
  // Organization hosts use entity.verification_status instead.
  useEffect(() => {
    if (!hostInfo || hostInfo.ownerType !== "person") return;
    loadHostReputation(hostInfo.id).then(setReputation);
  }, [hostInfo]);

  // Check if viewer already follows this host so we can show the right label.
  // The followed_type on engagement.follow_action mirrors owner_type so the
  // same shape works for person / family / organization without branching.
  useEffect(() => {
    if (!viewerPersonId || !hostInfo) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .schema("engagement")
      .from("follow_action")
      .select("follower_person_id")
      .eq("follower_person_id", viewerPersonId)
      .eq("followed_id", hostInfo.id)
      .eq("followed_type", hostInfo.ownerType)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [viewerPersonId, hostInfo]);

  const onToggleFollow = async () => {
    if (!viewerPersonId || !hostInfo || followBusy) return;
    setFollowBusy(true);
    const supabase = getSupabaseBrowserClient();
    try {
      if (following) {
        await supabase
          .schema("engagement")
          .from("follow_action")
          .delete()
          .eq("follower_person_id", viewerPersonId)
          .eq("followed_id", hostInfo.id)
          .eq("followed_type", hostInfo.ownerType);
        setFollowing(false);
      } else {
        await supabase.schema("engagement").from("follow_action").insert({
          follower_person_id: viewerPersonId,
          followed_id: hostInfo.id,
          followed_type: hostInfo.ownerType,
          starttime: new Date().toISOString(),
        });
        setFollowing(true);
      }
    } finally {
      setFollowBusy(false);
    }
  };

  if (!loaded || !hostInfo) return null;

  const typeLabel =
    hostInfo.ownerType === "family"
      ? "Family host"
      : hostInfo.ownerType === "organization"
        ? "Organisation host"
        : "Personal host";

  return (
    <Card
      data-slot="event-entity-host-card"
      className="border-0"
      style={{ backgroundColor: "var(--event-surface)" }}
    >
      <CardContent className="p-5">
        <p className="text-xs text-foreground/50 uppercase tracking-wider font-semibold mb-3">
          Hosted by
        </p>
        <div className="flex items-center gap-3">
          <HostAvatar info={hostInfo} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
              {hostInfo.name}
              {hostInfo.verificationStatus === "verified" && (
                <BadgeCheck
                  className="w-4 h-4 text-primary shrink-0"
                  aria-label="Verified"
                />
              )}
            </div>
            <div className="text-xs text-foreground/50">{typeLabel}</div>
          </div>
          {viewerPersonId && (
            <button
              type="button"
              onClick={onToggleFollow}
              disabled={followBusy}
              data-slot="event-host-follow"
              aria-pressed={following}
              className="inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold border transition-colors disabled:opacity-60"
              style={
                following
                  ? { background: "var(--nh-lead-soft)", color: "var(--nh-lead)", borderColor: "transparent" }
                  : { borderColor: "var(--border)" }
              }
            >
              {following ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {hostInfo.description && (
          <p className="mt-2.5 text-xs text-foreground/60 line-clamp-2">
            {hostInfo.description}
          </p>
        )}
        {/* Reputation strip — person hosts only, only when there's something to show. */}
        {reputation && (reputation.ubuntuScore > 0 || reputation.eventsOrganized > 0 || reputation.followerCount > 0) && (
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Ubuntu" value={reputation.ubuntuScore.toFixed(1)} Icon={Star} tint="var(--nh-accent)" />
            <Stat label="Hosted" value={String(reputation.eventsOrganized)} />
            <Stat label="Following" value={String(reputation.followerCount)} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  Icon,
  tint,
}: {
  label: string;
  value: string;
  Icon?: React.ComponentType<{ className?: string }>;
  tint?: string;
}) {
  return (
    <div>
      <dd
        className="font-serif text-base font-bold leading-none inline-flex items-center justify-center gap-1"
        style={tint ? { color: tint } : undefined}
      >
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {value}
      </dd>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50 mt-1">
        {label}
      </dt>
    </div>
  );
}
