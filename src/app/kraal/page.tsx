import type { Metadata } from "next";
import KraalIndexClient from "./kraal-index-client";
import { SectionErrorBoundary } from "@/components/error/section-error-boundary";

export const metadata: Metadata = {
  title: "Kraal — your gathering circles",
  description: "Where the gathering circle keeps the fire alive between events.",
};

export default function KraalIndexPage() {
  return (
    <SectionErrorBoundary section="Your kraals">
      <KraalIndexClient />
    </SectionErrorBoundary>
  );
}
