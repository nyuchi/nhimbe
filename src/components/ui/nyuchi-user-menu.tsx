"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import Link from "next/link";
import { LogOut, Settings, User, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ═══════════════════════════════════════════════════════════════
   nyuchi user menu — brand identity component.

   Avatar + name trigger opening an account dropdown (profile,
   settings, custom items, sign out). Ported from mzizi and rewired
   onto nhimbe's Avatar / DropdownMenu primitives and the harness.
   ═══════════════════════════════════════════════════════════════ */

interface UserMenuItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
}

interface NyuchiUserMenuProps {
  /** User display name. */
  name: string;
  /** User email. */
  email?: string;
  /** Avatar image URL. */
  avatarUrl?: string;
  /** Trust badge rendered inline with the name in the dropdown label. */
  badge?: React.ReactNode;
  /** Called when Sign Out is clicked. */
  onSignOut?: () => void;
  /** Extra menu items rendered before the sign-out group. */
  children?: React.ReactNode;
  /** Navigation items (defaults to Profile + Settings). */
  menuItems?: UserMenuItem[];
  /** Hide the name/email text next to the avatar (icon-only trigger). */
  compact?: boolean;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function NyuchiUserMenu({
  name,
  email,
  avatarUrl,
  badge,
  onSignOut,
  children,
  menuItems = [],
  compact = false,
  className,
}: NyuchiUserMenuProps) {
  useNyuchiHarness("user-menu");

  const defaultItems: UserMenuItem[] = [
    { label: "Profile", icon: User, href: "/profile" },
    { label: "Settings", icon: Settings, href: "/profile/edit" },
  ];
  const items = menuItems.length > 0 ? menuItems : defaultItems;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-slot="nyuchi-user-menu"
          aria-label="Account menu"
          className={cn(
            "flex min-h-[44px] items-center gap-2 rounded-full p-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
            className,
          )}
        >
          <Avatar className="size-8">
            <AvatarImage src={avatarUrl} alt={name} />
            <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
          </Avatar>
          {!compact && (
            <>
              <div className="hidden flex-col sm:flex">
                <span className="text-sm font-medium leading-none">{name}</span>
                {email && <span className="text-xs text-muted-foreground">{email}</span>}
              </div>
              <ChevronsUpDown className="ml-auto hidden size-4 text-muted-foreground sm:block" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <span className="flex items-center gap-1.5 text-sm font-medium leading-none">
              {name}
              {badge}
            </span>
            {email && <span className="text-xs leading-none text-muted-foreground">{email}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.label} onClick={item.onClick} asChild={!!item.href}>
                {item.href ? (
                  <Link href={item.href}>
                    {Icon && <Icon className="mr-2 size-4" />}
                    {item.label}
                  </Link>
                ) : (
                  <>
                    {Icon && <Icon className="mr-2 size-4" />}
                    {item.label}
                  </>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        {children && (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        )}
        {onSignOut && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { NyuchiUserMenu };
export type { NyuchiUserMenuProps, UserMenuItem };
