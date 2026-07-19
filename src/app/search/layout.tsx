import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search",
  description: "Search for events, venues, and categories on Nhimbe.",
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
