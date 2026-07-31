"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  Eye,
  Share2,
  Check,
  X,
  Clock,
  Mail,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  MapPin,
  Loader2,
  MessageSquare,
  QrCode,
  UserPlus,
  Bell,
  MessageCircle,
  ChevronRight,
  Video,
  Download,
  Filter,
  Search,
  Globe,
  TrendingUp,
  Ticket,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NyuchiNotificationItem } from "@/components/ui/nyuchi-notification-item";
import { NyuchiActionSheet } from "@/components/ui/nyuchi-action-sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import { Switch } from "@/components/ui/switch";
import {
  deleteEvent,
  type Event,
  type Registration as APIRegistration,
} from "@/lib/api";
import { findEventAction } from "@/app/actions/discovery";
import {
  getEventRegistrationsAction,
  updateRegistrationStatusAction,
  checkinRegistrationAction,
  canManageEventAction,
} from "@/app/actions/host-registrations";
import { AuthGuard } from "@/components/auth/auth-guard";
import { PairKiosk } from "../kiosk/pair-kiosk";
import { VenueVerifyCta } from "./venue-verify-cta";
import { EventManageShell, type ManageSectionKey } from "../event-manage-shell";
import { useAuth } from "@/components/auth/auth-context";
import { useToast } from "@/hooks/use-toast";

const SECTION_KEYS: ManageSectionKey[] = [
  "overview",
  "guests",
  "registration",
  "blasts",
  "insights",
  "settings",
];

function isSectionKey(value: string | null): value is ManageSectionKey {
  return SECTION_KEYS.includes(value as ManageSectionKey);
}

interface Registration {
  id: string;
  name: string;
  email: string;
  status: string;
  date: string;
  avatar: string;
  checkedIn?: boolean;
}

interface EventStats {
  views: number;
  registrations: number;
  approved: number;
  pending: number;
  checkedIn: number;
}

function ManageEventContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const activeKey: ManageSectionKey = isSectionKey(sectionParam) ? sectionParam : "overview";
  const { user, accessToken, getAccessToken } = useAuth();
  // Stable identity for the data-loading effect. Depending on the whole `user`
  // object re-ran the fetch on every render (new object reference each time),
  // which re-fetched the event + registrations constantly and made the page
  // feel like it reloaded on every interaction.
  const userId = user?.id ?? null;
  const { toast } = useToast();

  // Helper: lazily fetch a fresh JWT for each write so an idle tab doesn't
  // send an expired token after the wizard sits unused for an hour.
  const tokenOrThrow = async () => {
    const t = accessToken ?? (await getAccessToken());
    if (!t) throw new Error("Sign in required");
    return t;
  };
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [registrationFilter, setRegistrationFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [guestSearch, setGuestSearch] = useState("");
  const [requireApproval, setRequireApproval] = useState(true);
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [blastMessage, setBlastMessage] = useState("");
  const [sheetGuest, setSheetGuest] = useState<Registration | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const eventData = await findEventAction(params.id as string);
        setEvent(eventData);

        if (eventData && userId) {
          // Ownership is entity-centric: the acting person must be able to host
          // through the event's host entity (founder/admin/manager/rep). Resolved
          // server-side — a name-string comparison locked out anyone hosting via
          // an organisation/family entity (their personal name ≠ the org name).
          const ownerCheck = await canManageEventAction(eventData.id);

          setIsOwner(ownerCheck);

          // Only fetch registrations if user is owner
          if (ownerCheck) {
            const regs = await getEventRegistrationsAction(eventData.id);
            const formattedRegs: Registration[] = regs.map((r: APIRegistration) => ({
              id: r.id,
              name: r.userName || "Unknown User",
              email: r.userEmail || r.userId,
              status: r.status,
              date: new Date(r.registeredAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
              avatar: (r.userName || "U")
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2),
              checkedIn: r.status === "attended",
            }));
            setRegistrations(formattedRegs);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [params.id, userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-200 mx-auto px-6 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Event not found</h1>
        <Link href="/my-events">
          <Button variant="default">Back to My Events</Button>
        </Link>
      </div>
    );
  }

  // Access denied - user is not the event host
  if (!isOwner) {
    return (
      <div className="max-w-200 mx-auto px-6 py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p className="text-text-secondary mb-6">
          You do not have permission to manage this event.
          Only the event host can access this page.
        </p>
        <div className="flex justify-center gap-4">
          <Link href={`/events/${event.id}`}>
            <Button variant="secondary">View Event</Button>
          </Link>
          <Link href="/my-events">
            <Button variant="default">My Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  const stats: EventStats = {
    views: 0, // Will be populated by real analytics API when available
    registrations: registrations.length,
    approved: registrations.filter((r) => r.status === "approved" || r.status === "registered").length,
    pending: registrations.filter((r) => r.status === "pending").length,
    checkedIn: registrations.filter((r) => r.checkedIn).length,
  };

  const filteredRegistrations = registrations.filter((r) => {
    const matchesFilter = registrationFilter === "all" || r.status === registrationFilter;
    const matchesSearch = !guestSearch ||
      r.name.toLowerCase().includes(guestSearch.toLowerCase()) ||
      r.email.toLowerCase().includes(guestSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleApprove = async (id: string) => {
    try {
      await updateRegistrationStatusAction(id, "approved");
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "approved" } : r))
      );
      toast.success("Registration approved");
    } catch (error) {
      console.error("Failed to approve registration:", error);
      toast.error(error instanceof Error ? error.message : "Failed to approve registration");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await updateRegistrationStatusAction(id, "rejected");
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "rejected" } : r))
      );
      toast.success("Registration rejected");
    } catch (error) {
      console.error("Failed to reject registration:", error);
      toast.error(error instanceof Error ? error.message : "Failed to reject registration");
    }
  };

  // Host-page check-in. Goes through the organizer-authenticated
  // /api/events/:id/checkin endpoint (the paired-kiosk flow uses
  // /api/kiosk/checkin with its session token — separate auth context).
  // Previously this was local-state-only — clicking "Check in" toggled the
  // UI but never wrote to the server, so attendance was lost on reload.
  const handleCheckIn = async (id: string) => {
    const previousState = registrations.find((r) => r.id === id)?.checkedIn ?? false;
    // Optimistic flip
    setRegistrations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, checkedIn: !r.checkedIn } : r))
    );
    try {
      await checkinRegistrationAction(event.id, id);
      toast.success("Checked in");
    } catch (error) {
      // Roll back the optimistic flip on failure so the UI matches the server.
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, checkedIn: previousState } : r))
      );
      const message = error instanceof Error ? error.message : "Failed to check in";
      console.error("Failed to check in registration:", error);
      // "Already checked in" comes back as 409 — that's a benign double-tap,
      // surface it as info not error so the host doesn't panic.
      if (message.toLowerCase().includes("already")) {
        toast.info(message);
        // Server says they're checked in already — keep the UI flipped.
        setRegistrations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, checkedIn: true } : r))
        );
      } else {
        toast.error(message);
      }
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/events/${event.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/events/${event.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.name,
          text: `Check out ${event.name} on Nhimbe`,
          url,
        });
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleEmailGuests = () => {
    if (registrations.length === 0) return;
    const approvedEmails = registrations
      .filter((r) => r.status === "approved" || r.status === "registered")
      .map((r) => r.email)
      .join(",");
    const subject = encodeURIComponent(`Update about ${event.name}`);
    const body = encodeURIComponent(`Hi everyone,\n\nThis is an update about ${event.name} on ${event.date.full}.\n\nBest regards`);
    window.location.href = `mailto:${approvedEmails}?subject=${subject}&body=${body}`;
  };

  const handleDeleteEvent = async () => {
    setActionLoading(true);
    try {
      const token = await tokenOrThrow();
      await deleteEvent(event.id, token);
      router.push("/my-events");
    } catch (err) {
      console.error("Failed to delete event:", err);
      setActionLoading(false);
    }
  };

  const handleSendBlast = () => {
    if (!blastMessage.trim()) return;
    handleEmailGuests();
    setBlastMessage("");
  };

  const capacity = event.maximumAttendeeCapacity || 100;
  const capacityUsed = stats.approved;

  return (
    <EventManageShell eventId={event.id} eventName={event.name} activeKey={activeKey} pendingGuestCount={stats.pending}>
    <div className="max-w-280 mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Overview */}
        {activeKey === "overview" && (
        <div className="space-y-6">
          {/* Quick Actions Row */}
          <div className="flex flex-wrap gap-3">
            <Button variant="default" className="gap-2" onClick={() => {}}>
              <UserPlus className="w-4 h-4" />
              Invite Guests
            </Button>
            <Button variant="secondary" className="gap-2" onClick={() => {}}>
              <MessageSquare className="w-4 h-4" />
              Send a Blast
            </Button>
            <Button variant="secondary" className="gap-2" onClick={handleShare}>
              <Share2 className="w-4 h-4" />
              Share Event
            </Button>
          </div>

          {/* Event Preview Card */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-col md:flex-row">
              {/* Cover Image — mirrors the public event page's banner
                  (event-cover.tsx): image + dark scrim + date/category
                  overlay, not a bare background div. The Card above needs
                  `p-0` here too — its default padding was pushing this block
                  down from the rounded corner, leaving a blank strip above it. */}
              <div
                className="relative w-full md:w-64 h-48 md:h-auto shrink-0 overflow-hidden"
                style={
                  event.image
                    ? {
                        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.5)), url('${event.image}')`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { background: event.coverGradient || "linear-gradient(135deg, #64FFDA 0%, #B388FF 100%)" }
                }
              >
                {event.image && (
                  <Image src={event.image} alt={event.name} fill className="object-cover" />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                <div className="absolute top-3 left-3 flex gap-2 z-10">
                  <div className="bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded-xl text-center">
                    <div
                      className="text-lg font-extrabold leading-none"
                      style={{ color: "var(--event-primary)" }}
                    >
                      {event.date.day}
                    </div>
                    <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
                      {event.date.month}
                    </div>
                  </div>
                  <Badge
                    className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase self-start border-0"
                    style={{ backgroundColor: "var(--event-primary)", color: "#0A0A0A" }}
                  >
                    {event.category}
                  </Badge>
                </div>
              </div>
              {/* Event Info */}
              <div className="flex-1 p-6">
                <h2 className="text-xl font-bold mb-3">{event.name}</h2>

                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1 px-2 py-1 bg-elevated rounded text-sm">
                    <span className="font-semibold">{event.date.month.toUpperCase().slice(0, 3)}</span>
                    <span className="font-bold text-lg">{event.date.day}</span>
                  </div>
                  <div className="text-sm">
                    <div className="font-medium">{event.date.full.split(",")[0]}</div>
                    <div className="text-text-secondary">{event.date.time}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-text-secondary mb-4">
                  {event.eventAttendanceMode === 'OnlineEventAttendanceMode' ? (
                    <>
                      <Video className="w-4 h-4" />
                      <span>{event.meetingPlatform === "google_meet" ? "Google Meet" : event.meetingPlatform === "zoom" ? "Zoom" : "Online"}</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4" />
                      <span>{event.location.name || event.location.addressLocality}</span>
                    </>
                  )}
                </div>

                {/* Host-only nudge: unverified venues deep-link to the Kweli
                    verification gateway (renders nothing when verified). */}
                {event.eventAttendanceMode !== 'OnlineEventAttendanceMode' && event.placeId && (
                  <div className="-mt-2 mb-4">
                    <VenueVerifyCta placeId={event.placeId} />
                  </div>
                )}

                {/* Host Info */}
                <div className="border-t border-elevated pt-4">
                  <div className="text-xs text-text-tertiary mb-1">Hosted By</div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-xs font-bold text-background">
                      {event.organizer.initials}
                    </div>
                    <span className="font-medium">{event.organizer.name}</span>
                  </div>
                </div>

                {/* Event Link */}
                <div className="mt-4 flex items-center gap-2 p-3 bg-elevated rounded-lg">
                  <Globe className="w-4 h-4 text-text-tertiary" />
                  <span className="flex-1 text-sm text-text-secondary truncate">
                    {window.location.origin}/e/{event.shortCode}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="text-sm font-medium text-primary hover:text-primary/80"
                  >
                    {copySuccess ? "COPIED" : "COPY"}
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Share Event Section */}
          <Card>
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <span className="text-sm font-medium">Share Event</span>
              <div className="flex gap-3">
                {[
                  { name: "Facebook", icon: "f", color: "#1877F2" },
                  { name: "X", icon: "𝕏", color: "#000" },
                  { name: "LinkedIn", icon: "in", color: "#0A66C2" },
                  { name: "WhatsApp", icon: "✆", color: "#25D366" },
                ].map((platform) => (
                  <button
                    key={platform.name}
                    onClick={handleShare}
                    className="w-10 h-10 rounded-full bg-elevated hover:bg-surface-hover flex items-center justify-center transition-colors"
                    title={platform.name}
                  >
                    <span className="text-sm font-bold">{platform.icon}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity — branded notification feed of the latest guests */}
          {registrations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>The latest guests to respond to your event.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {registrations.slice(0, 6).map((r) => (
                    <NyuchiNotificationItem
                      key={r.id}
                      type={
                        r.checkedIn ? "trust" : r.status === "pending" ? "verification" : "event"
                      }
                      title={`${r.name} ${
                        r.checkedIn
                          ? "checked in"
                          : r.status === "pending"
                            ? "requested to join"
                            : "RSVP’d"
                      }`}
                      message={r.email}
                      timestamp={r.date}
                      actorName={r.name}
                      read
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* When & Where */}
          <Card>
            <CardHeader>
              <CardTitle>When & Where</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex items-center gap-1 px-3 py-2 bg-elevated rounded-lg text-center min-w-[60px]">
                  <div>
                    <div className="text-xs text-text-secondary">{event.date.month.toUpperCase().slice(0, 3)}</div>
                    <div className="text-2xl font-bold">{event.date.day}</div>
                  </div>
                </div>
                <div>
                  <div className="font-medium">{event.date.full}</div>
                  <div className="text-sm text-text-secondary">{event.date.time}</div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-[60px] h-[60px] bg-elevated rounded-lg flex items-center justify-center">
                  {event.eventAttendanceMode === 'OnlineEventAttendanceMode' ? (
                    <Video className="w-6 h-6 text-text-secondary" />
                  ) : (
                    <MapPin className="w-6 h-6 text-text-secondary" />
                  )}
                </div>
                <div>
                  <div className="font-medium">
                    {event.eventAttendanceMode === 'OnlineEventAttendanceMode'
                      ? (event.meetingPlatform === "google_meet" ? "Google Meet" : event.meetingPlatform || "Online Event")
                      : event.location.name
                    }
                  </div>
                  <div className="text-sm text-text-secondary">
                    {event.eventAttendanceMode === 'OnlineEventAttendanceMode'
                      ? "Virtual event - link sent upon registration"
                      : `${event.location.streetAddress || event.location.addressLocality}, ${event.location.addressCountry}`
                    }
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Guests */}
        {activeKey === "guests" && (
        <div className="space-y-6">
          {/* At a Glance */}
          <Card>
            <CardHeader>
              <CardTitle>At a Glance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <div className="text-3xl font-bold">{stats.approved} <span className="text-lg font-normal text-text-secondary">Going</span></div>
                <div className="text-text-secondary">cap <span className="font-bold text-foreground">{capacity}</span></div>
              </div>
              <Progress value={capacityUsed} max={capacity} />
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            <Button variant="default" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Invite Guests
            </Button>
            <Button asChild variant="secondary" className="gap-2">
              <Link href={`/events/${event.id}/kiosk/host`} target="_blank" rel="noopener noreferrer">
                <QrCode className="w-4 h-4" />
                Check In Guests
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              </Link>
            </Button>
            <Button variant="secondary" className="gap-2">
              <Users className="w-4 h-4" />
              Guests Shown
            </Button>
          </div>

          {/* Kiosk Pairing */}
          <PairKiosk eventId={event.id} />

          {/* Guest List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Guest List</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="w-9 h-9">
                  <Filter className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="w-9 h-9">
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search guests..."
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <FilterBar
                  options={[
                    { id: "all", label: `All (${registrations.length})` },
                    { id: "pending", label: `Pending (${stats.pending})` },
                    { id: "approved", label: `Approved (${stats.approved})` },
                    { id: "rejected", label: `Rejected (${registrations.filter(r => r.status === "rejected").length})` },
                  ]}
                  selected={registrationFilter === "all" ? [] : [registrationFilter]}
                  onChange={(sel) => setRegistrationFilter(sel.length > 0 ? sel[0] as "all" | "pending" | "approved" | "rejected" : "all")}
                  mode="single"
                  showAll={false}
                />
              </div>

              {/* Guest List */}
              <div className="divide-y divide-elevated">
                {filteredRegistrations.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-elevated rounded-full flex items-center justify-center">
                      <Users className="w-8 h-8 text-text-tertiary" />
                    </div>
                    <h3 className="text-lg font-medium text-text-secondary mb-1">No Guests Yet</h3>
                    <p className="text-sm text-text-tertiary">Share the event or invite people to get started!</p>
                  </div>
                ) : filteredRegistrations.map((registration) => (
                  <div key={registration.id} className="flex items-center gap-3 py-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-sm font-bold text-background shrink-0">
                      {registration.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{registration.name}</div>
                      <div className="text-sm text-text-secondary truncate">{registration.email}</div>
                    </div>
                    <Badge variant={
                      registration.status === "approved" || registration.status === "registered" ? "success" :
                      registration.status === "pending" ? "warning" : "error"
                    }>
                      {registration.status}
                    </Badge>
                    <div className="hidden md:block text-sm text-text-tertiary">
                      {registration.date}
                    </div>
                    {registration.status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(registration.id)}
                          className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReject(registration.id)}
                          className="w-9 h-9 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCheckIn(registration.id)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                          registration.checkedIn
                            ? "bg-primary text-primary-foreground"
                            : "bg-elevated hover:bg-surface"
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setSheetGuest(registration)}
                      aria-label={`Actions for ${registration.name}`}
                      className="w-9 h-9 rounded-full bg-elevated hover:bg-surface flex items-center justify-center transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Registration */}
        {activeKey === "registration" && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="font-medium">Registration</div>
                  <div className="text-sm text-green-400">Open</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <div className="font-medium">Event Capacity</div>
                  <div className="text-sm text-text-secondary">{capacity} · Waitlist {waitlistEnabled ? "On" : "Off"}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="font-medium">Group Registration</div>
                  <div className="text-sm text-text-secondary">Off</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Tickets Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Tickets</CardTitle>
              <Button variant="secondary" className="gap-2">
                <Ticket className="w-4 h-4" />
                New Ticket Type
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Free Ticket */}
              <div className="flex items-center justify-between p-4 bg-elevated rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="font-medium">Standard</div>
                  <Badge variant="success">Free</Badge>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                  <Users className="w-4 h-4" />
                  <span>{stats.approved}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Registration Email */}
          <Card>
            <CardHeader>
              <CardTitle>Registration Email</CardTitle>
              <CardDescription>
                Upon registration, we send guests a confirmation email that includes a calendar invite.
                You can add a custom message to the email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" className="gap-2">
                <Mail className="w-4 h-4" />
                Customize Email
              </Button>
            </CardContent>
          </Card>

          {/* Registration Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Registration Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-elevated">
                <div>
                  <div className="font-medium">Require Approval</div>
                  <div className="text-sm text-text-secondary">Manually approve each registration</div>
                </div>
                <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-elevated">
                <div>
                  <div className="font-medium">Enable Waitlist</div>
                  <div className="text-sm text-text-secondary">Allow signups when event is full</div>
                </div>
                <Switch checked={waitlistEnabled} onCheckedChange={setWaitlistEnabled} />
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">Capacity</div>
                  <div className="text-sm text-text-secondary">Maximum number of attendees</div>
                </div>
                <span className="text-text-secondary">{capacity}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Blasts */}
        {activeKey === "blasts" && (
        <div className="space-y-6">
          {/* Send Blast Input */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-background" />
              </div>
              <Input
                className="flex-1"
                placeholder="Send a blast to your guests..."
                value={blastMessage}
                onChange={(e) => setBlastMessage(e.target.value)}
              />
            </div>
          </Card>

          {/* Send Blasts Feature */}
          <Card className="border-2 border-dashed border-elevated">
            <CardContent className="py-12 text-center">
              <div className="flex justify-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-400" />
                </div>
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-green-400" />
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Bell className="w-6 h-6 text-purple-400" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">Send Blasts</h3>
              <p className="text-text-secondary max-w-sm mx-auto">
                Share updates with your guests via email, SMS, and push notifications.
              </p>
            </CardContent>
          </Card>

          {/* System Messages */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">System Messages</h3>

            <Card>
              <CardContent className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-text-secondary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Event Reminders</h4>
                  <p className="text-sm text-text-secondary mb-3">
                    Reminders are sent automatically via email, SMS, and push notification.
                  </p>
                  <Button variant="secondary" size="default">Manage Reminders</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-text-secondary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Post-Event Feedback</h4>
                  <p className="text-sm text-text-secondary mb-3">
                    Schedule a feedback email to guests after the event ends.
                  </p>
                  <Button variant="secondary" size="default">Configure Feedback</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )}

        {/* Insights */}
        {activeKey === "insights" && (
        <div className="space-y-6">
          {/* Page Views */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Page Views</CardTitle>
                <CardDescription>See recent page views of the event page.</CardDescription>
              </div>
              <Button variant="secondary" size="default">Past 7 Days</Button>
            </CardHeader>
            <CardContent>
              {/* Empty state - analytics data will come from API */}
              <div className="py-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-elevated rounded-full flex items-center justify-center">
                  <Eye className="w-8 h-8 text-text-tertiary" />
                </div>
                <h4 className="font-medium text-text-secondary mb-1">No Page Views Yet</h4>
                <p className="text-sm text-text-tertiary">
                  Share your event to start tracking page views.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Sources */}
          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-text-secondary">Start sharing your link and you&apos;ll see traffic here.</p>
            </CardContent>
          </Card>

          {/* Cities */}
          <Card>
            <CardHeader>
              <CardTitle>Cities</CardTitle>
            </CardHeader>
            <CardContent>
              {event.location.addressLocality ? (
                <div className="flex items-center justify-between">
                  <span>{event.location.addressLocality}, {event.location.addressCountry}</span>
                  <span className="font-medium">100%</span>
                </div>
              ) : (
                <p className="text-text-secondary">No location data yet.</p>
              )}
            </CardContent>
          </Card>

          {/* UTM Sources */}
          <Card>
            <CardHeader>
              <CardTitle>UTM Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-text-secondary text-sm">
                Set up a tracking link by adding <code className="bg-elevated px-1 py-0.5 rounded">?utm_source=your-link-name</code> to your URL.
              </p>
            </CardContent>
          </Card>

          {/* Registration Referrals */}
          <Card>
            <CardHeader>
              <CardTitle>Registration Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-text-secondary">Track where your registrations are coming from.</p>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Settings */}
        {activeKey === "settings" && (
        <div className="space-y-6">
          {/* Clone Event */}
          <Card>
            <CardHeader>
              <CardTitle>Clone Event</CardTitle>
              <CardDescription>
                Create a new event with the same information as this one.
                Everything except the guest list and event blasts will be copied over.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" className="gap-2">
                <Copy className="w-4 h-4" />
                Clone Event
              </Button>
            </CardContent>
          </Card>

          {/* Event Page / Custom URL */}
          <Card>
            <CardHeader>
              <CardTitle>Event Page</CardTitle>
              <CardDescription>
                When you choose a new URL, the current one will no longer work.
                Do not change your URL if you have already shared the event.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">Public URL</label>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-2.5 bg-surface rounded-lg text-text-secondary text-sm">
                    nhimbe.com/e/
                  </div>
                  <Input
                    defaultValue={event.shortCode}
                    className="flex-1"
                    placeholder="your-custom-url"
                  />
                  <Button variant="secondary">Update</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Embed Event */}
          <Card>
            <CardHeader>
              <CardTitle>Embed Event</CardTitle>
              <CardDescription>
                Have your own site? Embed the event to let visitors know about it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Embed Options */}
              <div className="space-y-2">
                <button className="w-full flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary text-left">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <div className="font-medium">Embed as Button</div>
                  </div>
                  <Check className="w-5 h-5 text-primary" />
                </button>
                <button className="w-full flex items-center gap-3 p-4 rounded-xl bg-elevated hover:bg-surface text-left transition-colors">
                  <ExternalLink className="w-5 h-5 text-text-secondary" />
                  <div className="flex-1">
                    <div className="font-medium">Embed Event Page</div>
                  </div>
                </button>
              </div>

              {/* Code Snippet */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Paste the following HTML code snippet to your page:
                </label>
                <div className="bg-[#1a1a2e] rounded-xl p-4 font-mono text-sm overflow-x-auto">
                  <div className="text-blue-400">
                    &lt;<span className="text-pink-400">a</span>
                  </div>
                  <div className="pl-4 text-green-400">
                    href=&quot;{typeof window !== "undefined" ? window.location.origin : ""}/events/{event.id}&quot;
                  </div>
                  <div className="pl-4 text-green-400">
                    class=&quot;nhimbe-checkout-button&quot;
                  </div>
                  <div className="pl-4 text-green-400">
                    data-nhimbe-action=&quot;checkout&quot;
                  </div>
                  <div className="pl-4 text-green-400">
                    data-nhimbe-event-id=&quot;{event.id}&quot;
                  </div>
                  <div className="text-blue-400">&gt;</div>
                  <div className="pl-4 text-white">Register for Event</div>
                  <div className="text-blue-400">
                    &lt;/<span className="text-pink-400">a</span>&gt;
                  </div>
                  <div className="mt-2 text-blue-400">
                    &lt;<span className="text-pink-400">script</span>{" "}
                    <span className="text-green-400">id</span>=&quot;nhimbe-checkout&quot;{" "}
                    <span className="text-green-400">src</span>=&quot;{typeof window !== "undefined" ? window.location.origin : ""}/embed.js&quot;&gt;
                  </div>
                  <div className="text-blue-400">
                    &lt;/<span className="text-pink-400">script</span>&gt;
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  This gives you the following button. Click it to see it in action!
                </label>
                <div className="p-8 bg-elevated rounded-xl border-2 border-dashed border-surface flex items-center justify-center">
                  <button className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-100 transition-colors">
                    Register for Event
                  </button>
                </div>
              </div>

              <p className="text-sm text-text-secondary">
                If you want to use your own styling for the button, simply remove the{" "}
                <code className="bg-elevated px-1 py-0.5 rounded">nhimbe-checkout-button</code>{" "}
                class from the snippet above.
              </p>
            </CardContent>
          </Card>

          {/* Registration Referrals */}
          <Card>
            <CardHeader>
              <CardTitle>Registration Referrals</CardTitle>
              <CardDescription>
                Each guest has a unique referral link to invite friends.
                <Link href="#" className="text-primary ml-1 hover:underline">Learn More</Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-elevated rounded-full flex items-center justify-center">
                  <Share2 className="w-8 h-8 text-text-tertiary" />
                </div>
                <h4 className="font-medium text-text-secondary mb-1">No Referrals</h4>
                <p className="text-sm text-text-tertiary">
                  Referrals will start showing up here once guests start inviting their friends.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Event Feedback */}
          <Card>
            <CardHeader>
              <CardTitle>Event Feedback</CardTitle>
              <CardDescription>
                See how much your guests enjoyed the event.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-elevated rounded-full flex items-center justify-center">
                  <Mail className="w-8 h-8 text-text-tertiary" />
                </div>
                <h4 className="font-medium text-text-secondary mb-1">No Post-Event Email Scheduled</h4>
                <p className="text-sm text-text-tertiary mb-4">
                  To collect feedback, schedule a post-event thank you email. We will take care of the rest!
                </p>
                <Button variant="secondary" className="gap-2">
                  <Clock className="w-4 h-4" />
                  Schedule Feedback Email
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Event Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Event Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link
                href={`/events/${event.id}/edit`}
                className="flex items-center gap-3 p-4 rounded-xl bg-elevated hover:bg-surface transition-colors"
              >
                <Pencil className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">Edit Event</div>
                  <div className="text-sm text-text-secondary">Update event details</div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-tertiary" />
              </Link>

              <button
                onClick={handleShare}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-elevated hover:bg-surface transition-colors text-left"
              >
                <Share2 className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">Share Event</div>
                  <div className="text-sm text-text-secondary">Get your event link</div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-tertiary" />
              </button>

              <button
                onClick={handleCopyLink}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-elevated hover:bg-surface transition-colors text-left"
              >
                <Copy className={`w-5 h-5 ${copySuccess ? "text-green-500" : "text-primary"}`} />
                <div className="flex-1">
                  <div className="font-medium">{copySuccess ? "Link Copied!" : "Copy Link"}</div>
                  <div className="text-sm text-text-secondary">Copy event URL to clipboard</div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-tertiary" />
              </button>

              <button
                onClick={handleEmailGuests}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-elevated hover:bg-surface transition-colors text-left"
              >
                <Mail className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">Email Guests</div>
                  <div className="text-sm text-text-secondary">Send email to all approved guests</div>
                </div>
                <ChevronRight className="w-5 h-5 text-text-tertiary" />
              </button>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border border-red-500/30">
            <CardHeader>
              <CardTitle className="text-red-400">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-elevated hover:bg-red-500/10 text-left transition-colors"
              >
                <X className="w-5 h-5 text-red-400" />
                <div>
                  <div className="font-medium">Cancel Event</div>
                  <div className="text-sm text-text-secondary">
                    Notify all registered attendees
                  </div>
                </div>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-elevated hover:bg-red-500/10 text-left transition-colors"
              >
                <Trash2 className="w-5 h-5 text-red-400" />
                <div>
                  <div className="font-medium text-red-400">Delete Event</div>
                  <div className="text-sm text-text-secondary">
                    Permanently remove this event
                  </div>
                </div>
              </button>
            </CardContent>
          </Card>
        </div>
        )}

      {/* Per-guest action sheet — branded bottom-sheet action list */}
      <NyuchiActionSheet
        open={!!sheetGuest}
        onClose={() => setSheetGuest(null)}
        title={sheetGuest?.name}
        actions={
          sheetGuest
            ? [
                ...(sheetGuest.status === "pending"
                  ? [
                      {
                        id: "approve",
                        label: "Approve",
                        icon: "✓",
                        onSelect: () => handleApprove(sheetGuest.id),
                      },
                      {
                        id: "reject",
                        label: "Reject",
                        icon: "✕",
                        destructive: true,
                        onSelect: () => handleReject(sheetGuest.id),
                      },
                    ]
                  : []),
                ...(sheetGuest.status !== "pending" && !sheetGuest.checkedIn
                  ? [
                      {
                        id: "checkin",
                        label: "Check in",
                        icon: "✓",
                        onSelect: () => handleCheckIn(sheetGuest.id),
                      },
                    ]
                  : []),
                {
                  id: "copy-email",
                  label: "Copy email",
                  icon: "✉️",
                  onSelect: () => {
                    void navigator.clipboard?.writeText(sheetGuest.email);
                  },
                },
              ]
            : []
        }
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <div className="bg-elevated rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-2">Delete Event?</h3>
            <p className="text-text-secondary mb-6">
              This will permanently delete &quot;{event.name}&quot; and all associated data.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-surface hover:bg-foreground/10 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEvent}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <div className="bg-elevated rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-2">Cancel Event?</h3>
            <p className="text-text-secondary mb-6">
              This will cancel &quot;{event.name}&quot; and notify all registered attendees.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-surface hover:bg-foreground/10 font-medium transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleDeleteEvent}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "Cancelling..." : "Cancel Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </EventManageShell>
  );
}

// Wrap with AuthGuard to require authentication
export default function ManageEventPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        }
      >
        <ManageEventContent />
      </Suspense>
    </AuthGuard>
  );
}
