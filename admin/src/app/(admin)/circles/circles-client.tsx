"use client";

/**
 * Circles table — circles.circles with visibility (circleType) and the
 * denormalized member/post counts. Read-only: community moderation belongs
 * to the Circles/Campfire sibling products.
 */

import { Badge } from "@/components/ui/badge";
import type { AdminCircle } from "@/lib/mongo/admin-types";
import { fetchAdminCircles } from "@admin/app/actions/admin";
import { PagedTable, formatTableDate } from "@admin/components/paged-table";

const COLUMNS = [
  { key: "circle", label: "Circle" },
  { key: "visibility", label: "Visibility" },
  { key: "members", label: "Members" },
  { key: "posts", label: "Posts", className: "hidden md:table-cell" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created", className: "hidden lg:table-cell" },
];

function visibilityVariant(circleType: string): "default" | "secondary" | "warning" | "error" {
  switch (circleType) {
    case "public":
      return "default";
    case "private":
      return "warning";
    case "secret":
      return "error";
    default:
      return "secondary";
  }
}

export interface CirclesClientProps {
  initialCircles: AdminCircle[];
  initialTotal: number;
  pageSize?: number;
}

export default function CirclesClient({
  initialCircles,
  initialTotal,
  pageSize = 20,
}: CirclesClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Circles</h1>
        <p className="text-muted-foreground">
          Communities (circles.circles) — visibility and member counts
        </p>
      </div>

      <PagedTable<AdminCircle>
        title="All Circles"
        searchPlaceholder="Search circles by name or slug..."
        emptyText="No circles found"
        columns={COLUMNS}
        initialRows={initialCircles}
        initialTotal={initialTotal}
        pageSize={pageSize}
        fetchPage={async (params) => {
          const data = await fetchAdminCircles(params);
          return { rows: data.circles, total: data.total };
        }}
        renderRow={(circle) => (
          <tr key={circle.id} className="hover:bg-muted/50">
            <td className="py-3 pr-4">
              <div className="min-w-0">
                <div className="font-medium truncate max-w-[220px]">{circle.name}</div>
                <div className="text-sm text-muted-foreground truncate">{circle.slug}</div>
              </div>
            </td>
            <td className="py-3 pr-4">
              <Badge variant={visibilityVariant(circle.circleType)}>{circle.circleType}</Badge>
            </td>
            <td className="py-3 pr-4 text-sm text-foreground/80">
              {circle.memberCount.toLocaleString()}
            </td>
            <td className="py-3 pr-4 text-sm text-foreground/80 hidden md:table-cell">
              {circle.postCount.toLocaleString()}
            </td>
            <td className="py-3 pr-4">
              <Badge variant={circle.isActive ? "success" : "secondary"}>
                {circle.isActive ? "active" : "inactive"}
              </Badge>
            </td>
            <td className="py-3 pr-4 text-sm text-muted-foreground hidden lg:table-cell">
              {formatTableDate(circle.dateCreated)}
            </td>
          </tr>
        )}
      />
    </div>
  );
}
