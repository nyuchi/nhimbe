import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Same font trio as the public app so the shared components render with the
// design system's --font-sans/--font-serif/--font-mono variables resolved.
const notoSans = Noto_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const notoSerif = Noto_Serif({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Mukoko Events Admin",
    template: "%s | Mukoko Events Admin",
  },
  description: "Internal administration dashboard for Nhimbe — Mukoko Events.",
  // Internal tool — never index, whatever domain it's served from.
  robots: { index: false, follow: false },
  icons: {
    // The one Mukoko icon: the full-colour Seed-of-Life flower (same files as
    // the public app — the mono/tinted marks are never used on any tool).
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon-32.png",
  },
};

// Same pre-hydration theme script as the public app (shared localStorage key,
// so an admin who toggled dark mode on nhimbe.com gets the same theme here).
const themeScript = `
  (function() {
    try {
      var stored = localStorage.getItem('nhimbe-theme');
      var theme;
      if (stored === 'light' || stored === 'dark') {
        theme = stored;
      } else {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.classList.add(theme);
    } catch (e) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script
          id="nhimbe-admin-theme-script"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body
        className={`${notoSans.variable} ${notoSerif.variable} ${jetBrainsMono.variable} antialiased min-h-dvh bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
