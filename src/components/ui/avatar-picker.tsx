"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Upload, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AVATAR_STICKERS } from "@/lib/avatar-stickers";
import { uploadMedia, getMediaUrl } from "@/lib/api";

interface AvatarPickerProps {
  name: string;
  value?: string;
  onChange: (url: string) => void;
  /** Resolve the signed-in person's Gravatar, or null if they have none set. */
  onCheckGravatar: () => Promise<string | null>;
  disabled?: boolean;
  className?: string;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function AvatarPicker({
  name,
  value,
  onChange,
  onCheckGravatar,
  disabled = false,
  className,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [checkingGravatar, setCheckingGravatar] = useState(false);
  const [gravatarNotFound, setGravatarNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stickersId = useId();

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { key } = await uploadMedia(file);
      onChange(getMediaUrl(key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleGravatar() {
    setError(null);
    setGravatarNotFound(false);
    setCheckingGravatar(true);
    try {
      const url = await onCheckGravatar();
      if (url) {
        onChange(url);
      } else {
        setGravatarNotFound(true);
      }
    } catch {
      setError("Couldn't reach Gravatar. Try again later.");
    } finally {
      setCheckingGravatar(false);
    }
  }

  const busy = uploading || checkingGravatar || disabled;

  return (
    <div data-slot="avatar-picker" className={cn("space-y-4", className)}>
      <div className="flex items-center gap-4">
        <div
          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary"
          aria-hidden="true"
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-primary-foreground">{initialsOf(name)}</span>
          )}
        </div>

        <div className="flex flex-1 flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            Upload photo
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={handleGravatar}>
            {checkingGravatar ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            Use Gravatar
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            aria-label="Upload a profile photo"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {gravatarNotFound && (
        <p className="text-sm text-muted-foreground" role="status">
          No Gravatar found for your email — try uploading a photo or picking a sticker instead.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div role="group" aria-labelledby={stickersId}>
        <p id={stickersId} className="mb-2 text-sm text-muted-foreground">
          Or pick a sticker
        </p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              disabled={busy}
              aria-label={`Use the ${sticker.label} sticker as your avatar`}
              aria-pressed={value === sticker.dataUri}
              onClick={() => onChange(sticker.dataUri)}
              className={cn(
                "flex size-11 items-center justify-center overflow-hidden rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                value === sticker.dataUri && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sticker.dataUri} alt="" className="size-full" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export { AvatarPicker };
export type { AvatarPickerProps };
