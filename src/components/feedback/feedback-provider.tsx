"use client";

/**
 * Feedback / report-a-problem — global provider + dialog.
 *
 * Mounted once near the root of the app so any surface can open the same
 * accessible report form: a footer link, the profile Support section, and the
 * error boundaries ("Report this problem", prefilled with the error digest).
 *
 * The form auto-captures the current path (`usePathname`) and the browser
 * `navigator.userAgent` client-side, then hands everything to the never-throw
 * `submitFeedback` server action (which records to `system.feedback` and/or
 * emails support). Signed-out reporters may add a contact email; signed-in
 * reporters are identified server-side via `resolveActingPerson`.
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { MessageSquareWarning, Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-context";
import { useToast } from "@/hooks/use-toast";
import { submitFeedback } from "@/app/actions/feedback";
import type { FeedbackCategory } from "@/lib/mongo/feedback";
import {
  FeedbackContext,
  type FeedbackContextValue,
  type FeedbackPrefill,
} from "./feedback-context";

export { useFeedback } from "./feedback-context";
export type { FeedbackPrefill } from "./feedback-context";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Report a bug",
  idea: "Share an idea",
  other: "Something else",
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = React.useState(false);
  const [category, setCategory] = React.useState<FeedbackCategory>("bug");
  const [message, setMessage] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [errorDigest, setErrorDigest] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  const open = React.useCallback((prefill?: FeedbackPrefill) => {
    setCategory(prefill?.category ?? "bug");
    setMessage(prefill?.message ?? "");
    setErrorDigest(prefill?.errorDigest);
    setEmail("");
    setIsOpen(true);
  }, []);

  const value = React.useMemo<FeedbackContextValue>(() => ({ open }), [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await submitFeedback({
        message,
        category,
        email: user ? undefined : email,
        path: pathname ?? undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        errorDigest,
      });
      if (result.success) {
        toast.success("Thanks — your feedback has been sent.");
        setIsOpen(false);
        setMessage("");
        setEmail("");
        setErrorDigest(undefined);
      } else {
        toast.error(result.error || "Could not send feedback. Please try again.");
      }
    } catch {
      toast.error("Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ResponsiveModal
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Send feedback"
        description="Report a problem or share an idea. We read every message."
      >
        <form onSubmit={handleSubmit} className="space-y-5 px-1 py-2">
          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="feedback-category">What kind of feedback?</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as FeedbackCategory)}
            >
              <SelectTrigger id="feedback-category" className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as FeedbackCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {CATEGORY_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="feedback-message">Your message</Label>
            <Textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              maxLength={5000}
              placeholder={
                category === "bug"
                  ? "What happened? What did you expect instead?"
                  : "Tell us what's on your mind…"
              }
              className="min-h-28"
            />
          </div>

          {/* Contact email — signed-out only */}
          {!user && (
            <div className="space-y-2">
              <Label htmlFor="feedback-email">
                Your email{" "}
                <span className="font-normal text-text-tertiary">(optional)</span>
              </Label>
              <Input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <p className="text-xs text-text-tertiary">
                Add your email if you&apos;d like us to follow up.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !message.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <MessageSquareWarning className="w-4 h-4" />
                  Send feedback
                </>
              )}
            </Button>
          </div>
        </form>
      </ResponsiveModal>
    </FeedbackContext.Provider>
  );
}
