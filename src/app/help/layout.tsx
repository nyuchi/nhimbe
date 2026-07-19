import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help & FAQ",
  description: "Get help with Nhimbe — find answers to common questions.",
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
