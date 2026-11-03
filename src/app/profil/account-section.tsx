"use client";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteAccountDialog } from "./delete-account-dialog";

const EXPORT_LINK_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong bg-surface px-4 text-sm font-semibold text-foreground transition-all hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function AccountSection({ hasPassword }: { hasPassword: boolean }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Konto</h2>
        <p className="text-sm text-foreground-muted">
          {hasPassword
            ? "Lade alle deine Daten als JSON herunter oder lösche dein Konto."
            : "Lade alle deine Daten als JSON herunter."}
        </p>
        <div>
          <a href="/api/profile/export" download className={EXPORT_LINK_CLASS}>
            Daten exportieren
          </a>
        </div>
        {hasPassword ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground-muted">
              Löscht dein Konto und entfernt dich aus allen Gruppen. Deine Spielergebnisse bleiben ohne
              deinen Namen erhalten.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 !border-transparent !text-destructive"
              onClick={() => setDeleting(true)}
            >
              Konto löschen
            </Button>
            <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
          </div>
        ) : (
          <p className="text-sm text-foreground-muted">
            Dieses Konto hat kein Passwort und kann nur von einem Admin entfernt werden.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
