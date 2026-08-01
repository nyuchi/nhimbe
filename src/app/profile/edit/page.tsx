"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, MapPin, Check } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AvatarPicker } from "@/components/ui/avatar-picker";
import { Button } from "@/components/ui/button";
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
      <h3
        id={headingId}
        className="text-sm font-semibold uppercase tracking-wider text-foreground"
      >
        {title}
      </h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfileEditContent() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const nameFieldId = useId();
  const locationGroupId = useId();
  const interestsGroupId = useId();
  const nicknameFieldId = useId();
  const usernameFieldId = useId();
  const phoneFieldId = useId();
  const birthdateFieldId = useId();
  const genderFieldId = useId();

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

  const [cities, setCities] = useState<{ addressLocality: string; addressCountry: string }[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

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
      setDataLoaded(true);
    }
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
      prev.includes(categoryId)
        ? prev.filter((i) => i !== categoryId)
        : [...prev, categoryId],
    );
  }, []);

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
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
          <h1 className="font-serif text-2xl font-bold text-foreground">Edit profile</h1>
          <p className="text-sm text-muted-foreground">
            Update how you appear to attendees and hosts.{" "}
            <Link href="/profile/preferences" className="text-primary underline-offset-2 hover:underline">
              Looking for preferences?
            </Link>
          </p>
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

      {/* One flat, grouped list — no tabs. Every section is a labelled card,
          always visible and directly editable, so the whole page reads as
          one system instead of switching between hidden panels. */}
      <div className="space-y-6">
        {/* Avatar */}
        <Panel title="Avatar" description="Upload a photo, use your Gravatar, or pick a sticker.">
          <AvatarPicker
            name={name || "User"}
            value={picture}
            onChange={setPicture}
            onCheckGravatar={getMyGravatarUrlAction}
          />
        </Panel>

        {/* Name */}
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

        {/* Personal details */}
        <Panel title="Personal details" description="Optional — shown only where a handle or contact detail is relevant.">
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

        {/* Location */}
        <div
          role="group"
          aria-labelledby={locationGroupId}
          className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10"
        >
          <h3
            id={locationGroupId}
            className="text-sm font-semibold uppercase tracking-wider text-foreground"
          >
            Location
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Set your home city so we can surface nearby events.
          </p>
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
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary/50"
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
            {cities.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">Loading locations…</p>
            )}
          </RadioGroup>
        </div>

        {/* Interests */}
        <div
          role="group"
          aria-labelledby={interestsGroupId}
          className="rounded-[var(--radius-xl,17px)] bg-card p-5 ring-1 ring-foreground/10"
        >
          <h3
            id={interestsGroupId}
            className="text-sm font-semibold uppercase tracking-wider text-foreground"
          >
            Interests
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the categories you care about to personalize discovery.
          </p>
          <div className="mt-4 space-y-4">
            {Object.entries(categoryGroups).map(([group, cats]) => (
              <div key={group}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
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
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">Loading categories…</p>
            )}
          </div>
        </div>
      </div>

      {/* Screen-reader saving status */}
      <p className="sr-only" role="status" aria-live="polite">
        {isSaving ? "Saving your changes" : ""}
      </p>

      <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-2 border-t border-border bg-background py-4">
        <Button variant="outline" type="button" onClick={() => router.push("/profile")}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
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
