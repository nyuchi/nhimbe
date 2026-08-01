import { Skeleton } from "@/components/ui/skeleton";

export default function MapLoading() {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[var(--header-height,56px)] flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="relative flex-1">
        <Skeleton className="absolute inset-0 rounded-none" />
      </div>
    </div>
  );
}
