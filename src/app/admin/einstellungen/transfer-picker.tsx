"use client";
import { Dialog } from "@/components/ui/dialog";
import { GroupedList, ListRow } from "@/components/ui/list";

export function TransferPicker({
  open,
  onClose,
  candidates,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  candidates: Array<{ id: string; name: string }>;
  onPick: (candidate: { id: string; name: string }) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Neuen Besitzer wählen">
      <GroupedList>
        {candidates.map((c) => (
          <ListRow key={c.id} title={c.name} chevron onClick={() => onPick(c)} />
        ))}
      </GroupedList>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 min-h-11 w-full rounded text-[14.5px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Abbrechen
      </button>
    </Dialog>
  );
}
