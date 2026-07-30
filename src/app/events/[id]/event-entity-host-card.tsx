"use client";

import { useEffect, useState } from "react";
import { User, Building2, Home, BadgeCheck, Star, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Rating } from "@/components/ui/rating";
import {
  getEventHostCard,
  type EventHostInfo,
  type HostReputation,
} from "@/app/actions/host-card";
import type { ReviewStats } from "@/lib/api";

interface EventEntityHostCardProps {
  eventId: string;
  onResolved?: (found: boolean) => void;
  /** The event's own review aggregate — shown alongside the host identity. */
  reviewStats?: ReviewStats | null;
}

// nhimbe hosts come in three flavours, all resolved from the entity-centric
// MongoDB model (Rule 10 — an event references entity.entities, never a person
// directly):
//   - Person       → a family entity standing in for an individual
//                    (schemaOrgType "Person"); the founder person is surfaced
//   - Family       → a family entity representing an actual family/kin group
//   - Organization → organization / community / place_owner entities
// The server action does the cross-database fan-out (entity.entities +
// entity.memberships + identity.persons); the browser never touches Mongo.

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

export function EventEntityHostCard({ eventId, onResolved, reviewStats }: EventEntityHostCardProps) {
  const [hostInfo, setHostInfo] = useState<EventHostInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reputation, setReputation] = useState<HostReputation | null>(null);

  useEffect(() => {
    let active = true;
    getEventHostCard(eventId)
      .then((card) => {
        if (!active) return;
        setHostInfo(card?.host ?? null);
        setReputation(card?.reputation ?? null);
        onResolved?.(card !== null);
      })
      .catch(() => {
        if (active) onResolved?.(false);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [eventId, onResolved]);

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
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
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
            <div className="text-xs text-muted-foreground">{typeLabel}</div>
          </div>
        </div>
        {hostInfo.description && (
          <p className="mt-2.5 text-xs text-muted-foreground line-clamp-2">
            {hostInfo.description}
          </p>
        )}
        {(!!reviewStats?.averageRating || hostInfo.url) && (
          <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
            {!!reviewStats?.averageRating && reviewStats.averageRating > 0 && (
              <Rating value={reviewStats.averageRating} readOnly size="sm" showValue />
            )}
            {hostInfo.url && (
              <a
                href={hostInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                aria-label={`${hostInfo.name}'s website`}
              >
                <Globe className="w-4 h-4" aria-hidden />
                Website
              </a>
            )}
          </div>
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
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-1">
        {label}
      </dt>
    </div>
  );
}
