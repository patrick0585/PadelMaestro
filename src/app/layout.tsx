import type { Metadata, Viewport } from "next";
import { Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { NativeSplashHide } from "@/components/native-splash-hide";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Padelmaestro",
  description: "Spieltage, Ergebnisse und Rangliste für deine Padel-Gruppe",
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
    <html lang="de" className={display.variable}>
      <body className="antialiased">
        <NativeSplashHide />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
