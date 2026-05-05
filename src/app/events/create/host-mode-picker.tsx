"use client";

import { useEffect, useState } from "react";
import { User, Building2, BadgeCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-context";
import { getOrgsForPerson } from "@/lib/supabase/api";
import type { OrganizationRow } from "@/lib/supabase/types";

function OrgLogo({ src, name }: { src: string; name: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return <Building2 className="w-4 h-4 text-text-secondary" aria-hidden />;
  }
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
  hostMode: "person" | "organization";
  organizationId: string | null;
  onChange: (mode: "person" | "organization", organizationId: string | null) => void;
  onOrgsLoaded?: (orgs: OrganizationRow[]) => void;
}

export function HostModePicker({ hostMode, organizationId, onChange, onOrgsLoaded }: HostModePickerProps) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const personId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!personId) return;
    setLoading(true);
    getOrgsForPerson(personId)
      .then((res) => {
        if (cancelled) return;
        setOrgs(res);
        onOrgsLoaded?.(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, onOrgsLoaded]);

  const personLabel = user?.name || "You";

  return (
    <div data-slot="host-mode-picker" className="mb-6">
      <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">
        Who&apos;s hosting?
      </h3>

      <Card className="divide-y divide-elevated border-0 bg-surface overflow-hidden">
        <button
          type="button"
          onClick={() => onChange("person", null)}
          aria-pressed={hostMode === "person"}
          className={[
            "w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors",
            hostMode === "person"
              ? "bg-primary/10"
              : "hover:bg-elevated",
          ].join(" ")}
        >
          <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center">
            <User className="w-4 h-4 text-text-secondary" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="font-medium">{personLabel}</div>
            <div className="text-sm text-text-tertiary">Personal — your name on the listing</div>
          </div>
          <span
            className={[
              "w-4 h-4 rounded-full border-2",
              hostMode === "person" ? "border-primary bg-primary" : "border-text-tertiary",
            ].join(" ")}
            aria-hidden
          />
        </button>

        {orgs.length === 0 && !loading && (
          <div className="px-4 py-3.5 flex items-center gap-3 opacity-60">
            <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center">
              <Building2 className="w-4 h-4 text-text-tertiary" aria-hidden />
            </div>
            <div className="flex-1">
              <div className="text-sm text-text-secondary">No organisations linked yet</div>
              <div className="text-xs text-text-tertiary">Add one in your profile to host as an org.</div>
            </div>
          </div>
        )}

        {orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => onChange("organization", org.id)}
            aria-pressed={hostMode === "organization" && organizationId === org.id}
            className={[
              "w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors",
              hostMode === "organization" && organizationId === org.id
                ? "bg-primary/10"
                : "hover:bg-elevated",
            ].join(" ")}
          >
            <div className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center overflow-hidden">
              {org.logo ? (
                <OrgLogo src={org.logo} name={org.name} />
              ) : (
                <Building2 className="w-4 h-4 text-text-secondary" aria-hidden />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium flex items-center gap-1.5">
                {org.name}
                {org.verified && (
                  <BadgeCheck className="w-4 h-4 text-primary" aria-label="Verified organisation" />
                )}
              </div>
              <div className="text-sm text-text-tertiary truncate">
                {org.description || "Organisation host"}
              </div>
            </div>
            <span
              className={[
                "w-4 h-4 rounded-full border-2",
                hostMode === "organization" && organizationId === org.id
                  ? "border-primary bg-primary"
                  : "border-text-tertiary",
              ].join(" ")}
              aria-hidden
            />
          </button>
        ))}
      </Card>
    </div>
  );
}
