"use client";

import { useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Languages, Monitor, Moon, Sun, Bell, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useTheme } from "@/components/theme-provider";
import { useT } from "@/lib/i18n/i18n-provider";
import type { Locale } from "@/lib/i18n";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NyuchiProfileSettings, type SettingsSection } from "@/components/ui/nyuchi-profile-settings";
import { updateMyProfile, type ProfileFields } from "@/app/actions/profile";

function PreferencesContent() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useT();

  const notifyId = useId();

  const [eventUpdates, setEventUpdates] = useState(user?.subscribedToEventUpdates !== false);
  const [uiLocale, setUiLocale] = useState<Locale>(user?.locale ?? locale);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLocaleChange = useCallback(
    (next: Locale) => {
      setUiLocale(next);
      setLocale(next);
    },
    [setLocale],
  );

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (!user?.personId) throw new Error("No session found. Please sign in again.");

      const changedFields: ProfileFields = {};
      if (eventUpdates !== (user.subscribedToEventUpdates !== false)) {
        changedFields.subscribeToEventUpdates = eventUpdates;
      }
      if (uiLocale !== (user.locale ?? "en")) {
        changedFields.locale = uiLocale;
      }

      if (Object.keys(changedFields).length > 0) {
        await updateMyProfile(changedFields);
        await refreshUser();
      }
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSaving(false);
    }
  };

  const themeOptions: { value: "light" | "dark" | "system"; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  const notificationsSection = (
    <div className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Notifications</h3>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={notifyId} className="text-sm font-medium text-foreground">
            Event update emails
          </Label>
          <p id={`${notifyId}-desc`} className="mt-1 text-sm text-muted-foreground">
            Get emails when hosts of events you attend or help run post an update.
          </p>
        </div>
        <Switch
          id={notifyId}
          checked={eventUpdates}
          onCheckedChange={setEventUpdates}
          aria-describedby={`${notifyId}-desc`}
        />
      </div>
    </div>
  );

  const languageSection = (
    <div className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Language</h3>
      <p className="mt-1 text-sm text-muted-foreground">Choose the language for the Nhimbe interface.</p>
      <fieldset className="mt-4">
        <legend className="sr-only">Interface language</legend>
        <RadioGroup className="gap-2" value={uiLocale} onValueChange={(v) => onLocaleChange(v as Locale)}>
          {[
            { value: "en" as Locale, label: "English" },
            { value: "sn" as Locale, label: "Shona (chiShona)" },
          ].map((opt) => {
            const id = `lang-${opt.value}`;
            const active = uiLocale === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={id}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--radius-lg,14px)] border px-4 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-card ${
                  active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"
                }`}
              >
                <RadioGroupItem id={id} value={opt.value} />
                <Languages className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{opt.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>
    </div>
  );

  const appearanceSection = (
    <div className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Appearance</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        &ldquo;System&rdquo; follows your device&apos;s light or dark setting.
      </p>
      <fieldset className="mt-4">
        <legend className="sr-only">Theme</legend>
        <RadioGroup
          className="grid grid-cols-3 gap-2"
          value={theme}
          onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}
        >
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const id = `theme-${opt.value}`;
            const active = theme === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={id}
                className={`flex min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-lg,14px)] border px-3 py-4 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-card ${
                  active ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"
                }`}
              >
                <RadioGroupItem id={id} value={opt.value} className="sr-only" />
                <Icon className={`size-5 ${active ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>
    </div>
  );

  const sections: SettingsSection[] = [
    { id: "notifications", label: "Notifications", icon: Bell, content: notificationsSection },
    { id: "language", label: "Language", icon: Languages, content: languageSection },
    { id: "appearance", label: "Appearance", icon: SlidersHorizontal, content: appearanceSection },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8 flex items-center gap-3">
        <Link
          href="/profile"
          className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to profile"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Preferences</h1>
          <p className="text-sm text-muted-foreground">How Nhimbe behaves for you — separate from your profile identity.</p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-[var(--radius-lg,14px)] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <NyuchiProfileSettings
        sections={sections}
        defaultActiveId="notifications"
        showSaveBar
        saving={isSaving}
        saveLabel={isSaving ? "Saving…" : "Save changes"}
        onSave={handleSave}
        onCancel={() => router.push("/profile")}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {isSaving ? "Saving your changes" : ""}
      </p>
      {isSaving && (
        <div className="mt-2 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Saving…
        </div>
      )}
    </div>
  );
}

export default function ProfilePreferencesPage() {
  return (
    <AuthGuard>
      <PreferencesContent />
    </AuthGuard>
  );
}
