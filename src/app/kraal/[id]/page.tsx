import type { Metadata } from "next";
import { notFound } from "next/navigation";
import KraalDetailClient from "./kraal-detail-client";
import { SectionErrorBoundary } from "@/components/error/section-error-boundary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface KraalDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Kraal",
  description: "Where the gathering circle keeps the fire alive between events.",
};

export default async function KraalDetailPage({ params }: KraalDetailPageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return (
    <SectionErrorBoundary section="Kraal">
      <KraalDetailClient circleId={id} />
    </SectionErrorBoundary>
  );
}
