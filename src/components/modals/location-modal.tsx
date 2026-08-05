"use client";

import { Globe, Clock } from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { resolveCountryTimezone, ensurePlaceFromOsmSuggestion } from "@/app/actions/geocode";
import { timezoneLabel } from "@/lib/timezone";

function isValidMeetingUrl(value: string): boolean {
  try {
    new URL(value.trim());
    return true;
  } catch {
    return false;
  }
}

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  setIsOnline: (value: boolean) => void;
  meetingPlatform: "zoom" | "google_meet" | "teams" | "other";
  setMeetingPlatform: (value: "zoom" | "google_meet" | "teams" | "other") => void;
  meetingUrl: string;
  setMeetingUrl: (value: string) => void;
  addressSearch: string;
  setAddressSearch: (value: string) => void;
  venue: string;
  setVenue: (value: string) => void;
  address: string;
  setAddress: (value: string) => void;
  selectedCity: { addressLocality: string; addressCountry: string } | null;
  setSelectedCity: (value: { addressLocality: string; addressCountry: string } | null) => void;
  cities: { addressLocality: string; addressCountry: string }[];
  /** IANA timezone the venue resolves to — drives what "3pm" means on submit. */
  selectedTimezone: string | null;
  setSelectedTimezone: (value: string | null) => void;
  /** The resolved `places.places._id` behind the venue, when there is one. */
  placeId: string | null;
  setPlaceId: (value: string | null) => void;
}

export function LocationModal({
  isOpen,
  onClose,
  isOnline,
  setIsOnline,
  meetingPlatform,
  setMeetingPlatform,
  meetingUrl,
  setMeetingUrl,
  addressSearch,
  setAddressSearch,
  venue,
  setVenue,
  address,
  setAddress,
  selectedCity,
  setSelectedCity,
  cities,
  selectedTimezone,
  setSelectedTimezone,
  placeId,
  setPlaceId,
}: LocationModalProps) {
  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} title="Event Location">
      <div className="space-y-4">
        <label
          htmlFor="online-event-toggle"
          className="flex items-center gap-3 p-3 bg-surface text-foreground placeholder:text-text-tertiary rounded-xl cursor-pointer select-none"
        >
          <Globe className="w-5 h-5 text-text-secondary" />
          <span className="flex-1">Online Event</span>
          <Switch
            id="online-event-toggle"
            checked={isOnline}
            onCheckedChange={setIsOnline}
          />
        </label>
        {isOnline && (
          <>
            {/* Meeting Platform */}
            <div>
              <Label className="block text-sm text-text-secondary mb-2">Meeting Platform</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "zoom", label: "Zoom" },
                  { value: "google_meet", label: "Google Meet" },
                  { value: "teams", label: "Microsoft Teams" },
                  { value: "other", label: "Other" },
                ].map((platform) => (
                  <Button
                    key={platform.value}
                    variant="ghost"
                    onClick={() => setMeetingPlatform(platform.value as typeof meetingPlatform)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      meetingPlatform === platform.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-foreground hover:bg-elevated"
                    }`}
                  >
                    {platform.label}
                  </Button>
                ))}
              </div>
            </div>
            {/* Meeting URL */}
            <div>
              <Label className="block text-sm text-text-secondary mb-2">Meeting URL</Label>
              <Input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder={
                  meetingPlatform === "zoom"
                    ? "https://zoom.us/j/..."
                    : meetingPlatform === "google_meet"
                    ? "https://meet.google.com/..."
                    : meetingPlatform === "teams"
                    ? "https://teams.microsoft.com/..."
                    : "https://..."
                }
                className="w-full px-4 py-3 bg-surface text-foreground placeholder:text-text-tertiary rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-base"
              />
              {meetingUrl.trim() && !isValidMeetingUrl(meetingUrl) ? (
                <p className="text-xs text-red-400 mt-2">Please enter a valid URL starting with https://</p>
              ) : (
                <p className="text-xs text-text-tertiary mt-2">Attendees will see this link after registering</p>
              )}
            </div>
          </>
        )}
        {!isOnline && (
          <>
            {/* Venue / address search — DB catalogue first, then OSM Nominatim */}
            <div>
              <Label className="block text-sm text-text-secondary mb-2">Search Location</Label>
              <AddressAutocomplete
                value={addressSearch}
                onChange={setAddressSearch}
                onPlaceSelect={(components) => {
                  setVenue(components.venue);
                  setAddress(components.address);
                  if (components.city && components.country) {
                    setSelectedCity({ addressLocality: components.city, addressCountry: components.country });
                  }
                  // Every DB/OSM suggestion carries its own resolved timezone
                  // (from its actual coordinates); only fall back to a
                  // country-level lookup on the rare case that failed.
                  if (components.timezone) {
                    setSelectedTimezone(components.timezone);
                  } else if (components.country) {
                    resolveCountryTimezone(components.country).then((tz) => setSelectedTimezone(tz ?? null));
                  } else {
                    setSelectedTimezone(null);
                  }
                  if (components.source === "db") {
                    // Already a real places.places._id.
                    setPlaceId(components.placeId);
                  } else if (
                    components.osmType &&
                    components.osmId !== undefined &&
                    components.latitude !== undefined &&
                    components.longitude !== undefined
                  ) {
                    // The suggestion's placeId is a synthetic "osm:type/id"
                    // placeholder until promoted — swap it for the real
                    // places.places._id once ensurePlaceFromOsmSuggestion
                    // creates (or finds) the catalogue row.
                    setPlaceId(null);
                    ensurePlaceFromOsmSuggestion({
                      name: components.venue,
                      address: components.address,
                      city: components.city,
                      country: components.country,
                      latitude: components.latitude,
                      longitude: components.longitude,
                      osmType: components.osmType,
                      osmId: components.osmId,
                    }).then((resolvedId) => setPlaceId(resolvedId));
                  } else {
                    setPlaceId(null);
                  }
                }}
                placeholder="Search for a venue or address..."
              />
              {placeId && (
                <p className="text-xs text-text-tertiary mt-2">Matched to the places catalogue</p>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-elevated" />
              <span className="text-xs text-text-tertiary">or enter manually</span>
              <div className="flex-1 h-px bg-elevated" />
            </div>

            <div>
              <Label className="block text-sm text-text-secondary mb-2">Venue Name</Label>
              <Input
                type="text"
                inputMode="text"
                autoComplete="organization"
                value={venue}
                onChange={(e) => { setVenue(e.target.value); setPlaceId(null); }}
                placeholder="e.g., Rainbow Towers Hotel"
                className="w-full px-4 py-3 bg-surface text-foreground placeholder:text-text-tertiary rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-base"
              />
            </div>
            <div>
              <Label className="block text-sm text-text-secondary mb-2">Address</Label>
              <Input
                type="text"
                inputMode="text"
                autoComplete="street-address"
                value={address}
                onChange={(e) => { setAddress(e.target.value); setPlaceId(null); }}
                placeholder="Street address"
                className="w-full px-4 py-3 bg-surface text-foreground placeholder:text-text-tertiary rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-base"
              />
            </div>
            <div>
              <Label className="block text-sm text-text-secondary mb-2">City</Label>
              <div className="grid grid-cols-2 gap-2">
                {cities.map((c) => (
                  <Button
                    key={`${c.addressLocality}-${c.addressCountry}`}
                    variant="ghost"
                    onClick={() => {
                      setSelectedCity(c);
                      setSelectedTimezone(null);
                      resolveCountryTimezone(c.addressCountry).then((tz) => setSelectedTimezone(tz ?? null));
                    }}
                    className={`px-4 py-3 rounded-xl text-left justify-start h-auto ${
                      selectedCity?.addressLocality === c.addressLocality
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface hover:bg-elevated"
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <div className="font-medium">{c.addressLocality}</div>
                      <div className="text-sm opacity-70">{c.addressCountry}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
            {selectedTimezone && (
              <p className="flex items-center gap-2 text-xs text-text-tertiary">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Times will be set in {timezoneLabel(selectedTimezone)}
              </p>
            )}
          </>
        )}
        <div className="pt-2">
          <Button
            onClick={onClose}
            className="w-full h-[var(--touch-target)] bg-primary text-primary-foreground rounded-xl font-semibold"
          >
            Done
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
