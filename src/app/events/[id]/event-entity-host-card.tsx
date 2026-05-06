"use client";

import { useEffect, useState } from "react";
import { User, Building2, Home, BadgeCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getEventHostInfo, type EventHostInfo } from "@/lib/supabase/api";

interface EventEntityHostCardProps {
  eventId: string;
  onResolved?: (found: boolean) => void;
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
  const [hostInfo, setHostInfo] = useState<EventHostInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getEventHostInfo(eventId)
      .then((info) => {
        setHostInfo(info);
        onResolved?.(info !== null);
      })
      .finally(() => setLoaded(true));
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
        </div>
        {hostInfo.description && (
          <p className="mt-2.5 text-xs text-foreground/60 line-clamp-2">
            {hostInfo.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
