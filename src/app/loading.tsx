import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-300 mx-auto px-6 py-12">
      {/* Page heading sits on the base surface — a card-tone skeleton reads there. */}
      <Skeleton className="h-10 w-48 mb-6" />
      <Skeleton className="h-6 w-96 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          // Real event cards are bordered card surfaces; the inner placeholders
          // sit on that card, so they step up to `muted` to stay visible.
          <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
            <Skeleton surface="muted" className="h-48 w-full rounded-none" />
            <div className="p-4 space-y-3">
              <Skeleton surface="muted" className="h-5 w-3/4" />
              <Skeleton surface="muted" className="h-4 w-1/2" />
              <Skeleton surface="muted" className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
