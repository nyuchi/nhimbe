"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Ticket, Users, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NyuchiListingCard } from "@/components/ui/nyuchi-listing-card";
import { NyuchiTicketCard } from "@/components/ui/nyuchi-ticket-card";
import { NyuchiEmptyState } from "@/components/ui/nyuchi-empty-state";
import { categoryToMineral } from "@/lib/category-mineral";
import { getMediaUrl } from "@/lib/api";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/components/auth/auth-context";
import { getMyEvents, type MyEventsResult } from "@/app/actions/my-events";

type TabType = "attending" | "hosting" | "past";

function MyEventsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<MyEventsResult>({ attending: [], hosting: [], past: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("attending");

  // Load the viewer's events (attending / hosting / past) straight from MongoDB
  // via a server action — no /api round-trip, and "hosting" is resolved from
  // the person's host entities rather than by matching organizer names.
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const data = await getMyEvents();
        if (!cancelled) setEvents(data);
      } catch (error) {
        console.error("Failed to fetch my events:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const attendingEvents = events.attending;
  const hostingEvents = events.hosting;
  const pastEvents = events.past;
  const hostingIdSet = new Set(hostingEvents.map((e) => e.id));

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "attending", label: "Attending", icon: <Ticket className="w-4 h-4" />, count: attendingEvents.length },
    { id: "hosting", label: "Hosting", icon: <Users className="w-4 h-4" />, count: hostingEvents.length },
    { id: "past", label: "Past", icon: <Clock className="w-4 h-4" />, count: pastEvents.length },
  ];

  const currentEvents = {
    attending: attendingEvents,
    hosting: hostingEvents,
    past: pastEvents,
  }[activeTab];

  return (
    <div className="max-w-300 mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Events</h1>
          <p className="text-text-secondary mt-1">
            {user?.name ? `Welcome back, ${user.name.split(" ")[0]}!` : "Manage your upcoming gatherings and see past events"}
          </p>
        </div>
        <Link href="/events/create">
          <Button variant="default" size="lg">
            <CalendarPlus className="w-5 h-5" />
            Create Event
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-2 mb-6 sm:mb-8 border-b border-elevated overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors rounded-none h-auto ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            <Badge variant={activeTab === tab.id ? "default" : "secondary"}>
              {tab.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : currentEvents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {currentEvents.map((event, i) =>
            activeTab === "attending" ? (
              // Attending → a real ticket for the gathering.
              <NyuchiTicketCard
                key={event.id}
                href={`/events/${event.id}`}
                eventTitle={event.name}
                eventDate={`${event.date.month} ${event.date.day}${event.date.time ? ` · ${event.date.time}` : ""}`}
                eventVenue={event.location.name || event.location.addressLocality}
                tierName={event.offers?.price ? "Ticket" : "Free entry"}
                tierPrice={event.offers?.price ?? 0}
                ticketCode={event.shortCode}
                status="valid"
                mineral={categoryToMineral(event.category)}
              />
            ) : (
              // Hosting → straight to manage; past → the event page.
              <NyuchiListingCard
                key={event.id}
                variant="compact"
                index={i}
                href={
                  activeTab === "hosting" || hostingIdSet.has(event.id)
                    ? `/events/${event.id}/manage`
                    : `/events/${event.id}`
                }
                title={event.name}
                category={event.category}
                mineral={categoryToMineral(event.category)}
                image={event.image ? getMediaUrl(event.image) : undefined}
                meta={[
                  { label: "date", value: `${event.date.month} ${event.date.day}`, icon: Clock },
                  { label: "going", value: `${event.attendeeCount} going`, icon: Users },
                ]}
              />
            ),
          )}
        </div>
      ) : (
        <NyuchiEmptyState
          icon={activeTab === "hosting" ? <Users /> : <Ticket />}
          title={
            activeTab === "hosting"
              ? "No events hosted yet"
              : activeTab === "past"
                ? "No past events"
                : "No events found"
          }
          description={
            activeTab === "hosting"
              ? "Create your first event and bring your community together"
              : activeTab === "past"
                ? "Events you've attended or hosted will appear here"
                : "Explore events and find gatherings that interest you"
          }
          actionLabel={activeTab === "hosting" ? "Create event" : "Explore events"}
          onAction={() => router.push(activeTab === "hosting" ? "/events/create" : "/")}
        />
      )}
    </div>
  );
}

// Wrap with AuthGuard to require authentication
export default function MyEventsPage() {
  return (
    <AuthGuard>
      <MyEventsContent />
    </AuthGuard>
  );
}
