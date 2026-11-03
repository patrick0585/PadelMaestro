import Link from "next/link";
import type { ReactNode } from "react";
import { PadelLogo } from "@/components/padel-logo";

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  const date = new Date(updatedAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <article className="mx-auto w-full max-w-2xl">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-12 w-12" />
          <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
          <p className="text-sm text-foreground-muted">Stand: {date}</p>
        </div>
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 text-sm text-foreground [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold">
          {children}
        </div>
        <Link
          href="/login"
          className="mt-4 flex min-h-11 items-center justify-center rounded-xl text-sm text-foreground-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Zur Anmeldung
        </Link>
      </article>
    </div>
  );
}
