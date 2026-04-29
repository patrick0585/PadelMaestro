import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Padelmaestro",
  description: "Paarungen und Rangliste für unsere Padel-Gruppe",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: "Padelmaestro",
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  // viewportFit=cover lets the app paint into the iPhone notch / Dynamic
  // Island area. Without it the standalone app gets letterboxed by safe
  // areas on devices with non-rectangular displays.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
