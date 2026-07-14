"use client";

/**
 * Calendars table — events.calendars (followable curated event streams,
 * NYU-25) with visibility and the denormalized follower/event counts.
 */

import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { AdminCalendar } from "@/lib/mongo/admin-types";
import { fetchAdminCalendars } from "@admin/app/actions/admin";
import { PagedTable, formatTableDate } from "@admin/components/paged-table";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nhimbe.com";

const COLUMNS = [
  { key: "calendar", label: "Calendar" },
  { key: "visibility", label: "Visibility" },
  { key: "followers", label: "Followers" },
  { key: "events", label: "Events", className: "hidden md:table-cell" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created", className: "hidden lg:table-cell" },
];

function visibilityVariant(visibility: string): "default" | "secondary" | "warning" {
  switch (visibility) {
    case "public":
      return "default";
    case "unlisted":
      return "secondary";
    default:
      return "warning";
  }
}

export interface CalendarsClientProps {
  initialCalendars: AdminCalendar[];
  initialTotal: number;
  pageSize?: number;
}

export default function CalendarsClient({
  initialCalendars,
  initialTotal,
  pageSize = 20,
}: CalendarsClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendars</h1>
        <p className="text-muted-foreground">
          Followable event streams (events.calendars) — visibility and follower counts
        </p>
      </div>

      <PagedTable<AdminCalendar>
        title="All Calendars"
        searchPlaceholder="Search calendars by name or slug..."
        emptyText="No calendars found"
        columns={COLUMNS}
        initialRows={initialCalendars}
        initialTotal={initialTotal}
        pageSize={pageSize}
        fetchPage={async (params) => {
          const data = await fetchAdminCalendars(params);
          return { rows: data.calendars, total: data.total };
        }}
        renderRow={(calendar) => (
          <tr key={calendar.id} className="hover:bg-muted/50">
            <td className="py-3 pr-4">
              <div className="min-w-0">
                <div className="font-medium truncate max-w-[220px] flex items-center gap-1.5">
                  <span className="truncate">{calendar.name}</span>
                  {calendar.visibility !== "private" && (
                    <a
                      href={`${SITE_URL}/calendars/${calendar.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${calendar.name} on nhimbe`}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <div className="text-sm text-muted-foreground truncate">{calendar.slug}</div>
              </div>
            </td>
            <td className="py-3 pr-4">
              <Badge variant={visibilityVariant(calendar.visibility)}>{calendar.visibility}</Badge>
            </td>
            <td className="py-3 pr-4 text-sm text-foreground/80">
              {calendar.followerCount.toLocaleString()}
            </td>
            <td className="py-3 pr-4 text-sm text-foreground/80 hidden md:table-cell">
              {calendar.eventCount.toLocaleString()}
            </td>
            <td className="py-3 pr-4">
              <Badge variant={calendar.isActive ? "success" : "secondary"}>
                {calendar.isActive ? "active" : "inactive"}
              </Badge>
            </td>
            <td className="py-3 pr-4 text-sm text-muted-foreground hidden lg:table-cell">
              {formatTableDate(calendar.dateCreated)}
            </td>
          </tr>
        )}
      />
    </div>
  );
}
