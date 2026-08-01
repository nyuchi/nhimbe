"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Check,
  User,
  Heart,
  Bell,
  Languages,
  SlidersHorizontal,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useTheme } from "@/components/theme-provider";
import { useT } from "@/lib/i18n/i18n-provider";
import type { Locale } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { NyuchiAvatarPicker } from "@/components/ui/nyuchi-avatar-picker";
import { NyuchiProfileSettings, type SettingsSection } from "@/components/ui/nyuchi-profile-settings";
import { type Category } from "@/lib/api";
import { getCategoriesAction, getCitiesAction } from "@/app/actions/discovery";
import { updateMyProfile, getMyGravatarUrlAction, type ProfileFields } from "@/app/actions/profile";

/** A bordered panel on the solid card surface — the shared shell for a labelled
 *  field group so the whole form reads as one system. */
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10"
    >
      <h3 id={headingId} className="text-sm font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const VALID_SECTION_IDS = ["profile", "location", "interests", "notifications", "language", "appearance"];

function ProfileEditContent() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useT();

  const nameFieldId = useId();
  const locationGroupId = useId();
  const interestsGroupId = useId();
  const nicknameFieldId = useId();
  const usernameFieldId = useId();
  const phoneFieldId = useId();
  const birthdateFieldId = useId();
  const genderFieldId = useId();
  const notifyId = useId();

  const [name, setName] = useState("");
  const [picture, setPicture] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [nickname, setNickname] = useState("");
  const [preferredUsername, setPreferredUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [eventUpdates, setEventUpdates] = useState(true);
  const [uiLocale, setUiLocale] = useState<Locale>(locale);

  const [cities, setCities] = useState<{ addressLocality: string; addressCountry: string }[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  // Deep-link support: `?section=notifications` etc. from the profile hub, so
  // its Appearance/Language/Notifications rows land on the right tab. Read
  // from window.location (client-only, lazily) to avoid a useSearchParams
  // Suspense boundary on this leaf page (matches the /search `?q=` pattern).
  // Safe as a one-time initializer: AuthGuard only mounts this content after
  // the client-side auth check resolves, so there's no SSR render to diverge
  // from and NyuchiProfileSettings' active-tab state is uncontrolled after
  // mount.
  const [defaultSection] = useState(() => {
    if (typeof window === "undefined") return "profile";
    const requested = new URLSearchParams(window.location.search).get("section");
    return requested && VALID_SECTION_IDS.includes(requested) ? requested : "profile";
  });

  // Pre-populate from the resolved user.
  useEffect(() => {
    if (user && !dataLoaded) {
      setName(user.name || "");
      setPicture(user.image || "");
      setCity(user.addressLocality || "");
      setCountry(user.addressCountry || "");
      setInterests(user.interests || []);
      setNickname(user.nickname || "");
      setPreferredUsername(user.preferredUsername || "");
      setPhoneNumber(user.phoneNumber || "");
      setBirthdate(user.birthdate || "");
      setGender(user.gender || "");
      setEventUpdates(user.subscribedToEventUpdates !== false);
      setUiLocale(user.locale ?? locale);
      setDataLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dataLoaded]);

  // Load cities and categories once.
  useEffect(() => {
    Promise.all([getCitiesAction(), getCategoriesAction()])
      .then(([citiesData, categoriesData]) => {
        setCities(citiesData);
        setCategories(categoriesData);
      })
      .catch(() => setError("Couldn't load locations and categories. Please try again."));
  }, []);

  const selectCity = useCallback((value: string) => {
    const [c, co] = value.split("|");
    setCity(c);
    setCountry(co ?? "");
  }, []);

  const toggleInterest = useCallback((categoryId: string) => {
    setInterests((prev) =>
      prev.includes(categoryId) ? prev.filter((i) => i !== categoryId) : [...prev, categoryId],
    );
  }, []);

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
      if (!user?.personId) {
        throw new Error("No session found. Please sign in again.");
      }

      // Only send changed fields to the server action.
      const changedFields: ProfileFields = {};
      if (name !== (user.name || "")) changedFields.name = name;
      if (picture !== (user.image || "")) changedFields.picture = picture;
      if (city !== (user.addressLocality || "")) changedFields.addressLocality = city;
      if (country !== (user.addressCountry || "")) changedFields.addressCountry = country;
      if (JSON.stringify(interests) !== JSON.stringify(user.interests || [])) {
        changedFields.interests = interests;
      }
      if (nickname !== (user.nickname || "")) changedFields.nickname = nickname;
      if (preferredUsername !== (user.preferredUsername || "")) {
        changedFields.preferredUsername = preferredUsername;
      }
      if (phoneNumber !== (user.phoneNumber || "")) changedFields.phoneNumber = phoneNumber;
      if (birthdate !== (user.birthdate || "")) changedFields.birthdate = birthdate;
      if (gender !== (user.gender || "")) changedFields.gender = gender;
      if (eventUpdates !== (user.subscribedToEventUpdates !== false)) {
        changedFields.subscribeToEventUpdates = eventUpdates;
      }
      if (uiLocale !== (user.locale ?? "en")) changedFields.locale = uiLocale;

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

  // Group categories by group for the interests picker.
  const categoryGroups = categories.reduce<Record<string, Category[]>>((acc, cat) => {
    if (!acc[cat.group]) acc[cat.group] = [];
    acc[cat.group].push(cat);
    return acc;
  }, {});

  const themeOptions: { value: "light" | "dark" | "system"; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  const profileSection = (
    <div className="space-y-6">
      <Panel title="Avatar" description="Upload a photo, use your Gravatar, or pick a sticker.">
        <NyuchiAvatarPicker
          name={name || "User"}
          value={picture}
          onChange={setPicture}
          onCheckGravatar={getMyGravatarUrlAction}
        />
      </Panel>

      <Panel title="Name" description="This is how you'll appear to other attendees and hosts.">
        <Label htmlFor={nameFieldId} className="sr-only">
          Your name
        </Label>
        <Input
          id={nameFieldId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should we call you?"
          autoComplete="name"
        />
      </Panel>

      <Panel
        title="Personal details"
        description="Optional — shown only where a handle or contact detail is relevant."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor={nicknameFieldId} className="text-sm font-medium text-foreground">
              Nickname
            </Label>
            <Input
              id={nicknameFieldId}
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="A shorter name friends call you"
              autoComplete="nickname"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor={usernameFieldId} className="text-sm font-medium text-foreground">
              Username
            </Label>
            <Input
              id={usernameFieldId}
              type="text"
              value={preferredUsername}
              onChange={(e) => setPreferredUsername(e.target.value)}
              placeholder="yourhandle"
              autoComplete="username"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor={phoneFieldId} className="text-sm font-medium text-foreground">
              Phone number
            </Label>
            <Input
              id={phoneFieldId}
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+263 …"
              autoComplete="tel"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor={birthdateFieldId} className="text-sm font-medium text-foreground">
              Date of birth
            </Label>
            <Input
              id={birthdateFieldId}
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              autoComplete="bday"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor={genderFieldId} className="text-sm font-medium text-foreground">
              Gender
            </Label>
            <Input
              id={genderFieldId}
              type="text"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              placeholder="e.g. Woman, Man, Non-binary — optional"
              autoComplete="sex"
              className="mt-1.5"
            />
          </div>
        </div>
      </Panel>
    </div>
  );

  const locationSection = (
    <div
      role="group"
      aria-labelledby={locationGroupId}
      className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10"
    >
      <h3 id={locationGroupId} className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Location
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">Set your home city so we can surface nearby events.</p>
      <RadioGroup
        className="mt-4 max-h-72 gap-2 overflow-y-auto pr-1"
        value={city ? `${city}|${country}` : undefined}
        onValueChange={selectCity}
        aria-label="Home city"
      >
        {cities.map((loc) => {
          const value = `${loc.addressLocality}|${loc.addressCountry}`;
          const id = `city-${loc.addressLocality}-${loc.addressCountry}`.replace(/\s+/g, "-");
          const selected = city === loc.addressLocality && country === loc.addressCountry;
          return (
            <label
              key={value}
              htmlFor={id}
              className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--radius-lg,14px)] border px-4 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-card ${
                selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"
              }`}
            >
              <RadioGroupItem id={id} value={value} />
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">
                <span className="block font-medium text-foreground">{loc.addressLocality}</span>
                <span className="block text-sm text-muted-foreground">{loc.addressCountry}</span>
              </span>
            </label>
          );
        })}
        {cities.length === 0 && <p className="py-2 text-sm text-muted-foreground">Loading locations…</p>}
      </RadioGroup>
    </div>
  );

  const interestsSection = (
    <div
      role="group"
      aria-labelledby={interestsGroupId}
      className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10"
    >
      <h3 id={interestsGroupId} className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Interests
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick the categories you care about to personalize discovery.
      </p>
      <div className="mt-4 space-y-4">
        {Object.entries(categoryGroups).map(([group, cats]) => (
          <div key={group}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{group}</p>
            <div className="flex flex-wrap gap-2">
              {cats.map((category) => {
                const active = interests.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleInterest(category.id)}
                    className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    }`}
                  >
                    {active && <Check className="size-3.5" aria-hidden="true" />}
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {categories.length === 0 && <p className="text-sm text-muted-foreground">Loading categories…</p>}
      </div>
    </div>
  );

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
    { id: "profile", label: "Profile", icon: User, content: profileSection },
    { id: "location", label: "Location", icon: MapPin, content: locationSection },
    { id: "interests", label: "Interests", icon: Heart, content: interestsSection },
    { id: "notifications", label: "Notifications", icon: Bell, content: notificationsSection },
    { id: "language", label: "Language", icon: Languages, content: languageSection },
    { id: "appearance", label: "Appearance", icon: SlidersHorizontal, content: appearanceSection },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Link
          href="/profile"
          className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to profile"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Profile settings</h1>
          <p className="text-sm text-muted-foreground">Everything about your account, in one place.</p>
        </div>
      </div>

      {/* Error — announced to assistive tech */}
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
        defaultActiveId={defaultSection}
        showSaveBar
        saving={isSaving}
        saveLabel={isSaving ? "Saving…" : "Save changes"}
        onSave={handleSave}
        onCancel={() => router.push("/profile")}
      />

      {/* Screen-reader saving status */}
      <p className="sr-only" role="status" aria-live="polite">
        {isSaving ? "Saving your changes" : ""}
      </p>
    </div>
  );
}

export default function ProfileEditPage() {
  return (
    <AuthGuard>
      <ProfileEditContent />
    </AuthGuard>
  );
}
