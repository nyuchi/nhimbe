import { notFound, redirect } from "next/navigation";
import { getEventByIdOrSlug } from "@/lib/mongo/events";
import { canManageEventAction } from "@/app/actions/host-registrations";
import { EditEventForm } from "./edit-event-form";

interface EditEventPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { id } = await params;
  const event = await getEventByIdOrSlug(id);
  if (!event) notFound();

  // Host-gated the same way the manage page is (canManageEventAction) — a
  // signed-in non-host who lands here is sent back to the public event page
  // rather than seeing a bare 404.
  const canManage = await canManageEventAction(event.id);
  if (!canManage) redirect(`/events/${event.id}`);

  return <EditEventForm event={event} />;
}
