"use client";

import * as React from "react";
import { NyuchiShareCard, type ShareTarget } from "@/components/ui/nyuchi-share-card";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  description?: string;
  /** Preview image for the share sheet. */
  imageUrl?: string;
  className?: string;
}

/**
 * ShareDialog — thin wrapper around the branded {@link NyuchiShareCard}
 * bottom sheet. The public props are preserved so existing call sites
 * (event actions, event sidebar) upgrade to the branded share flow
 * without changes: copy-link with a copied state, native Web Share, and
 * WhatsApp / X / Email targets.
 */
function ShareDialog({
  open,
  onOpenChange,
  url,
  title = "Share",
  description,
  imageUrl,
  className,
}: ShareDialogProps) {
  const [copied, setCopied] = React.useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const openExternal = (href: string) => {
    if (typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — leave state untouched.
    }
  };

  const handleNativeShare =
    typeof navigator !== "undefined" && "share" in navigator
      ? () => {
          navigator.share({ title, text: description, url }).catch(() => {
            // User cancelled or share failed silently.
          });
        }
      : undefined;

  const targets: ShareTarget[] = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: "💬",
      onShare: () => openExternal(`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`),
    },
    {
      id: "x",
      label: "X",
      icon: "𝕏",
      onShare: () =>
        openExternal(`https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`),
    },
    {
      id: "email",
      label: "Email",
      icon: "✉️",
      onShare: () => openExternal(`mailto:?subject=${encodedTitle}&body=${encodedUrl}`),
    },
  ];

  return (
    <NyuchiShareCard
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      subtitle={description}
      imageUrl={imageUrl}
      url={url}
      sourceApp="Nhimbe"
      copied={copied}
      onCopyLink={handleCopyLink}
      onNativeShare={handleNativeShare}
      targets={targets}
      className={className}
    />
  );
}

export { ShareDialog };
export type { ShareDialogProps };
