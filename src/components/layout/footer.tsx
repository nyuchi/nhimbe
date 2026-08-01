"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useFeedback } from "@/components/feedback/feedback-provider";

const platformLinks = [
  { href: "/discover", label: "Discover" },
  { href: "/events", label: "All Events" },
  { href: "/circles", label: "Circles" },
  { href: "/calendar", label: "Calendar" },
  { href: "/map", label: "Map" },
  { href: "/search", label: "Search" },
  { href: "/events/create", label: "Create an Event" },
];

const accountLinks = [
  { href: "/my-events", label: "My Events" },
  { href: "/profile", label: "Profile" },
  { href: "/profile/entities", label: "Manage Entities" },
];

const companyLinks = [
  { href: "/about", label: "About Nhimbe" },
  { href: "/help", label: "Help Centre" },
  { href: "https://mukoko.com", label: "Mukoko", external: true },
];

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
];

interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

function FooterColumn({
  title,
  links,
  children,
}: {
  title: string;
  links: FooterLink[];
  /** Extra list items appended after the links (e.g. a feedback button). */
  children?: ReactNode;
}) {
  return (
    <nav aria-label={title}>
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <ul className="space-y-3">
        {links.map((link) =>
          link.external ? (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            </li>
          ) : (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ),
        )}
        {children}
      </ul>
    </nav>
  );
}

export function Footer() {
  const { open } = useFeedback();
  return (
    <footer className="border-t border-elevated mt-20 pb-[env(safe-area-inset-bottom,0px)]" role="contentinfo">
      <div className="max-w-300 mx-auto px-6 py-12">
        {/* Top section — brand + link columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-4">
              {/* Mukoko Seed-of-Life mark — full palette at 32px (>=32px per brand) */}
              <div className="rhino w-8 h-8 bg-surface border border-elevated">
                <Image
                  src="/mukoko-mark-full-light.svg"
                  alt="Nhimbe"
                  width={32}
                  height={32}
                  className="zebra zebra-light"
                />
                <Image
                  src="/mukoko-mark-full-dark.svg"
                  alt=""
                  aria-hidden
                  width={32}
                  height={32}
                  className="zebra zebra-dark"
                />
              </div>
              <span className="flex flex-col leading-tight">
                <span className="font-serif text-xl font-bold text-primary">Nhimbe</span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                  by Mukoko Events
                </span>
              </span>
            </Link>
            <p className="font-serif italic text-sm text-text-secondary leading-relaxed">
              &ldquo;Together we gather, together we grow&rdquo;
            </p>
          </div>

          <FooterColumn title="Platform" links={platformLinks} />
          <FooterColumn title="Account" links={accountLinks} />
          <FooterColumn title="Company" links={companyLinks}>
            <li>
              <button
                type="button"
                onClick={() => open()}
                className="text-left text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                Send feedback
              </button>
            </li>
          </FooterColumn>
          <FooterColumn title="Legal" links={legalLinks} />
        </div>

        {/* Bottom bar — copyright + theme toggle */}
        <div className="mt-12 pt-8 border-t border-elevated flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-text-tertiary">
            © {new Date().getFullYear()} Nyuchi Africa. All rights reserved. A{" "}
            <a
              href="https://mukoko.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary font-semibold hover:underline"
            >
              Mukoko
            </a>{" "}
            product.
          </p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
