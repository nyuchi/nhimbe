"use client";

/**
 * PagedTable — the shared search + pagination + table scaffold behind the
 * read-heavy admin sections (Entities, Circles, Calendars). The first page
 * arrives from the RSC shell; `fetchPage` (an admin-gated server action
 * wrapper) drives every subsequent search / page change. Row rendering stays
 * with the section so each table keeps its own columns and row actions.
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export interface PagedTableColumn {
  key: string;
  label: string;
  className?: string;
}

export interface PagedTableProps<T> {
  title: string;
  searchPlaceholder: string;
  emptyText: string;
  columns: PagedTableColumn[];
  initialRows: T[];
  initialTotal: number;
  pageSize?: number;
  fetchPage: (params: {
    limit: number;
    offset: number;
    search?: string;
  }) => Promise<{ rows: T[]; total: number }>;
  /** Render one <tr> per row (keying included). */
  renderRow: (row: T, refresh: () => void) => ReactNode;
}

export function PagedTable<T>({
  title,
  searchPlaceholder,
  emptyText,
  columns,
  initialRows,
  initialTotal,
  pageSize = 20,
  fetchPage,
  renderRow,
}: PagedTableProps<T>) {
  const limit = pageSize;
  const [rows, setRows] = useState<T[]>(initialRows);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(initialTotal / limit)));
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPage({
        limit,
        offset: (page - 1) * limit,
        search: search || undefined,
      });
      setRows(data.rows);
      setTotalPages(Math.max(1, Math.ceil(data.total / limit)));
    } catch (error) {
      console.error(`[mukoko] admin/${title.toLowerCase()}: fetch failed`, error);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, limit, page, search, title]);

  // Initial render uses props; only re-fetch on user-driven changes.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true);
      return;
    }
    refresh();
  }, [refresh, hasMounted]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
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

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">{emptyText}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-muted-foreground border-b border-border">
                      {columns.map((col) => (
                        <th key={col.key} className={`pb-3 font-medium ${col.className ?? ""}`}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => renderRow(row, refresh))}
                  </tbody>
                </table>
              </div>

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
    </div>
  );
}

/** Shared short-date formatter for table cells. */
export function formatTableDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
