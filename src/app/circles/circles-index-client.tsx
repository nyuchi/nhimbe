"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, Flame, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NyuchiGroupCard } from "@/components/ui/nyuchi-group-card";
import { NyuchiEmptyState } from "@/components/ui/nyuchi-empty-state";
import { useAuth } from "@/components/auth/auth-context";
import { getMyCircles, type KraalSummary } from "@/app/actions/circles";
import { useT } from "@/lib/i18n";

export default function CirclesIndexClient() {
  const { t } = useT();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const personId = user?.personId ?? null;
  // Default to "not loading" — only flip true once we've actually kicked
  // off a fetch in the effect's async callback, which keeps the React 19
  // `set-state-in-effect` rule happy.
  const [loading, setLoading] = useState<boolean>(Boolean(personId));
  const [circles, setCircles] = useState<KraalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    getMyCircles()
      .then((rows) => {
        if (!cancelled) setCircles(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load your kraals");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  return (
    <div className="max-w-300 mx-auto px-6 py-10">
      {/* Savanna hero */}
      <header className="relative overflow-hidden rounded-(--radius-card) p-8 md:p-12 mb-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(700px 350px at 0% 100%, color-mix(in srgb, var(--heritage-savanna) 50%, transparent) 0%, transparent 60%), radial-gradient(600px 300px at 100% 0%, color-mix(in srgb, var(--heritage-baobab) 40%, transparent) 0%, transparent 60%), var(--surface)",
          }}
        />
        <p className="font-serif italic text-text-secondary mb-2">{t("brand.tagline")}</p>
        <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight mb-3">
          {t("kraal.title")}
        </h1>
        <p className="text-text-secondary max-w-150">{t("kraal.subtitle")}</p>
      </header>

      {!isAuthenticated && (
        <Card className="border-0 bg-surface">
          <CardContent className="p-8 text-center">
            <Flame className="w-10 h-10 mx-auto mb-3 text-primary" aria-hidden />
            <h2 className="font-serif text-xl font-semibold mb-2">Sign in to see your kraals</h2>
            <p className="text-text-secondary mb-5">
              Kraals are private to the people in them. Sign in and we&apos;ll bring you back here.
            </p>
            <Link
              href="/auth/hosted?return_to=%2Fcircles"
              className="inline-flex items-center gap-2 px-5 h-[var(--touch-target)] rounded-full bg-primary text-primary-foreground font-semibold"
            >
              Sign in <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      )}

      {isAuthenticated && loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <NyuchiGroupCard key={i} name="" memberCount={0} loading />
          ))}
        </div>
      )}

      {isAuthenticated && !loading && error && (
        <Card className="border-0 bg-surface">
          <CardContent className="p-6">
            <p className="text-red-400 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {isAuthenticated && !loading && !error && circles.length === 0 && (
        <NyuchiEmptyState
          icon={<Users />}
          title="No kraals yet"
          description="Hosts open a kraal alongside their event so attendees can keep the conversation going. Once you join one, it appears here."
          actionLabel="Find an event"
          onAction={() => router.push("/events")}
        />
      )}

      {isAuthenticated && !loading && circles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {circles.map((c) => (
            <Link key={c.id} href={`/circles/${c.id}`} className="block">
              <NyuchiGroupCard
                name={c.name}
                description={c.description || c.circle_purpose}
                memberCount={c.member_count ?? 0}
                // Kraals are private to the people in them.
                privacy="closed"
                topics={c.linked_event_id ? ["Event kraal"] : []}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
