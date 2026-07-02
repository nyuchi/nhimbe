"use client";

import { useEffect, useState } from "react";
import { Mountain, Music, Calendar as CalendarIcon, Utensils, Sparkles, ArrowUpRight } from "lucide-react";
import { listProgrammeItems, type ProgrammeItem } from "@/app/actions/programme";
import type { Event } from "@/lib/api";

/**
 * Type-aware "specifics" slot on EventDetail.
 *
 * Different event categories want different specifics surfaced — an outdoor
 * run cares about elevation + distance; a music festival cares about the
 * lineup; a conference cares about session schedule; a faith gathering
 * cares about the order of service. Rather than render every possible
 * card on every event (visual noise) or hide everything for "other"
 * categories (wasted real estate), this component picks the right card
 * based on event.category + data availability.
 *
 * Strategy:
 *   1. Outdoor categories (hike/run/walk/climb/swim/bike/marathon/parkrun)
 *      → <TerrainBand> reading elevation_m / distance_km from event.about.
 *   2. Anything that has rows in events.programmeItems (Mongo)
 *      → <ProgrammeCard> with a category-aware label:
 *        - music/festival       → "Lineup"
 *        - conference/workshop  → "Schedule"
 *        - faith/religious      → "Order of service"
 *        - food                 → "Menu"
 *        - default              → "Programme"
 *   3. Otherwise renders nothing — the slot collapses cleanly.
 */

interface EventSpecificsProps {
  event: Event;
}

const OUTDOOR_CATEGORIES = new Set([
  "hike", "hiking", "trail", "trail-run", "trail run", "trailrun",
  "run", "running", "walk", "walking", "marathon", "parkrun",
  "climb", "climbing", "swim", "swimming", "bike", "cycling", "cycle",
  "outdoor", "outdoors", "adventure",
]);

function categoryProgrammeLabel(cat: string): { title: string; Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> } {
  const c = cat.toLowerCase();
  if (["music", "festival", "concert"].some((m) => c.includes(m))) return { title: "Lineup", Icon: Music };
  if (["faith", "religious", "service", "worship", "church", "prayer"].some((m) => c.includes(m))) return { title: "Order of service", Icon: CalendarIcon };
  if (["food", "dinner", "tasting", "menu"].some((m) => c.includes(m))) return { title: "Menu", Icon: Utensils };
  if (["conference", "workshop", "talk", "lecture", "education", "tech", "summit"].some((m) => c.includes(m))) return { title: "Schedule", Icon: CalendarIcon };
  return { title: "Programme", Icon: Sparkles };
}

export function EventSpecifics({ event }: EventSpecificsProps) {
  const category = (event.category || "").toLowerCase();
  const isOutdoor = OUTDOOR_CATEGORIES.has(category);
  const terrain = isOutdoor ? readTerrain(event.about) : null;

  const [programme, setProgramme] = useState<ProgrammeItem[]>([]);
  const [programmeLoaded, setProgrammeLoaded] = useState(false);

  // The browser never touches Mongo: read events.programmeItems through a
  // Node-runtime Server Action. Ordering (sequence → start time) and performer
  // name resolution happen server-side.
  useEffect(() => {
    let cancelled = false;
    listProgrammeItems(event.id)
      .then((rows) => {
        if (cancelled) return;
        setProgramme(rows);
        setProgrammeLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setProgramme([]);
        setProgrammeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const hasTerrain = !!terrain;
  const hasProgramme = programmeLoaded && programme.length > 0;
  if (!hasTerrain && !hasProgramme) return null;

  return (
    <section data-slot="event-specifics" className="mt-8 space-y-6">
      {hasTerrain && <TerrainBand event={event} terrain={terrain!} />}
      {hasProgramme && <ProgrammeCard rows={programme} category={event.category} />}
    </section>
  );
}

interface TerrainData {
  elevationM?: number;
  distanceKm?: number;
  routeSummary?: string;
  surface?: string;
  profile?: number[];
}

function readTerrain(about: unknown): TerrainData | null {
  if (!about || typeof about !== "object") return null;
  const o = about as Record<string, unknown>;
  const elevation = numOrUndef(o.elevation_m ?? o.elevation);
  const distance = numOrUndef(o.distance_km ?? o.distance);
  const route = strOrUndef(o.route_summary ?? o.route);
  const surface = strOrUndef(o.surface);
  const profile = Array.isArray(o.profile) ? (o.profile.filter((n) => typeof n === "number") as number[]) : undefined;
  if (elevation === undefined && distance === undefined && !route && !surface && !profile) {
    return null;
  }
  return { elevationM: elevation, distanceKm: distance, routeSummary: route, surface, profile };
}
function numOrUndef(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function strOrUndef(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Elevation profile sparkline — signature visual for trail/run cards from
 * Nhimbe.html. Renders a small filled area chart from the profile sample
 * array. No data → no sparkline; the band still shows the headline figures.
 */
function ElevationSparkline({ data, width = 220, height = 44 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`).join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Elevation profile, ${min.toFixed(0)} m to ${max.toFixed(0)} m`}
      className="block"
    >
      <polygon points={area} fill="var(--nh-savanna)" opacity={0.22} />
      <polyline points={points} fill="none" stroke="var(--nh-savanna)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function TerrainBand({ event, terrain }: { event: Event; terrain: TerrainData }) {
  return (
    <div
      data-slot="terrain-band"
      className="rounded-[var(--radius-lg)] p-5"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--nh-savanna) 16%, transparent), color-mix(in srgb, var(--nh-baobab) 14%, transparent))",
        border: "1px solid var(--border)",
      }}
    >
      <header className="flex items-center gap-2 mb-3">
        <Mountain className="w-4 h-4" style={{ color: "var(--nh-savanna)" }} aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
          Terrain
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {event.category}
        </span>
      </header>
      <dl className="grid grid-cols-3 gap-4 mb-3">
        <Metric label="Distance" value={terrain.distanceKm !== undefined ? `${terrain.distanceKm} km` : "—"} />
        <Metric label="Elevation" value={terrain.elevationM !== undefined ? `${terrain.elevationM} m` : "—"} />
        <Metric label="Surface" value={terrain.surface ?? "—"} />
      </dl>
      {terrain.profile && terrain.profile.length >= 2 && (
        <div className="mt-3">
          <ElevationSparkline data={terrain.profile} />
        </div>
      )}
      {terrain.routeSummary && (
        <p className="mt-3 text-sm text-foreground/70 leading-relaxed">{terrain.routeSummary}</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="font-serif text-xl font-bold text-foreground leading-none">{value}</dd>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground mt-1">
        {label}
      </dt>
    </div>
  );
}

function ProgrammeCard({ rows, category }: { rows: ProgrammeItem[]; category: string }) {
  const { title, Icon } = categoryProgrammeLabel(category);
  return (
    <div
      data-slot="programme-card"
      className="rounded-[var(--radius-lg)] p-5 bg-muted"
    >
      <header className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-foreground" aria-hidden />
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-foreground">
          {title}
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "item" : "items"}
        </span>
      </header>
      <ol className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-3">
            <span className="font-mono text-[11px] text-muted-foreground pt-0.5 w-10 shrink-0">
              {formatProgrammeTime(r.startDate)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground line-clamp-1">{r.name}</div>
              {r.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.description}</p>
              )}
              {r.performer && (
                <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--nh-lead)" }}>
                  <ArrowUpRight className="w-3 h-3" aria-hidden />
                  {r.performer}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatProgrammeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
