/**
 * nhimbe API Client
 * Handles all communication with the Cloudflare Workers backend
 */

import { SITE_URL } from "./site-url";

// Default to same-origin (Vercel route handlers) — the Cloudflare Worker is
// being retired. Set NEXT_PUBLIC_API_URL only to point at an external API.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Media is served from the shared Mukoko R2 bucket (mukoko-storage) via its
// public custom domain — NOT a per-app silo. Reads need no credentials.
// Override with NEXT_PUBLIC_ASSETS_URL (e.g. https://assets.mukoko.com) if the
// canonical assets host differs from the bucket's default domain.
const ASSETS_URL = process.env.NEXT_PUBLIC_ASSETS_URL ?? "https://assets-s001.mukoko.com";

// Types matching backend (schema.org-aligned)
export interface EventLocation {
  type?: string;
  name: string;             // venue name
  streetAddress?: string;
  addressLocality: string;  // city
  addressCountry: string;
  url?: string;
}

export interface EventDate {
  day: string;
  month: string;
  full: string;
  time: string;
}

export interface EventOrganizer {
  name: string;
  alternateName?: string;
  initials: string;
  identifier?: string;      // handle/slug
  eventCount: number;
}

export interface EventOffers {
  price?: number;
  priceCurrency?: string;
  url?: string;
  availability?: string;
}

export interface Event {
  id: string;
  shortCode: string;
  slug: string;
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  date: EventDate;
  location: EventLocation;
  category: string;
  keywords: string[];
  image?: string;
  coverGradient?: string;
  themeId?: string;
  attendeeCount: number;
  friendsCount?: number;
  maximumAttendeeCapacity?: number;
  eventAttendanceMode?: string;
  eventStatus?: string;
  isPublished?: boolean;
  meetingUrl?: string;
  meetingPlatform?: string;
  organizer: EventOrganizer;
  offers?: EventOffers;
  friends?: { name: string; gradient: string }[];
  dateCreated?: string;
  dateModified?: string;
  /**
   * UUID of the linked circle (events.events.circleId in the
   * platform DB). When present, EventDetail surfaces a "View circle" CTA.
   */
  eventCircleId?: string;
  /** FK to places.places.id — drives the design's Where tile + Weather. */
  placeId?: string;
  /** FK to events.calendars._id — which of the host's own calendars this event streams into, if any. */
  calendarId?: string;
  /** FK to business.organization.id — when set, host card renders org branch. */
  organizationId?: string;
  /** ISO-8601 duration (e.g. "PT2H30M"). */
  duration?: string;
  /** Event timezone (IANA name). */
  timezone?: string;
  /** schema.org/contributor jsonb — chips on the contributions board. */
  contributor?: unknown;
  /** Free-form per-event metadata jsonb. Outdoor events store
   *  {elevation_m, distance_km, route_summary, profile?}. */
  about?: unknown;
}

export interface EventsResponse {
  events: Event[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

// Category with id, name, and group (matching Mukoko's 32 interest categories)
export interface Category {
  id: string;
  name: string;
  group: string;
}

export interface CategoriesResponse {
  categories: Category[];
}

export interface CitiesResponse {
  cities: { addressLocality: string; addressCountry: string }[];
}

// API fetch wrapper. The session JWT (WorkOS access token) is always passed
// explicitly by callers — the AuthKit provider owns it and there's no
// browser-cookie path to retrieve it from here.
//
// Errors carry the worker's own `error` body when available — every route
// returns `{ error: string }` on failure, and callers (UI) want that string
// in toasts rather than the generic status text. The thrown Error also has
// a `.status` numeric property so callers can branch on 401 / 403 / 409.
//
// 20s timeout: long enough for the AI-assisted endpoints (description
// generator, search RAG) and short enough that a hung connection doesn't
// strand a button in the loading state indefinitely.
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  sessionJwt?: string,
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (sessionJwt) {
    headers["Authorization"] = `Bearer ${sessionJwt}`;
  }

  // Compose with any caller-supplied signal so callers can still cancel.
  const timeoutSignal = AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, `Request timed out after ${DEFAULT_FETCH_TIMEOUT_MS}ms`);
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request cancelled");
    }
    throw err; // network failure surfaces as TypeError — keep that shape
  }

  if (!response.ok) {
    // Pull the error message out of the response body. Every worker error
    // shape is `{ error: string, ...extras }`, but a 5xx from edge / a CORS
    // failure might return plain text, so fall back to the status line.
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.clone().json() as { error?: string };
      if (body && typeof body.error === "string" && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      // Not JSON; leave the status-line message in place.
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

// Events API
export async function getEvents(params?: {
  city?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<EventsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set("city", params.city);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const query = searchParams.toString();
  return apiFetch<EventsResponse>(`/api/events${query ? `?${query}` : ""}`);
}

export async function getEventById(id: string): Promise<{ event: Event } | null> {
  try {
    return await apiFetch<{ event: Event }>(`/api/events/${id}`);
  } catch {
    return null;
  }
}

export async function getEventByShortCode(shortCode: string): Promise<{ event: Event } | null> {
  try {
    return await apiFetch<{ event: Event }>(`/api/events/${shortCode}`);
  } catch {
    return null;
  }
}

// Categories API
export async function getCategories(): Promise<Category[]> {
  const response = await apiFetch<CategoriesResponse>("/api/categories");
  return response.categories;
}

// Cities API
export async function getCities(): Promise<{ addressLocality: string; addressCountry: string }[]> {
  const response = await apiFetch<CitiesResponse>("/api/cities");
  return response.cities;
}

// Helper to get event by ID, slug, or shortCode (tries all three)
export async function findEvent(identifier: string): Promise<Event | null> {
  const result = await getEventById(identifier);
  return result?.event || null;
}

// Create event input type
export interface CreateEventInput {
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  date: EventDate;
  location: EventLocation;
  category: string;
  keywords: string[];
  image?: string;
  coverGradient?: string;
  maximumAttendeeCapacity?: number;
  eventAttendanceMode?: string;
  eventStatus?: string;
  meetingUrl?: string;
  meetingPlatform?: string;
  organizer: EventOrganizer;
  offers?: EventOffers;
}

// Create a new event. The WorkOS access token is required — every write
// endpoint on the worker derives the actor identity from the JWT now, and
// `sessionJwt` is the only path to provide it.
export async function createEvent(event: CreateEventInput, sessionJwt: string): Promise<{ event: Event; message: string }> {
  return apiFetch<{ event: Event; message: string }>("/api/events", {
    method: "POST",
    body: JSON.stringify(event),
  }, sessionJwt);
}

// Update an event. Caller must be the event organizer (worker enforces).
export async function updateEvent(id: string, updates: Partial<CreateEventInput>, sessionJwt: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  }, sessionJwt);
}

// Delete an event. Caller must be the event organizer (worker enforces).
export async function deleteEvent(id: string, sessionJwt: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/events/${id}`, {
    method: "DELETE",
  }, sessionJwt);
}

// ============================================
// Registrations API
// ============================================

export interface Registration {
  id: string;
  eventId: string;
  userId: string;
  status: "pending" | "registered" | "approved" | "rejected" | "cancelled" | "attended";
  ticketType?: string;
  ticketPrice?: number;
  ticketCurrency?: string;
  registeredAt: string;
  cancelledAt?: string;
  checkedInAt?: string;
  // Joined user data (when available)
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}

export interface RegistrationsResponse {
  registrations: Registration[];
}

// Get registrations for an event
export async function getEventRegistrations(eventId: string): Promise<Registration[]> {
  const response = await apiFetch<RegistrationsResponse>(`/api/registrations?eventId=${eventId}`);
  return response.registrations;
}

// Get registrations for a user
export async function getUserRegistrations(userId: string): Promise<Registration[]> {
  const response = await apiFetch<RegistrationsResponse>(`/api/registrations?userId=${userId}`);
  return response.registrations;
}

// Register for an event (RSVP). The worker derives the registrant identity
// from the JWT; `userId` in the body is accepted for back-compat but ignored
// server-side.
export async function registerForEvent(data: {
  eventId: string;
  userId?: string;
  ticketType?: string;
  ticketPrice?: number;
  ticketCurrency?: string;
}, sessionJwt: string): Promise<{ id: string; message: string }> {
  return apiFetch<{ id: string; message: string }>("/api/registrations", {
    method: "POST",
    body: JSON.stringify(data),
  }, sessionJwt);
}

// Update registration status (approve/reject). Host-only — worker checks
// the JWT against the event organizer.
export async function updateRegistrationStatus(
  registrationId: string,
  status: "approved" | "rejected" | "pending" | "registered",
  sessionJwt: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/registrations/${registrationId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  }, sessionJwt);
}

// Cancel a registration. Caller must be the registrant or event organizer.
export async function cancelRegistration(registrationId: string, sessionJwt: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/registrations/${registrationId}`, {
    method: "DELETE",
  }, sessionJwt);
}

// ============================================
// Users API
// ============================================

export interface User {
  _id: string;
  email: string;
  name: string;
  alternateName?: string;
  image?: string;
  description?: string;
  addressLocality?: string;
  addressCountry?: string;
  interests?: string[];
  eventsAttended: number;
  eventsHosted: number;
  dateCreated: string;
}

// Get user by ID or handle
export async function getUser(idOrHandle: string): Promise<User | null> {
  try {
    const response = await apiFetch<{ user: User }>(`/api/users/${idOrHandle}`);
    return response.user;
  } catch {
    return null;
  }
}

// Create a new user
export async function createUser(data: {
  email: string;
  name: string;
  alternateName?: string;
  addressLocality?: string;
  addressCountry?: string;
  interests?: string[];
}): Promise<{ id: string; message: string }> {
  return apiFetch<{ id: string; message: string }>("/api/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Profile updates moved to the `updateMyProfile` server action
// (src/app/actions/profile.ts) — MongoDB identity.persons, no Supabase.

// ============================================
// Event Views Tracking
// ============================================

export async function trackEventView(eventId: string, userId?: string): Promise<void> {
  try {
    await apiFetch("/api/events/" + eventId + "/view", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  } catch {
    // Silently fail - analytics shouldn't break the UI
  }
}

// ============================================
// Media Upload (R2)
// ============================================

export interface UploadMediaResponse {
  key: string;
  url: string;
  message: string;
}

/**
 * Upload an image to R2 storage
 * @param file - The file to upload (must be an image)
 * @returns The storage key and URL of the uploaded file
 */
export async function uploadMedia(file: File): Promise<UploadMediaResponse> {
  const url = `${API_URL}/api/media/upload`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error.error || `Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the full URL for a media file
 * @param key - The storage key returned from uploadMedia
 * @param options - Optional image transformation options
 */
export function getMediaUrl(key: string, options?: { width?: number; height?: number; format?: "webp" | "avif" | "jpeg" | "png" }): string {
  // Already-absolute URLs (or data URIs) pass through unchanged.
  if (/^(https?:|data:)/i.test(key)) return key;

  // Serve from the shared R2 assets bucket's public domain (no worker hop).
  let url = `${ASSETS_URL.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;

  // Transform hints (width/height/format) are honoured by a Cloudflare Images
  // layer if one fronts the assets domain; harmless query params otherwise.
  if (options) {
    const params = new URLSearchParams();
    if (options.width) params.set("w", options.width.toString());
    if (options.height) params.set("h", options.height.toString());
    if (options.format) params.set("format", options.format);
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
  }

  return url;
}

// ============================================
// AI Description Generator
// ============================================

export interface DescriptionWizardStep {
  question: string;
  placeholder: string;
  helpText?: string;
}

export interface DescriptionContext {
  eventType?: string;
  targetAudience?: string;
  keyTakeaways?: string;
  highlights?: string;
  eventName?: string;
  category?: string;
  isOnline?: boolean;
}

export interface GeneratedDescription {
  description: string;
  suggestions?: string[];
}

// AI description generation moved to the `src/app/actions/ai.ts` server action
// (Qwen via the Shamwari Cloudflare AI Gateway) — the worker AI routes are
// retired. The DescriptionContext / GeneratedDescription / DescriptionWizardStep
// types stay here as the shared shapes consumed by the wizard and the action.

// ============================================
// Open Data APIs - Reviews, Referrals, Stats
// ============================================

// Event Review Types
export interface EventReview {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userInitials: string;
  rating: number;
  reviewBody?: string;
  helpfulCount: number;
  isVerifiedAttendee: boolean;
  dateCreated: string;
}

export interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface EventReviewsResponse {
  reviews: EventReview[];
  stats: ReviewStats;
}

/** A review surfaced on a host's reputation, across any of the host's events. */
export interface HostReview extends EventReview {
  /** Title of the event this review was written about, when resolvable. */
  eventTitle?: string;
}

export interface HostReviewsResponse {
  reviews: HostReview[];
}

// Get reviews for an event (PUBLIC)
export async function getEventReviews(eventId: string): Promise<EventReviewsResponse> {
  return apiFetch<EventReviewsResponse>(`/api/events/${eventId}/reviews`);
}

// Submit a review for an event. Author identity is derived from the JWT
// server-side; `userId` in the body is ignored.
export async function submitEventReview(
  eventId: string,
  data: { userId?: string; rating: number; reviewBody?: string },
  sessionJwt: string,
): Promise<{ id: string; message: string }> {
  return apiFetch<{ id: string; message: string }>(`/api/events/${eventId}/reviews`, {
    method: "POST",
    body: JSON.stringify(data),
  }, sessionJwt);
}

// Mark a review as helpful. Voter identity is derived from the JWT.
export async function markReviewHelpful(
  reviewId: string,
  sessionJwt: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/reviews/${reviewId}/helpful`, {
    method: "POST",
    body: JSON.stringify({}),
  }, sessionJwt);
}

// Event Stats Types
export interface EventStats {
  eventId: string;
  views: number;
  uniqueViews: number;
  rsvps: number;
  checkins: number;
  referrals: number;
  trend?: number;
  isHot?: boolean;
  peakViewTime?: string;
  topSources?: Array<{ source: string; count: number }>;
  topCities?: Array<{ city: string; count: number }>;
}

// Get stats for an event (PUBLIC - Open Data)
export async function getEventStats(eventId: string): Promise<EventStats> {
  const response = await apiFetch<{ stats: EventStats }>(`/api/events/${eventId}/stats`);
  return response.stats;
}

// Tracked Links — masked URLs with click analytics
export interface TrackedLink {
  code: string;
  url: string; // relative: /r/{code}
}

// Create a tracked link that redirects through nhimbe for click analytics.
// `createdBy` is derived from the JWT server-side; passing it in the body
// has no effect.
export async function createTrackedLink(data: {
  targetUrl: string;
  eventId: string;
  linkType: "meeting_url" | "directions" | "ticket" | "website";
}, sessionJwt: string): Promise<TrackedLink> {
  return apiFetch<TrackedLink>("/api/links", {
    method: "POST",
    body: JSON.stringify(data),
  }, sessionJwt);
}

// Get the full tracked URL for a code
export function getTrackedUrl(code: string): string {
  // On the client, share from whatever domain the user is on (dual-domain);
  // on the server, fall back to the primary origin.
  const siteUrl = typeof window !== "undefined" ? window.location.origin : SITE_URL;
  return `${siteUrl}/r/${code}`;
}

// Check-in Types
export interface CheckinStats {
  eventId: string;
  total: number;
  attended: number;
  remaining: number;
  rate: number;
}

// Check in a registration at an event. Only the event organizer may call
// this — the worker enforces the JWT-derived identity against the event row.
// (Kiosk devices use a separate session-token flow via /api/kiosk.)
export async function checkinRegistration(
  eventId: string,
  registrationId: string,
  sessionJwt: string,
): Promise<{ message: string; registrationId: string }> {
  return apiFetch<{ message: string; registrationId: string }>(
    `/api/events/${eventId}/checkin`,
    { method: "POST", body: JSON.stringify({ registrationId }) },
    sessionJwt,
  );
}

// Get check-in stats for an event
export async function getCheckinStats(eventId: string): Promise<CheckinStats> {
  return apiFetch<CheckinStats>(`/api/events/${eventId}/checkin/stats`);
}

// Paired-kiosk check-in. Hits POST /api/kiosk/checkin which validates the
// kiosk session token via X-Kiosk-Token header (NOT the WorkOS Bearer slot)
// and resolves the bound event server-side. The eventId arg is passed for
// client-side sanity-checking only; the worker uses the token's bound event.
export async function checkinViaKiosk(
  eventId: string,
  registrationId: string,
  kioskToken: string,
): Promise<{ message: string; registrationId: string; eventId: string }> {
  return apiFetch<{ message: string; registrationId: string; eventId: string }>(
    `/api/kiosk/checkin`,
    {
      method: "POST",
      body: JSON.stringify({ registrationId, eventId }),
      headers: { "X-Kiosk-Token": kioskToken },
    },
  );
}

// Kiosk Pairing Types
export type ScreenType = "kiosk" | "signage-host" | "signage-admin";

export interface KioskPairingStatus {
  status: "pending" | "confirmed" | "expired";
  screenType?: ScreenType;
  eventId?: string;
  eventName?: string;
  hostName?: string;
  sessionToken?: string;
}

export interface KioskSession {
  eventId: string;
  eventName: string;
  screenType: ScreenType;
  hostId: string | null;
  pairedAt: string;
}

// Request a pairing code for kiosk or signage screen
export async function requestKioskPairing(
  screenType: ScreenType = "kiosk"
): Promise<{ code: string; expiresIn: number; screenType: ScreenType }> {
  return apiFetch<{ code: string; expiresIn: number; screenType: ScreenType }>(
    "/api/kiosk/pair/request",
    { method: "POST", body: JSON.stringify({ screenType }) }
  );
}

// Poll for pairing status
export async function getKioskPairingStatus(code: string): Promise<KioskPairingStatus> {
  return apiFetch<KioskPairingStatus>(`/api/kiosk/pair/${code}/status`);
}

// Host confirms pairing
export async function confirmKioskPairing(
  code: string,
  eventId: string
): Promise<{ message: string; eventName: string; screenType: string; sessionToken: string }> {
  return apiFetch<{ message: string; eventName: string; screenType: string; sessionToken: string }>(
    `/api/kiosk/pair/${code}/confirm`,
    { method: "POST", body: JSON.stringify({ eventId }) }
  );
}

// Validate a session
export async function getKioskSession(token: string): Promise<{ session: KioskSession }> {
  return apiFetch<{ session: KioskSession }>(`/api/kiosk/session/${token}`);
}

// End a session
export async function endKioskSession(token: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/kiosk/session/${token}`, {
    method: "DELETE",
  });
}


// Referral Types
export interface ReferralLeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userInitials: string;
  referralCount: number;
  conversionCount: number;
}

// Get referral leaderboard for an event (PUBLIC)
export async function getEventReferralLeaderboard(eventId: string): Promise<ReferralLeaderboardEntry[]> {
  const response = await apiFetch<{ leaderboard: ReferralLeaderboardEntry[] }>(`/api/events/${eventId}/referrals`);
  return response.leaderboard;
}

// Track a referral
export async function trackReferral(data: {
  eventId: string;
  referralCode: string;
  referredUserId?: string;
}): Promise<{ id: string; message: string }> {
  return apiFetch<{ id: string; message: string }>("/api/referrals/track", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// User Referral Code
export interface UserReferralCode {
  code: string;
  totalReferrals: number;
  totalConversions: number;
}

// Get user's referral code
export async function getUserReferralCode(userId: string): Promise<UserReferralCode | null> {
  try {
    return await apiFetch<UserReferralCode>(`/api/users/${userId}/referral-code`);
  } catch {
    return null;
  }
}

// Generate a referral code for user
export async function generateUserReferralCode(userId: string): Promise<{ code: string }> {
  return apiFetch<{ code: string }>(`/api/users/${userId}/referral-code`, {
    method: "POST",
  });
}

// Host Reputation Types
export interface HostStats {
  userId: string;
  name: string;
  handle?: string;
  initials: string;
  eventsHosted: number;
  totalAttendees: number;
  avgAttendance: number;
  rating: number;
  reviewCount: number;
  badges: string[];
  responseRate?: number;
  responseTime?: string;
}

// Get host reputation (PUBLIC)
export async function getHostReputation(userId: string): Promise<HostStats | null> {
  try {
    const response = await apiFetch<{ host: HostStats }>(`/api/users/${userId}/reputation`);
    return response.host;
  } catch {
    return null;
  }
}

// Community Stats Types
export interface CommunityStats {
  addressLocality?: string;
  totalEvents: number;
  totalAttendees: number;
  activeHosts: number;
  trendingCategories: Array<{
    category: string;
    change: number;
    events: number;
  }>;
  peakTime: string;
  popularVenues: Array<{
    venue: string;
    events: number;
  }>;
}

// Get community stats (PUBLIC)
export async function getCommunityStats(city?: string): Promise<CommunityStats> {
  const params = city ? `?city=${encodeURIComponent(city)}` : "";
  const response = await apiFetch<{ stats: CommunityStats }>(`/api/community/stats${params}`);
  return response.stats;
}

// Trending Events (includes views and trend data)
export interface TrendingEvent extends Event {
  views: number;
  trend: number;
  isHot: boolean;
}

// Get trending events
export async function getTrendingEvents(params?: {
  city?: string;
  limit?: number;
}): Promise<TrendingEvent[]> {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set("city", params.city);
  if (params?.limit) searchParams.set("limit", params.limit.toString());

  const query = searchParams.toString();
  const response = await apiFetch<{ events: TrendingEvent[] }>(`/api/events/trending${query ? `?${query}` : ""}`);
  return response.events;
}
