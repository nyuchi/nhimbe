"use client";

/**
 * Entities table — entity.entities with active-membership counts and a
 * members drill-down (one admin-gated fetch per opened entity).
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users } from "lucide-react";
import type { AdminEntity, AdminEntityMember } from "@/lib/mongo/admin-types";
import { fetchAdminEntities, fetchAdminEntityMembers } from "@admin/app/actions/admin";
import { PagedTable, formatTableDate } from "@admin/components/paged-table";

const COLUMNS = [
  { key: "entity", label: "Entity" },
  { key: "type", label: "Type", className: "hidden md:table-cell" },
  { key: "founder", label: "Founder", className: "hidden lg:table-cell" },
  { key: "members", label: "Members" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created", className: "hidden lg:table-cell" },
];

export interface EntitiesClientProps {
  initialEntities: AdminEntity[];
  initialTotal: number;
  pageSize?: number;
}

export default function EntitiesClient({
  initialEntities,
  initialTotal,
  pageSize = 20,
}: EntitiesClientProps) {
  const [membersFor, setMembersFor] = useState<AdminEntity | null>(null);
  const [members, setMembers] = useState<AdminEntityMember[] | null>(null);

  async function openMembers(entity: AdminEntity) {
    setMembersFor(entity);
    setMembers(null);
    try {
      setMembers(await fetchAdminEntityMembers(entity.id));
    } catch (error) {
      console.error("[mukoko] admin/entities: members fetch failed", error);
      setMembers([]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Entities</h1>
        <p className="text-muted-foreground">
          Host entities (entity.entities) and their memberships
        </p>
      </div>

      <PagedTable<AdminEntity>
        title="All Entities"
        searchPlaceholder="Search entities by name or slug..."
        emptyText="No entities found"
        columns={COLUMNS}
        initialRows={initialEntities}
        initialTotal={initialTotal}
        pageSize={pageSize}
        fetchPage={async (params) => {
          const data = await fetchAdminEntities(params);
          return { rows: data.entities, total: data.total };
        }}
        renderRow={(entity) => (
          <tr key={entity.id} className="hover:bg-muted/50">
            <td className="py-3 pr-4">
              <div className="min-w-0">
                <div className="font-medium truncate max-w-[220px]">{entity.name}</div>
                <div className="text-sm text-muted-foreground truncate">{entity.slug}</div>
              </div>
            </td>
            <td className="py-3 pr-4 hidden md:table-cell">
              <Badge variant="secondary">{entity.entityType.replace("_", " ")}</Badge>
            </td>
            <td className="py-3 pr-4 hidden lg:table-cell text-sm text-foreground/80">
              {entity.founderName}
            </td>
            <td className="py-3 pr-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openMembers(entity)}
                className="h-auto min-h-0 px-2 py-1 gap-1 text-foreground/80"
              >
                <Users className="w-4 h-4" />
                {entity.memberCount}
              </Button>
            </td>
            <td className="py-3 pr-4">
              <Badge variant={entity.isActive ? "success" : "secondary"}>
                {entity.isActive ? "active" : "inactive"}
              </Badge>
            </td>
            <td className="py-3 pr-4 text-sm text-muted-foreground hidden lg:table-cell">
              {formatTableDate(entity.dateCreated)}
            </td>
          </tr>
        )}
      />

      {/* Members drill-down modal */}
      {membersFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMembersFor(null)} />
          <div className="relative bg-card border border-border rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">{membersFor.name}</h2>
                <p className="text-sm text-muted-foreground">Memberships</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close"
                onClick={() => setMembersFor(null)}
                className="p-2 hover:bg-muted rounded-lg h-auto min-h-0"
              >
                ×
              </Button>
            </div>
            {members === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No memberships</p>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.personId}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/60"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{member.name}</div>
                      <div className="text-sm text-muted-foreground truncate">{member.email}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={member.isActive ? "default" : "secondary"}>
                        {member.membershipRole}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTableDate(member.joinedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
