import type { Metadata } from "next";
import CirclesIndexClient from "./circles-index-client";
import { SectionErrorBoundary } from "@/components/error/section-error-boundary";

export const metadata: Metadata = {
  title: "Circles — your communities",
  description: "The communities that keep the fire alive between events.",
};

export default function CirclesIndexPage() {
  return (
    <SectionErrorBoundary section="Your circles">
      <CirclesIndexClient />
    </SectionErrorBoundary>
  );
}
