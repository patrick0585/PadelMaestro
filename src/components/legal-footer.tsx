import Link from "next/link";

const ITEM_CLASS =
  "inline-flex min-h-11 items-center rounded-lg px-1 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const LINKS = [
  { href: "/support", label: "Hilfe" },
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/nutzungsbedingungen", label: "Nutzungsbedingungen" },
];

export function LegalFooter({ showHome = false }: { showHome?: boolean }) {
  return (
    <nav
      aria-label="Rechtliches"
      className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-foreground-muted"
    >
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={ITEM_CLASS}>
          {l.label}
        </Link>
      ))}
      {showHome && (
        <Link href="/" className={`${ITEM_CLASS} font-semibold text-primary`}>
          Zur Startseite
        </Link>
      )}
    </nav>
  );
}
