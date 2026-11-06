"use client";
import Link from "next/link";
import { Mail } from "lucide-react";
import { AppleButton, useAppleAvailable } from "@/components/apple-button";
import { withNext } from "@/lib/auth/next-path";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const MAIL_BASE = `flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold motion-reduce:transition-none ${FOCUS}`;
const MAIL_OUTLINE = `${MAIL_BASE} border border-border-strong bg-surface/70 text-foreground transition-colors hover:bg-surface-muted`;
const MAIL_PRIMARY = `${MAIL_BASE} bg-[image:var(--cta-gradient)] text-background shadow-[0_6px_14px_-4px_rgba(34,211,238,0.35)] transition-[filter] hover:brightness-110`;
const TEXT_LINK = `rounded underline decoration-border-strong underline-offset-2 hover:text-foreground ${FOCUS}`;

interface StartActionsProps {
  appleConfigured: boolean;
  signupOpen: boolean;
  next?: string;
}

export function StartActions({ appleConfigured, signupOpen, next }: StartActionsProps) {
  const appleShown = useAppleAvailable() && appleConfigured;

  return (
    <div className="relative mt-7 flex flex-col gap-2.5">
      {appleShown && <AppleButton label="Mit Apple fortfahren" next={next} />}
      <Link
        href={withNext("/login/email", next)}
        data-mail-link
        className={appleShown ? MAIL_OUTLINE : MAIL_PRIMARY}
      >
        <Mail aria-hidden="true" className={`size-[17px] ${appleShown ? "text-foreground-muted" : ""}`} />
        Mit E-Mail anmelden
      </Link>
      {signupOpen && (
        <Link
          href={withNext("/registrieren", next)}
          className={`mt-1 flex min-h-11 items-center justify-center rounded-xl text-[13px] text-foreground-muted ${FOCUS}`}
        >
          <span>
            Neu hier? <b className="font-semibold text-primary">Konto erstellen</b>
          </span>
        </Link>
      )}
      <p className="mt-2 text-center text-[11px] leading-relaxed text-foreground-muted">
        Mit dem Fortfahren akzeptierst du die{" "}
        <Link href="/nutzungsbedingungen" className={TEXT_LINK}>
          Nutzungsbedingungen
        </Link>{" "}
        und die{" "}
        <Link href="/datenschutz" className={TEXT_LINK}>
          Datenschutzerklärung
        </Link>
        .
      </p>
    </div>
  );
}
