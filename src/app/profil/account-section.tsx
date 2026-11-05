"use client";
import { useState } from "react";
import { GroupedList, ListRow, SectionFooter, SectionLabel } from "@/components/ui/list";
import { DeleteAccountDialog } from "./delete-account-dialog";

const EXPORT_ROW_CLASS =
  "flex min-h-11 w-full items-center px-3 py-2.5 text-[14.5px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";

export function AccountSection({ hasPassword }: { hasPassword: boolean }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <section>
      <SectionLabel>Daten</SectionLabel>
      <GroupedList>
        <a href="/api/profile/export" download className={EXPORT_ROW_CLASS}>
          Daten exportieren
        </a>
        {hasPassword && <ListRow title="Konto löschen" tone="destructive" onClick={() => setDeleting(true)} />}
      </GroupedList>
      <SectionFooter>
        {hasPassword
          ? "Export als JSON. Löschen entfernt dich aus allen Gruppen; deine Spielergebnisse bleiben ohne deinen Namen erhalten."
          : "Export als JSON. Dieses Konto hat kein Passwort und kann nur von einem Admin entfernt werden."}
      </SectionFooter>
      {hasPassword && <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />}
    </section>
  );
}
