import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal-footer";
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
    <div className="px-4 py-8">
      <article className="mx-auto w-full max-w-2xl">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-12 w-12" />
          <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
          <p className="text-sm text-foreground-muted">Stand: {date}</p>
        </div>
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2:first-child]:mt-0 [&_h3]:mt-4 [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h3]:text-sm [&_li]:mt-1 [&_ul]:space-y-1 [&_ol]:space-y-1 [&_a]:break-words [&_strong]:font-semibold">
          {children}
        </div>
      </article>
      <LegalFooter showHome />
    </div>
  );
}
