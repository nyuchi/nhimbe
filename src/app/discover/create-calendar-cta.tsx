"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCalendarModal } from "@/components/modals/calendar-modal";
import { useAuth } from "@/components/auth/auth-context";

/** "Create a calendar" entry point for the Discover featured-calendars section. */
export function CreateCalendarCta() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(true)}
        className="shrink-0 gap-1.5 rounded-full text-sm"
      >
        <Plus className="w-4 h-4" aria-hidden />
        Create a calendar
      </Button>
      <CreateCalendarModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCreated={(result) => router.push(`/calendars/${result.slug}`)}
      />
    </>
  );
}
