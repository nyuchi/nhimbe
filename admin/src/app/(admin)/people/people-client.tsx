"use client";

/**
 * People table — identity.persons with search, pagination, suspension and
 * admin-flag (role) management. Role grants that touch admin/super_admin are
 * enforced server-side at super_admin; the UI shows the options to every
 * admin and lets the server action be the authority.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Mail,
  Ban,
  Eye,
  Calendar,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import type { AdminUser } from "@/lib/mongo/admin-types";
import {
  fetchAdminUsers,
  suspendUser,
  activateUser,
  setUserRole,
} from "@admin/app/actions/admin";

const ROLE_OPTIONS = ["user", "moderator", "admin", "super_admin"] as const;

function roleBadgeVariant(role: string): "default" | "secondary" | "warning" {
  if (role === "admin" || role === "super_admin") return "default";
  if (role === "moderator") return "warning";
  return "secondary";
}

export interface PeopleClientProps {
  /** Pre-fetched first page rendered by the RSC shell. */
  initialUsers: AdminUser[];
  initialTotal: number;
  pageSize?: number;
}

export default function PeopleClient({
  initialUsers,
  initialTotal,
  pageSize = 20,
}: PeopleClientProps) {
  const limit = pageSize;
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(initialTotal / limit)));
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [roleMenuFor, setRoleMenuFor] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    userId: string;
    action: "suspend" | "activate";
    userName: string;
  } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminUsers({
        limit,
        offset: (page - 1) * limit,
        search: search || undefined,
      });
      setUsers(data.users);
      setTotalPages(Math.max(1, Math.ceil(data.total / limit)));
    } catch (err) {
      console.error("[mukoko] admin/people: fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [limit, page, search]);

  // Skip the first effect run: initial data is already in state from props.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true);
      return;
    }
    fetchUsers();
  }, [fetchUsers, hasMounted]);

  async function handleAction(userId: string, action: "suspend" | "activate") {
    try {
      if (action === "suspend") await suspendUser(userId);
      else await activateUser(userId);
      fetchUsers();
    } catch (err) {
      console.error(`[mukoko] admin/people: ${action} failed`, err);
    }
    setActionMenuOpen(null);
  }

  async function handleSetRole(userId: string, role: string) {
    setError(null);
    try {
      await setUserRole(userId, role);
      fetchUsers();
    } catch (err) {
      console.error("[mukoko] admin/people: role change failed", err);
      setError("Role change failed — granting admin roles requires super admin.");
    }
    setRoleMenuFor(null);
    setActionMenuOpen(null);
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">People</h1>
          <p className="text-muted-foreground">
            Manage identity.persons accounts, roles and suspensions
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search people by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* People Table */}
      <Card>
        <CardHeader>
          <CardTitle>All People</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No people found</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-muted-foreground border-b border-border">
                      <th className="pb-3 font-medium">Person</th>
                      <th className="pb-3 font-medium hidden md:table-cell">Location</th>
                      <th className="pb-3 font-medium">Role</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium hidden lg:table-cell">Joined</th>
                      <th className="pb-3 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-sm font-bold text-background shrink-0">
                              {user.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{user.name}</div>
                              <div className="text-sm text-muted-foreground truncate">
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 hidden md:table-cell">
                          {user.addressLocality || user.addressCountry ? (
                            <div className="flex items-center gap-1 text-foreground/80">
                              <MapPin className="w-3 h-3" />
                              <span className="text-sm">
                                {[user.addressLocality, user.addressCountry]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={roleBadgeVariant(user.role)}>
                            {user.role.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              user.status === "active"
                                ? "success"
                                : user.status === "suspended"
                                  ? "error"
                                  : "warning"
                            }
                          >
                            {user.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground hidden lg:table-cell">
                          {formatDate(user.dateCreated)}
                        </td>
                        <td className="py-3 relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Actions for ${user.name}`}
                            onClick={() =>
                              setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)
                            }
                            className="p-2 hover:bg-muted rounded-lg h-auto min-h-0"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === user.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[170px]">
                                <Button
                                  variant="ghost"
                                  onClick={() => setSelectedUser(user)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted rounded-none justify-start h-auto"
                                >
                                  <Eye className="w-4 h-4" />
                                  View details
                                </Button>
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setRoleMenuFor(user);
                                    setActionMenuOpen(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted rounded-none justify-start h-auto"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  Change role
                                </Button>
                                <Button
                                  variant="ghost"
                                  onClick={() => (window.location.href = `mailto:${user.email}`)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted rounded-none justify-start h-auto"
                                >
                                  <Mail className="w-4 h-4" />
                                  Send email
                                </Button>
                                {user.status === "active" ? (
                                  <Button
                                    variant="ghost"
                                    onClick={() => {
                                      setPendingAction({
                                        userId: user.id,
                                        action: "suspend",
                                        userName: user.name || user.email,
                                      });
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-error hover:bg-muted rounded-none justify-start h-auto"
                                  >
                                    <Ban className="w-4 h-4" />
                                    Suspend
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    onClick={() => {
                                      setPendingAction({
                                        userId: user.id,
                                        action: "activate",
                                        userName: user.name || user.email,
                                      });
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-success hover:bg-muted rounded-none justify-start h-auto"
                                  >
                                    <Ban className="w-4 h-4" />
                                    Activate
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="default"
                      disabled={page === 1}
                      aria-label="Previous page"
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                      const p = start + i;
                      if (p > totalPages) return null;
                      return (
                        <Button
                          key={p}
                          variant={p === page ? "default" : "ghost"}
                          size="default"
                          onClick={() => setPage(p)}
                          className="w-10"
                        >
                          {p}
                        </Button>
                      );
                    })}
                    <Button
                      variant="secondary"
                      size="default"
                      disabled={page === totalPages}
                      aria-label="Next page"
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Role picker modal */}
      {roleMenuFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRoleMenuFor(null)} />
          <div className="relative bg-card border border-border rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold mb-1">Change role</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {roleMenuFor.name || roleMenuFor.email} is currently{" "}
              <span className="font-medium text-foreground">
                {roleMenuFor.role.replace("_", " ")}
              </span>
              . Granting admin or super admin requires a super admin account.
            </p>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((role) => (
                <Button
                  key={role}
                  variant={role === roleMenuFor.role ? "default" : "secondary"}
                  disabled={role === roleMenuFor.role}
                  className="w-full justify-start"
                  onClick={() => handleSetRole(roleMenuFor.id, role)}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {role.replace("_", " ")}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => setRoleMenuFor(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Suspend/Activate Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-2">
              {pendingAction.action === "suspend" ? "Suspend account?" : "Activate account?"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {pendingAction.action === "suspend"
                ? `This will suspend "${pendingAction.userName}" and prevent them from accessing the platform.`
                : `This will reactivate "${pendingAction.userName}" and restore their access.`}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPendingAction(null)}>
                Cancel
              </Button>
              <Button
                variant="default"
                className={`flex-1 text-white ${
                  pendingAction.action === "suspend"
                    ? "bg-error hover:bg-error/90"
                    : "bg-success hover:bg-success/90 text-background"
                }`}
                onClick={() => {
                  handleAction(pendingAction.userId, pendingAction.action);
                  setPendingAction(null);
                }}
              >
                {pendingAction.action === "suspend" ? "Suspend" : "Activate"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Person Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedUser(null)} />
          <div className="relative bg-card border border-border rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-2xl font-bold text-background">
                  {selectedUser.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedUser.name}</h2>
                  {selectedUser.alternateName && (
                    <p className="text-muted-foreground">@{selectedUser.alternateName}</p>
                  )}
                  <Badge variant={roleBadgeVariant(selectedUser.role)} className="mt-1">
                    {selectedUser.role.replace("_", " ")}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close"
                onClick={() => setSelectedUser(null)}
                className="p-2 hover:bg-muted rounded-lg h-auto min-h-0"
              >
                ×
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-foreground/80">
                <Mail className="w-4 h-4" />
                <span>{selectedUser.email}</span>
              </div>
              {(selectedUser.addressLocality || selectedUser.addressCountry) && (
                <div className="flex items-center gap-3 text-foreground/80">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {[selectedUser.addressLocality, selectedUser.addressCountry]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 text-foreground/80">
                <Calendar className="w-4 h-4" />
                <span>Joined {formatDate(selectedUser.dateCreated)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
