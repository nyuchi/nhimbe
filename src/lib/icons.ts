/**
 * Central icon registry (N1).
 *
 * Mzizi components import named icons from `@/lib/icons` rather than reaching
 * into `lucide-react` directly. Re-exporting the full lucide surface here keeps
 * every named icon (and its `*Icon` alias, e.g. `XIcon`, `PanelLeftIcon`)
 * resolvable through the canonical path.
 */
export * from "lucide-react";
