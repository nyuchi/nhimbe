import { cn } from "@/lib/utils"

// Skeletons take the tone of the surface they stand in for, so a loading
// placeholder reads like the real content it precedes. Default to `card` — most
// skeletons sit on the page (base) and represent cards/panels; pass a different
// surface for placeholders that live on another ladder step.
const surfaceClass = {
  card: "bg-card",
  base: "bg-base",
  surface: "bg-surface",
  container: "bg-container",
  raised: "bg-raised",
  muted: "bg-muted",
} as const

type SkeletonSurface = keyof typeof surfaceClass

function Skeleton({
  className,
  surface = "card",
  ...props
}: React.ComponentProps<"div"> & { surface?: SkeletonSurface }) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md", surfaceClass[surface], className)}
      {...props}
    />
  )
}

export { Skeleton }
