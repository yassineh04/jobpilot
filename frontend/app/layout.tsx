import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { THEME_BOOTSTRAP, ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: { default: "JobPilot", template: "%s · JobPilot" },
  description: "Turn your job search history into structured, actionable insight.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#100f0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script adds classes before hydration, hence suppressHydrationWarning
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
