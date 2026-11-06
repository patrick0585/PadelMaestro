import { PadelLogo } from "@/components/padel-logo";
import { publicSignupEnabled } from "@/lib/flags";
import { appleConfigured } from "@/lib/auth/apple/config";
import { CourtBackdrop } from "./court-backdrop";
import { StartActions } from "./start-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <CourtBackdrop />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[400px] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 font-display text-[15px] font-extrabold uppercase tracking-[0.16em] text-foreground">
          <PadelLogo className="size-[26px]" />
          Padelmaestro
        </div>
        <div className="mt-auto pt-32">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Für eure Padel-Runde
          </p>
          <h1 className="mb-2.5 mt-2 font-display text-[clamp(44px,14vw,52px)] font-extrabold uppercase leading-[0.9] text-foreground">
            Spielen.
            <br />
            Eintragen.
            <br />
            <span className="text-lime">Aufsteigen.</span>
          </h1>
          <p className="max-w-[17rem] text-sm text-foreground-muted">
            Spieltage planen, Punkte am Platz zählen, Saison-Rangliste live.
          </p>
        </div>
        <StartActions
          appleConfigured={appleConfigured()}
          signupOpen={publicSignupEnabled()}
          next={typeof next === "string" ? next : undefined}
        />
      </main>
    </div>
  );
}
