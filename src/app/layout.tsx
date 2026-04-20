import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Padel Tracker",
  description: "Paarungen und Rangliste für unsere Padel-Gruppe",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
