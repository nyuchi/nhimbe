import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CircleDetailClient from "./circle-detail-client";
import { SectionErrorBoundary } from "@/components/error/section-error-boundary";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CircleDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Circle",
  description: "The community that keeps the fire alive between events.",
};

export default async function CircleDetailPage({ params }: CircleDetailPageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return (
    <SectionErrorBoundary section="Circle">
      <CircleDetailClient circleId={id} />
    </SectionErrorBoundary>
  );
}
