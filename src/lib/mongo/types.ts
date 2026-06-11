/**
 * TypeScript document models for the Mukoko v3.1 MongoDB schema.
 *
 * These mirror the `$jsonSchema` validators enforced on the cluster. They are
 * the *storage* shapes (camelCase, BSON `Date`, string UUID `_id`,
 * entity-centric references) — distinct from the API/UI shapes in
 * `src/lib/types` (legacy `Event`, `User`, etc.), which the mappers in
 * `src/lib/mongo/mappers` produce from these.
 *
 * Cross-database reference rules worth keeping in mind:
 *  - Hosting is ENTITY-centric. An event references `entity.entities` via
 *    `primaryHostEntityId` / `hostEntityIds`, never a person directly. The
 *    human behind an entity is resolved through `entity.memberships`
 *    (entityId → personId) or `entity.founderPersonId`.
 *  - Engagement bodies (reviews/comments/reactions) are END-TO-END ENCRYPTED.
 *    Only the plaintext aggregate fields (ratingValue, counts) are readable.
 */

/** Every v3.1 document carries a schema-version discriminator. */
export type SchemaVersion = "v3.1" | "v3.2";

/** Base fields shared by every collection document. */
export interface BaseDoc {
  _id: string;
  _schemaVersion: SchemaVersion;
  createdAt: Date;
  updatedAt: Date;
}

// ───────────────────────── events database ─────────────────────────

export type EventLifecycleStatus =
  | "draft"
  | "published"
  | "live"
  | "ended"
  | "cancelled"
  | "archived";

export type SchemaOrgEventStatus =
  | "EventScheduled"
  | "EventCancelled"
  | "EventMovedOnline"
  | "EventPostponed"
  | "EventRescheduled";

export type EventAttendanceMode =
  | "OfflineEventAttendanceMode"
  | "OnlineEventAttendanceMode"
  | "MixedEventAttendanceMode";

export interface EventDoc extends BaseDoc {
  iCalUid: string;
  slug: string;
  name: string;
  description?: string | null;
  schemaOrgType: string;
  attendanceMode: EventAttendanceMode;
  eventStatus: SchemaOrgEventStatus;
  status: EventLifecycleStatus;
  startDate: Date;
  endDate: Date;
  doorTime?: Date | null;
  previousStartDate?: Date | null;
  /** Entity-centric hosting (Rule 10). Resolve to people via entity.memberships. */
  primaryHostEntityId: string;
  hostEntityIds: string[];
  performerEntityIds?: string[];
  isAccessibleForFree: boolean;
  totalAttendeeCount: number;
  remainingAttendeeCapacity?: number | null;
  maximumAttendeeCapacity?: number | null;
  surfaceContext: string;
  /** schema.org Place or VirtualLocation, embedded. */
  location?: Record<string, unknown> | null;
  placeId?: string | null;
  circleId?: string | null;
  organizer?: Record<string, unknown> | null;
  offers?: unknown[];
  image?: unknown[];
  tags?: unknown[];
  inLanguage?: string | null;
  url?: string | null;
  iCalRRule?: string | null;
  translations?: Record<string, unknown>;
  bundu?: Record<string, unknown>;
  mukoko?: Record<string, unknown>;
}

export type RsvpResponse = "RsvpResponseYes" | "RsvpResponseNo" | "RsvpResponseMaybe";

export interface RsvpDoc extends BaseDoc {
  eventId: string;
  attendeePersonId: string;
  attendeeEntityId: string;
  rsvpResponse: RsvpResponse;
  additionalGuests: number;
  respondedAt: Date;
  ticketIds?: string[];
  notes?: string | null;
}

export type CheckInMethod =
  | "qr_code"
  | "manual"
  | "geofence"
  | "nfc"
  | "ticket_scan"
  | "self_reported";

export interface CheckInDoc extends BaseDoc {
  eventId: string;
  attendeePersonId: string;
  checkInMethod: CheckInMethod;
  checkedInAt: Date;
  checkedInByPersonId?: string | null;
  ticketId?: string | null;
  location?: Record<string, unknown> | null;
}

export interface AttendanceHistoryDoc extends Omit<BaseDoc, "updatedAt"> {
  eventId: string;
  attendeePersonId: string;
  attendeeEntityId: string;
  outcome:
    | "attended"
    | "no_show"
    | "cancelled_late"
    | "cancelled_early"
    | "rsvp_no"
    | "rsvp_yes_no_checkin";
  rsvpResponse?: RsvpResponse | null;
  eventStartDate: Date;
  schemaOrgEventType?: string;
}

export interface ProgrammeItemDoc extends BaseDoc {
  eventId: string;
  iCalUid: string;
  name: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  sequence: number;
  trackName?: string | null;
  location?: string | null;
  performerEntityIds?: string[];
}

export interface PollDoc extends BaseDoc {
  eventId: string;
  createdByPersonId: string;
  question: string;
  options: unknown[];
  allowMultipleSelection: boolean;
  isActive: boolean;
  totalResponseCount: number;
  closesAt?: Date | null;
  votes?: unknown[];
}

export interface EventUpdateDoc extends BaseDoc {
  eventId: string;
  authorPersonId: string;
  authorEntityId: string;
  updateType:
    | "announcement"
    | "schedule_change"
    | "venue_change"
    | "cancellation_notice"
    | "thank_you"
    | "general";
  text: string;
  isPinned: boolean;
  notifyAttendees: boolean;
  media?: unknown[];
}

// ───────────────────────── identity database ─────────────────────────

export interface PersonDoc extends BaseDoc {
  /** _id is the UUID used as the OIDC `sub` claim. */
  workosUserId?: string | null;
  stytchUserId?: string | null;
  email?: string | null;
  emailVerified: boolean;
  phoneNumber?: string | null;
  phoneNumberVerified: boolean;
  name?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  additionalName?: string | null;
  nickname?: string | null;
  preferredUsername?: string | null;
  picture?: string | null;
  locale?: string | null;
  zoneinfo?: string | null;
  gender?: string | null;
  birthdate?: Date | null;
  isActive: boolean;
  lastSeenAt?: Date | null;
  bundu?: {
    defaultFamilyEntityId?: string;
    familyMembership?: Record<string, unknown>;
    verificationTier?: number;
    preferredLanguages?: string[];
  };
}

// ───────────────────────── entity database ─────────────────────────

export type EntityType = "family" | "organization" | "community" | "place_owner";

export interface EntityDoc extends BaseDoc {
  entityType: EntityType;
  ecosystemRole: "foundation" | "pillar" | "initiative" | "product" | "external";
  schemaOrgType: string;
  slug: string;
  name: string;
  legalName?: string | null;
  alternateName?: string | null;
  description?: string | null;
  isActive: boolean;
  isPrivateByDefault: boolean;
  founderPersonId?: string | null;
  parentEntityId?: string | null;
  primaryPlaceId?: string | null;
  email?: string | null;
  url?: string | null;
  logo?: Record<string, unknown> | string | null;
  address?: Record<string, unknown> | null;
  memberCount?: number | null;
  bundu?: {
    verificationTier?: number;
    trustSignals?: {
      averageRating?: number | null;
      reviewCount?: number;
      communityVouches?: number;
      ubuntuScore?: number | null;
      responseRate?: number | null;
      responseTimeHours?: number | null;
      lastSeenAt?: Date | null;
      yearsActive?: number | null;
      verificationTier?: number;
    };
    informalEconomy?: Record<string, unknown>;
  };
}

export type EntityMembershipRole =
  | "founder"
  | "admin"
  | "manager"
  | "representative"
  | "member"
  | "contributor"
  | "follower"
  | "kin";

export interface EntityMembershipDoc extends BaseDoc {
  personId: string;
  entityId: string;
  membershipRole: EntityMembershipRole;
  isActive: boolean;
  joinedAt: Date;
  endedAt?: Date | null;
  title?: string | null;
  permissions?: unknown[];
}

// ───────────────────────── places database ─────────────────────────

export interface PlaceDoc extends BaseDoc {
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  status?: string | null;
  ownerEntityId: string;
  placeType: string[];
  /** GeoJSON Point / Polygon / MultiPolygon, 2dsphere-indexed. */
  geo: Record<string, unknown>;
  address?: Record<string, unknown> | null;
  hierarchy?: {
    containedInPlaceId?: string | null;
    countryId?: string | null;
    provinceId?: string | null;
  } | null;
  telephone?: string | null;
  url?: string | null;
  plusCode?: string | null;
  what3words?: string | null;
  elevationMeters?: number | null;
  media?: { image?: string[]; logo?: string | null; coverImage?: string | null } | null;
  translations?: Record<string, unknown>;
  discovery?: {
    featured?: boolean | null;
    aggregateRating?: { value?: number; count?: number } | null;
    interactionCount?: number | null;
    viewCount?: number | null;
  } | null;
}

export interface PlacesGeoDoc extends BaseDoc {
  name: string;
  slug: string;
  geoType: "continent" | "country" | "province" | "city" | "town" | "village" | "district" | "region";
  geo: Record<string, unknown>;
  parentPlaceId?: string | null;
  isoCode?: string | null;
  population?: number | null;
}

export interface PlaceCategoryDoc extends BaseDoc {
  categorySlug: string;
  name: string;
  description?: string | null;
  iconName?: string | null;
  parentCategoryId?: string | null;
  schemaOrgType?: string | null;
  sortOrder: number;
  osmTags?: string[];
  translations?: Record<string, unknown>;
}

// ───────────────────────── circles database ─────────────────────────

export interface CircleDoc extends BaseDoc {
  slug: string;
  name: string;
  schemaOrgType: "OnlineCommunityGroup" | "Organization" | "Group";
  circleType: "public" | "private" | "secret" | "broadcast";
  ownerPersonId: string;
  ownerEntityId: string;
  isActive: boolean;
  memberCount: number;
  postCount: number;
  inLanguage: string;
  surfaceContext: string;
  description?: string | null;
  image?: Record<string, unknown> | null;
  coverImage?: Record<string, unknown> | null;
  placeId?: string | null;
  primaryEventId?: string | null;
  interestCategoryIds?: string[];
  tags?: unknown[];
  rules?: unknown[];
}

export interface CircleMembershipDoc extends BaseDoc {
  circleId: string;
  memberPersonId: string;
  memberEntityId: string;
  role: "owner" | "admin" | "moderator" | "member" | "guest";
  membershipStatus: "active" | "pending_approval" | "invited" | "banned" | "left" | "removed";
  isActive: boolean;
  joinedAt: Date;
  invitedByPersonId?: string | null;
  lastActiveAt?: Date | null;
  leftAt?: Date | null;
}

export interface CirclePostDoc extends BaseDoc {
  circleId: string;
  authorPersonId: string;
  authorEntityId: string;
  schemaOrgType: "SocialMediaPosting" | "DiscussionForumPosting" | "Question";
  postType: string;
  inLanguage: string;
  moderationStatus: "pending" | "approved" | "flagged" | "rejected" | "removed";
  isPinned: boolean;
  visibility: "circle_members" | "public" | "circle_admins_only";
  commentCount: number;
  reactionCount: number;
  viewCount: number;
  datePublished: Date;
  headline?: string | null;
  articleBody?: string | null;
  attachments?: unknown[];
  tags?: unknown[];
  linkedEntityId?: string | null;
  linkedReferenceType?: string | null;
  mentionedPersonIds?: string[];
}

// ───────────────────────── engagement database ─────────────────────────

/**
 * Crypto envelope present on every encrypted engagement record. The platform
 * stores it but cannot decrypt the associated ciphertext.
 */
export interface EncryptionEnvelope {
  algorithm: string;
  nonce: string;
  sealedAt: Date;
  version: string;
  epoch?: number | null;
  keyDerivation?: string | null;
}

export type EngagementReferenceType = string;

/**
 * Reviews are encrypted at rest. Only `reviewRating` (and counts/flags) are
 * plaintext and usable for star aggregates — the body lives in `ciphertext`.
 */
export interface ReviewDoc extends BaseDoc {
  reviewerPersonId: string;
  reviewerEntityId: string;
  targetEntityId: string;
  targetReferenceType: EngagementReferenceType;
  targetProductId?: string | null;
  ciphertext: string;
  ciphertextHeadline?: string | null;
  ciphertextReply?: string | null;
  encryptionEnvelope: EncryptionEnvelope;
  recipientKeyRefs: unknown[];
  visibility: "private" | "public" | "circle_members" | "self_only";
  reviewRating: { ratingValue: number; bestRating?: number; worstRating?: number };
  moderationStatus: string;
  isActive: boolean;
  verifiedPurchase: boolean;
  surfaceContext: string;
  datePublished?: Date | null;
  repliedAt?: Date | null;
  media?: unknown[];
}

export interface RatingDoc extends BaseDoc {
  raterPseudoId: string;
  ciphertextRaterRef: string;
  encryptionEnvelope: EncryptionEnvelope;
  targetEntityId: string;
  targetReferenceType: EngagementReferenceType;
  ratingDimension: string;
  ratingValue: number;
  bestRating: number;
  worstRating: number;
  isActive: boolean;
  surfaceContext: string;
}

export interface ReferralDoc extends BaseDoc {
  referralCode: string;
  referrerPersonId: string;
  referrerEntityId: string;
  referredPersonId?: string | null;
  status: "pending" | "converted" | "completed" | "expired" | "revoked";
  surfaceContext: string;
  convertedAt?: Date | null;
  completedAt?: Date | null;
  rewardAmount?: number | null;
  rewardCurrency?: string | null;
}

export interface TrackedLinkDoc extends BaseDoc {
  linkSlug: string;
  destinationUrl: string;
  ownerPersonId: string;
  ownerEntityId: string;
  clickCount: number;
  isActive: boolean;
  expiresAt?: Date | null;
  utm?: Record<string, unknown> | null;
}

export interface LinkClickDoc extends Omit<BaseDoc, "updatedAt"> {
  trackedLinkId: string;
  clickedAt: Date;
  clickerPersonId?: string | null;
  referrer?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ───────────────────────── device database ─────────────────────────

export interface PairingDoc extends BaseDoc {
  code: string;
  status: string;
  expiresAt: Date;
  eventId?: string | null;
  entityId?: string | null;
  pairedPersonId?: string | null;
}
