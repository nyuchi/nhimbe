"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  User,
  MapPin,
  Calendar,
  Bell,
  Palette,
  Languages,
  LogOut,
  ChevronRight,
  Ticket,
  Users,
  Heart,
  Shield,
  HelpCircle,
  ExternalLink,
  KeyRound,
  MessageSquareWarning,
  Building2,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useT } from "@/lib/i18n/i18n-provider";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/components/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProfileBadges } from "@/components/ui/profile-badges";
import { NyuchiProfileBlock } from "@/components/ui/nyuchi-profile-block";
import { useFeedback } from "@/components/feedback/feedback-provider";
import { useFocusTrap } from "@/lib/use-focus-trap";

type MenuItem = {
  icon: LucideIcon;
  label: string;
  href?: string;
  /** Trailing status text (e.g. current theme / language). */
  value?: string;
  /** Fires on click instead of navigating. */
  onClick?: () => void;
  external?: boolean;
  /** Screen-reader-only description of the item's current state. */
  srState?: string;
};

type MenuSection = {
  section: string;
  items: MenuItem[];
};

function ProfileContent() {
  const router = useRouter();
  const { theme, cycleTheme, resolvedTheme } = useTheme();
  const { locale } = useT();
  const { user, signOut, profileCompleteness } = useAuth();
  const { open: openFeedback } = useFeedback();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const dialogRef = useFocusTrap<HTMLDivElement>({
    isActive: showSignOutConfirm,
    onEscape: () => setShowSignOutConfirm(false),
  });

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const joinedDate = user?.id
    ? new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "Unknown";

  const themeLabel = theme === "system" ? "System" : resolvedTheme === "dark" ? "Dark" : "Light";
  const languageLabel = locale === "sn" ? "Shona" : "English";
  const emailUpdatesLabel = user?.subscribedToEventUpdates === false ? "Off" : "On";

  const menuItems: MenuSection[] = [
    {
      section: "Events",
      items: [
        { icon: Ticket, label: "My tickets", href: "/my-events" },
        { icon: Users, label: "Events I'm hosting", href: "/my-events?tab=hosting" },
        { icon: Heart, label: "Saved events", href: "/my-events?tab=saved" },
      ],
    },
    {
      section: "Profile",
      items: [{ icon: User, label: "Edit profile", href: "/profile/edit" }],
    },
    {
      section: "Preferences",
      items: [
        {
          icon: Palette,
          label: "Appearance",
          value: themeLabel,
          onClick: cycleTheme,
          srState: `Current theme: ${themeLabel}. Activate to cycle.`,
        },
        {
          icon: Languages,
          label: "Language",
          value: languageLabel,
          href: "/profile/edit?section=language",
          srState: `Current language: ${languageLabel}.`,
        },
        {
          icon: Bell,
          label: "Event update emails",
          value: emailUpdatesLabel,
          href: "/profile/edit?section=notifications",
          srState: `Event update emails are ${emailUpdatesLabel}.`,
        },
      ],
    },
    {
      section: "Account",
      items: [
        { icon: Building2, label: "Host Entities", href: "/profile/entities" },
        {
          icon: KeyRound,
          label: "Change password",
          href: "https://id.mukoko.com/settings/security",
          external: true,
        },
        {
          icon: ExternalLink,
          label: "Manage Mukoko ID",
          href: "https://id.mukoko.com/settings",
          external: true,
        },
      ],
    },
    {
      section: "Support",
      items: [
        { icon: HelpCircle, label: "Help center", href: "/help" },
        { icon: MessageSquareWarning, label: "Send feedback", onClick: () => openFeedback() },
        { icon: Shield, label: "Privacy policy", href: "/privacy" },
      ],
    },
  ];

  const rowClasses =
    "flex min-h-[52px] w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Identity header */}
      <NyuchiProfileBlock
        className="mb-4"
        name={user?.name || "User"}
        subtitle={user?.email}
        avatar={user?.image}
      />
      {(user?.addressLocality || user?.addressCountry) && (
        <p className="mb-8 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4" aria-hidden="true" />
          {[user?.addressLocality, user?.addressCountry].filter(Boolean).join(", ")}
        </p>
      )}

      {/* Interests */}
      {user?.interests && user.interests.length > 0 && (
        <section aria-labelledby="interests-heading" className="mb-8">
          <h2
            id="interests-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Interests
          </h2>
          <ul className="flex flex-wrap gap-2">
            {user.interests.map((interest) => (
              <li key={interest}>
                <Badge variant="secondary">{interest}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Completeness nudge */}
      {!profileCompleteness.complete &&
        (() => {
          const missing: string[] = [];
          if (!profileCompleteness.name) missing.push("your name");
          if (!profileCompleteness.addressLocality) missing.push("your location");
          if (!profileCompleteness.interests) missing.push("your interests");
          const completionPercent =
            ([
              profileCompleteness.name,
              profileCompleteness.addressLocality,
              profileCompleteness.interests,
            ].filter(Boolean).length /
              3) *
            100;
          const nudgeText = `Add ${missing.join(" and ")} for a better experience`;

          return (
            <Link
              href="/profile/edit"
              className="mb-8 flex items-center gap-4 rounded-[var(--radius-xl,17px)] bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg
                className="size-12 shrink-0"
                viewBox="0 0 36 36"
                role="img"
                aria-label={`Profile ${Math.round(completionPercent)} percent complete`}
              >
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.1"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={`${completionPercent}, 100`}
                  className="text-primary"
                />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">Complete your profile</p>
                <p className="text-sm text-muted-foreground">{nudgeText}</p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          );
        })()}

      {/* Ubuntu badges showcase */}
      {user?.personId && <ProfileBadges personId={user.personId} />}

      {/* Menu sections */}
      <div className="space-y-6">
        {menuItems.map((section) => (
          <section key={section.section} aria-labelledby={`sec-${section.section}`}>
            <h2
              id={`sec-${section.section}`}
              className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {section.section}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-xl,17px)] bg-card ring-1 ring-foreground/10">
              {section.items.map((item) => {
                const Icon = item.icon;

                const inner = (
                  <>
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1 font-medium text-foreground">{item.label}</span>
                    {item.value && (
                      <span className="text-sm text-muted-foreground">{item.value}</span>
                    )}
                    {item.srState && <span className="sr-only">{item.srState}</span>}
                    {item.external ? (
                      <ExternalLink
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </>
                );

                return (
                  <li key={item.label}>
                    {item.onClick ? (
                      <button type="button" onClick={item.onClick} className={rowClasses}>
                        {inner}
                      </button>
                    ) : item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={rowClasses}
                      >
                        {inner}
                      </a>
                    ) : (
                      <Link href={item.href || "#"} className={rowClasses}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Sign out */}
      <div className="mt-8">
        <Button
          variant="ghost"
          onClick={() => setShowSignOutConfirm(true)}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[var(--radius-xl,17px)] bg-card text-destructive ring-1 ring-foreground/10 hover:bg-destructive/10"
        >
          <LogOut className="size-5" aria-hidden="true" />
          <span className="font-medium">Sign out</span>
        </Button>
      </div>

      {/* Member since */}
      <p className="mt-8 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        <Calendar className="size-4" aria-hidden="true" />
        Member since {joinedDate}
      </p>

      {/* Sign-out confirmation */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="signout-title"
            aria-describedby="signout-desc"
            className="w-full max-w-sm rounded-[var(--radius-xl,17px)] bg-card p-6 ring-1 ring-foreground/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="signout-title" className="mb-2 font-serif text-xl font-bold text-foreground">
              Sign out?
            </h2>
            <p id="signout-desc" className="mb-6 text-muted-foreground">
              Are you sure you want to sign out of your account?
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSignOut}
                className="flex-1 bg-destructive text-white hover:bg-destructive/90"
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
