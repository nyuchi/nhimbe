"use client";

import { useEffect, useMemo, useState } from "react";
import { User, Building2, Home, BadgeCheck, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-context";
import { getEntitiesForPerson } from "@/lib/supabase/api";
import type { EntityRow } from "@/lib/supabase/types";

export type HostMode = "person" | "organization" | "family";

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function EntityLogo({ src, name }: { src: string; name: string }) {
  const [errored, setErrored] = useState(false);
  if (errored || !isHttpsUrl(src)) return <Building2 className="w-4 h-4 text-text-secondary" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${name} logo`}
      loading="lazy"
      onError={() => setErrored(true)}
      className="w-full h-full object-cover"
    />
  );
}

interface HostModePickerProps {
  hostMode: HostMode;
  hostEntityId: string | null;
  onChange: (mode: HostMode, entityId: string | null) => void;
  onEntitiesLoaded?: (entities: EntityRow[]) => void;
}

function PickerRow({
  active,
  onClick,
  avatar,
  label,
  sublabel,
  verified,
}: {
  active: boolean;
  onClick: () => void;
  avatar: React.ReactNode;
  label: string;
  sublabel: string;
  verified?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors",
        active ? "bg-primary/10" : "hover:bg-elevated",
      ].join(" ")}
    >
      <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center overflow-hidden shrink-0">
        {avatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium flex items-center gap-1.5 truncate">
          {label}
          {verified && (
            <BadgeCheck className="w-4 h-4 text-primary shrink-0" aria-label="Verified" />
          )}
        </div>
        <div className="text-sm text-text-tertiary truncate">{sublabel}</div>
      </div>
      <span
        className={[
          "w-4 h-4 rounded-full border-2 shrink-0",
          active ? "border-primary bg-primary" : "border-text-tertiary",
        ].join(" ")}
        aria-hidden
      />
    </button>
  );
}

export function HostModePicker({
  hostMode,
  hostEntityId,
  onChange,
  onEntitiesLoaded,
}: HostModePickerProps) {
  const { user } = useAuth();
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(false);

  const personId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!personId) return;
    setLoading(true);
    getEntitiesForPerson(personId)
      .then((res) => {
        if (cancelled) return;
        setEntities(res);
        onEntitiesLoaded?.(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [personId, onEntitiesLoaded]);

  const { orgs, families } = useMemo(() => ({
    orgs: entities.filter((e) => e.entity_type === "organization"),
    families: entities.filter((e) => e.entity_type === "family"),
  }), [entities]);
  const personLabel = user?.name || "You";

  return (
    <div data-slot="host-mode-picker" className="mb-6">
      <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">
        Who&apos;s hosting?
      </h3>

      <Card className="divide-y divide-elevated border-0 bg-surface overflow-hidden">
        {/* Personal */}
        <PickerRow
          active={hostMode === "person"}
          onClick={() => onChange("person", null)}
          avatar={<User className="w-4 h-4 text-text-secondary" aria-hidden />}
          label={personLabel}
          sublabel="Personal — your name on the listing"
        />

        {/* Families */}
        {families.map((entity) => (
          <PickerRow
            key={entity.id}
            active={hostMode === "family" && hostEntityId === entity.id}
            onClick={() => onChange("family", entity.id)}
            avatar={
              entity.logo ? (
                <EntityLogo src={entity.logo} name={entity.name} />
              ) : (
                <Home className="w-4 h-4 text-text-secondary" aria-hidden />
              )
            }
            label={entity.name}
            sublabel={entity.description || "Family host"}
            verified={entity.verification_status === "verified"}
          />
        ))}

        {/* Organisations */}
        {orgs.map((entity) => (
          <PickerRow
            key={entity.id}
            active={hostMode === "organization" && hostEntityId === entity.id}
            onClick={() => onChange("organization", entity.id)}
            avatar={
              entity.logo ? (
                <EntityLogo src={entity.logo} name={entity.name} />
              ) : (
                <Building2 className="w-4 h-4 text-text-secondary" aria-hidden />
              )
            }
            label={entity.name}
            sublabel={entity.description || "Organisation host"}
            verified={entity.verification_status === "verified"}
          />
        ))}

        {/* Loading state */}
        {loading && (
          <div className="px-4 py-3.5 flex items-center gap-3 text-text-tertiary">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            <span className="text-sm">Loading your families &amp; organisations…</span>
          </div>
        )}

        {/* Empty state when no entities at all */}
        {!loading && entities.length === 0 && (
          <div className="px-4 py-3.5 flex items-center gap-3 opacity-60">
            <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center">
              <Building2 className="w-4 h-4 text-text-tertiary" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="text-sm text-text-secondary">No families or organisations linked</div>
              <div className="text-xs text-text-tertiary">Add one in your profile to host as a group.</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
