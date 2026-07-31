"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, MapPin, Video, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { NyuchiMetaTile } from "@/components/ui/nyuchi-meta-tile";
import { EventThemeWrapper } from "../event-theme-wrapper";
import { CoverImageUpload } from "../../create/cover-image-upload";
import { DateTimeModal } from "@/components/modals/date-time-modal";
import { LocationModal } from "@/components/modals/location-modal";
import { CategoryModal } from "@/components/modals/category-modal";
import { DescriptionModal } from "@/components/modals/description-modal";
import { TicketingModal } from "@/components/modals/ticketing-modal";
import { CapacityModal } from "@/components/modals/capacity-modal";
import { getCategoriesAction, getCitiesAction } from "@/app/actions/discovery";
import { updateEvent } from "@/app/actions/events";
import { uploadMedia, getMediaUrl, type Category, type Event } from "@/lib/api";
import { isHttpUrl } from "@/lib/security/request";
import { useToast } from "@/hooks/use-toast";

interface EditEventFormProps {
  event: Event;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Get the browser's timezone offset as ±HH:MM (mirrors the create-event form).
function getBrowserTimezoneOffset(): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

/**
 * Edit an existing event. Deliberately NOT the create-event wizard — no
 * steps, no host-mode/calendar picks (those aren't something you "edit").
 * Laid out like the event-detail page itself (same meta-tile rows, same
 * theme wash) with each field made editable in place, tapping into the same
 * ResponsiveModal field editors the create wizard uses (Date & time,
 * Location, Category, Description, Capacity, Ticketing) since those are
 * self-contained editors, not wizard steps.
 */
export function EditEventForm({ event }: EditEventFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const errorRef = useRef<HTMLDivElement>(null);

  const initialStart = new Date(event.startDate);
  const initialEnd = event.endDate ? new Date(event.endDate) : new Date(initialStart.getTime() + 60 * 60 * 1000);
  const wasOnline = event.eventAttendanceMode === "OnlineEventAttendanceMode";

  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description);

  const [coverImage, setCoverImage] = useState<string | null>(event.image ?? null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImageRemoved, setCoverImageRemoved] = useState(false);

  const [eventDate, setEventDate] = useState(toLocalDateString(initialStart));
  const [startTime, setStartTime] = useState(toLocalTimeString(initialStart));
  const [endTime, setEndTime] = useState(toLocalTimeString(initialEnd));

  const [category, setCategory] = useState(event.category);
  const [tags, setTags] = useState<string[]>(event.keywords.filter((k) => k !== event.category));
  const [tagInput, setTagInput] = useState("");

  const [isOnline, setIsOnline] = useState(wasOnline);
  const [meetingUrl, setMeetingUrl] = useState(event.meetingUrl ?? "");
  const [meetingPlatform, setMeetingPlatform] = useState<"zoom" | "google_meet" | "teams" | "other">(
    (event.meetingPlatform as "zoom" | "google_meet" | "teams" | "other" | undefined) || "zoom",
  );
  const [venue, setVenue] = useState(wasOnline ? "" : event.location.name);
  const [address, setAddress] = useState(wasOnline ? "" : (event.location.streetAddress ?? ""));
  const [addressSearch, setAddressSearch] = useState("");
  const [selectedCity, setSelectedCity] = useState<{ addressLocality: string; addressCountry: string } | null>(
    !wasOnline && event.location.addressLocality
      ? { addressLocality: event.location.addressLocality, addressCountry: event.location.addressCountry }
      : null,
  );

  const [capacity, setCapacity] = useState<number | null>(event.maximumAttendeeCapacity ?? null);
  const [isFree, setIsFree] = useState(!event.offers?.url);
  const [ticketUrl, setTicketUrl] = useState(event.offers?.url ?? "");

  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<{ addressLocality: string; addressCountry: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCategoriesAction().then((c) => !cancelled && c.length > 0 && setCategories(c));
    getCitiesAction().then((c) => !cancelled && c.length > 0 && setCities(c));
    return () => {
      cancelled = true;
    };
  }, []);

  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [showTicketingModal, setShowTicketingModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };
  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB");
      return;
    }
    setCoverImageFile(file);
    setCoverImageRemoved(false);
    const reader = new FileReader();
    reader.onload = (ev) => setCoverImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeCoverImage = () => {
    setCoverImage(null);
    setCoverImageFile(null);
    setCoverImageRemoved(true);
  };

  const categoryLabel = categories.find((c) => c.id === category)?.name || category || "Choose a category";

  const validate = (): string | null => {
    if (!name.trim()) return "Event name is required";
    if (!eventDate) return "Please select a date and time";
    if (endTime <= startTime) return "End time must be after start time";
    if (!isOnline && (!venue.trim() || !selectedCity)) return "Please add a location or mark as online event";
    if (isOnline && !meetingUrl.trim()) return "Please add a meeting URL for your online event";
    if (isOnline && meetingUrl.trim() && !isHttpUrl(meetingUrl.trim())) return "Please enter a valid meeting URL";
    if (capacity !== null && capacity < 1) return "Capacity must be at least 1 attendee";
    if (!isFree && ticketUrl.trim() && !isHttpUrl(ticketUrl.trim())) return "Please enter a valid ticket URL";
    return null;
  };

  const handleSave = async () => {
    const v = validate();
    if (v) {
      setError(v);
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let uploadedImage: string | null | undefined;
      if (coverImageFile) {
        const uploadResult = await uploadMedia(coverImageFile);
        uploadedImage = getMediaUrl(uploadResult.key);
      } else if (coverImageRemoved) {
        uploadedImage = null;
      }

      const tzOffset = getBrowserTimezoneOffset();
      const isoStart = new Date(`${eventDate}T${startTime}:00${tzOffset}`).toISOString();
      const isoEnd = new Date(`${eventDate}T${endTime}:00${tzOffset}`).toISOString();

      await updateEvent(event.id, {
        name: name.trim(),
        description: description.trim(),
        startDate: isoStart,
        endDate: isoEnd,
        category: category || null,
        keywords: tags,
        ...(uploadedImage !== undefined ? { image: uploadedImage } : {}),
        maximumAttendeeCapacity: capacity,
        isFree,
        ticketUrl: !isFree && ticketUrl.trim() ? ticketUrl.trim() : null,
        isOnline,
        venue: venue.trim(),
        streetAddress: address.trim(),
        addressLocality: selectedCity?.addressLocality,
        addressCountry: selectedCity?.addressCountry,
        meetingUrl: isOnline ? meetingUrl.trim() : null,
        meetingPlatform: isOnline ? meetingPlatform : null,
      });

      toast.success("Event updated");
      router.push(`/events/${event.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update event");
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EventThemeWrapper coverGradient={event.coverGradient} themeId={event.themeId}>
      <div className="max-w-250 mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/events/${event.id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground/60 hover:text-foreground h-10 px-3 -ml-3 rounded-xl hover:bg-surface transition-colors"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
            Cancel
          </Link>
          <Button onClick={handleSave} disabled={submitting} className="rounded-full">
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>

        {error && (
          <div
            ref={errorRef}
            className="mb-6 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
          >
            <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <CoverImageUpload
          coverImage={coverImage}
          gradient={event.coverGradient || "var(--event-primary)"}
          onImageUpload={handleImageUpload}
          onRemoveImage={removeCoverImage}
        />

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event name"
          className="!text-2xl sm:!text-3xl font-serif font-bold h-auto py-3 px-4 mb-4 rounded-2xl border-0"
          style={{ backgroundColor: "var(--event-surface)" }}
        />

        <button
          type="button"
          onClick={() => setShowCategoryModal(true)}
          className="inline-flex items-center gap-1.5 mb-5 sm:mb-6 rounded-full px-3 py-1.5 text-xs font-medium"
          style={{ backgroundColor: "var(--event-surface)", color: "var(--event-primary)" }}
        >
          {categoryLabel}
          <Pencil className="w-3 h-3" aria-hidden />
        </button>

        <button type="button" onClick={() => setShowDateModal(true)} className="block w-full text-left mb-4">
          <NyuchiMetaTile
            date={{
              month: new Date(`${eventDate}T00:00:00`).toLocaleDateString("en-GB", { month: "short" }),
              day: new Date(`${eventDate}T00:00:00`).getDate(),
            }}
            primary={new Date(`${eventDate}T00:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            secondary={`${startTime} – ${endTime}`}
            trailing={<Pencil className="w-4 h-4 text-muted-foreground" aria-hidden />}
          />
        </button>

        <button type="button" onClick={() => setShowLocationModal(true)} className="block w-full text-left mb-6 sm:mb-8">
          <NyuchiMetaTile
            icon={isOnline ? Video : MapPin}
            primary={isOnline ? "Online event" : venue || "Add a venue"}
            secondary={
              isOnline
                ? meetingUrl || "Add a meeting link"
                : selectedCity
                  ? `${selectedCity.addressLocality}, ${selectedCity.addressCountry}`
                  : "Add a city"
            }
            trailing={<Pencil className="w-4 h-4 text-muted-foreground" aria-hidden />}
          />
        </button>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold">About This Event</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowDescriptionModal(true)}>
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              Edit
            </Button>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Tell people what to expect…"
            className="text-[15px] leading-relaxed"
          />
        </div>

        <Card className="border-0 mb-8" style={{ backgroundColor: "var(--event-surface)" }}>
          <CardContent className="p-0 divide-y divide-elevated">
            <button
              type="button"
              onClick={() => setShowCapacityModal(true)}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-elevated/50 transition-colors text-left"
            >
              <span className="flex-1 font-medium">Capacity</span>
              <span className="text-muted-foreground text-sm">{capacity || "Unlimited"}</span>
              <Pencil className="w-4 h-4 text-muted-foreground" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setShowTicketingModal(true)}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-elevated/50 transition-colors text-left"
            >
              <span className="flex-1 font-medium">Ticketing</span>
              <span className="text-muted-foreground text-sm">{isFree ? "Free" : "Paid (external)"}</span>
              <Pencil className="w-4 h-4 text-muted-foreground" aria-hidden />
            </button>
          </CardContent>
        </Card>
      </div>

      <DateTimeModal
        isOpen={showDateModal}
        onClose={() => setShowDateModal(false)}
        eventDate={eventDate}
        setEventDate={setEventDate}
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
      />
      <LocationModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        isOnline={isOnline}
        setIsOnline={setIsOnline}
        meetingPlatform={meetingPlatform}
        setMeetingPlatform={setMeetingPlatform}
        meetingUrl={meetingUrl}
        setMeetingUrl={setMeetingUrl}
        addressSearch={addressSearch}
        setAddressSearch={setAddressSearch}
        venue={venue}
        setVenue={setVenue}
        address={address}
        setAddress={setAddress}
        selectedCity={selectedCity}
        setSelectedCity={setSelectedCity}
        cities={cities}
      />
      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        categories={categories}
        category={category}
        setCategory={setCategory}
        tags={tags}
        tagInput={tagInput}
        setTagInput={setTagInput}
        addTag={addTag}
        removeTag={removeTag}
      />
      <DescriptionModal
        isOpen={showDescriptionModal}
        onClose={() => setShowDescriptionModal(false)}
        description={description}
        setDescription={setDescription}
        eventName={name}
        category={category}
        isOnline={isOnline}
      />
      <CapacityModal
        isOpen={showCapacityModal}
        onClose={() => setShowCapacityModal(false)}
        capacity={capacity}
        setCapacity={setCapacity}
      />
      <TicketingModal
        isOpen={showTicketingModal}
        onClose={() => setShowTicketingModal(false)}
        isFree={isFree}
        setIsFree={setIsFree}
        ticketUrl={ticketUrl}
        setTicketUrl={setTicketUrl}
      />
    </EventThemeWrapper>
  );
}
