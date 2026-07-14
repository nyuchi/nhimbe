/**
 * Admin dashboard view-model types.
 *
 * These are the row/tile shapes the standalone admin app (admin/) renders and
 * that `src/lib/mongo/admin.ts` produces. They live in their own module —
 * deliberately WITHOUT `server-only` — because both sides of the admin app
 * need them: the server-side query layer imports them to type its results,
 * and the admin app's "use client" table components import them to type their
 * props. (A client component may never import `admin.ts` itself, which pulls
 * the Mongo driver.)
 *
 * Before the admin extraction these types were exported from the client
 * components under `src/app/admin/*` and imported backwards by the mongo
 * layer; this module breaks that inversion.
 */

import type { EventLifecycleStatus } from "./types";

// ── overview ────────────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  totalEvents: number;
  totalRegistrations: number;
  activeEvents: number;
  /** Cross-product totals surfaced on the admin overview. */
  totalEntities: number;
  totalCircles: number;
  totalCalendars: number;
  userGrowth: number;
  eventGrowth: number;
  recentViews: number;
  viewsGrowth: number;
}

export interface RecentEvent {
  id: string;
  title: string;
  date: string;
  attendeeCount: number;
  status: "upcoming" | "ongoing" | "past";
}

export interface RecentUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: "open" | "pending" | "resolved";
  createdAt: string;
}

// ── people ──────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  alternateName?: string;
  image?: string;
  addressLocality?: string;
  addressCountry?: string;
  /** identity.persons.role — "user" when unset/unknown. */
  role: string;
  eventsAttended: number;
  eventsHosted: number;
  dateCreated: string;
  status: "active" | "suspended" | "pending";
}

// ── events ──────────────────────────────────────────────────────────

export interface AdminEvent {
  id: string;
  name: string;
  description: string;
  date: {
    full: string;
  };
  startDate: string;
  location: {
    name: string;
    addressLocality: string;
  };
  category: string;
  attendeeCount: number;
  maximumAttendeeCapacity?: number;
  organizer: {
    name: string;
  };
  /** Derived table status (time window + cancellation). */
  status: "upcoming" | "ongoing" | "past" | "cancelled";
  /** Persisted lifecycle status — drives the publish/cancel/archive actions. */
  lifecycleStatus: EventLifecycleStatus;
  /** Admin feature flag (events.events.mukoko.featured). */
  featured: boolean;
  dateCreated: string;
}

// ── entities ────────────────────────────────────────────────────────

export interface AdminEntity {
  id: string;
  name: string;
  slug: string;
  entityType: string;
  founderName: string;
  /** Active `entity.memberships` rows pointing at this entity. */
  memberCount: number;
  isActive: boolean;
  dateCreated: string;
}

export interface AdminEntityMember {
  personId: string;
  name: string;
  email: string;
  membershipRole: string;
  isActive: boolean;
  joinedAt: string;
}

// ── circles ─────────────────────────────────────────────────────────

export interface AdminCircle {
  id: string;
  name: string;
  slug: string;
  /** public | private | secret | broadcast — the circle's visibility. */
  circleType: string;
  memberCount: number;
  postCount: number;
  isActive: boolean;
  dateCreated: string;
}

// ── calendars ───────────────────────────────────────────────────────

export interface AdminCalendar {
  id: string;
  name: string;
  slug: string;
  /** public | unlisted | private. */
  visibility: string;
  followerCount: number;
  eventCount: number;
  isActive: boolean;
  dateCreated: string;
}
