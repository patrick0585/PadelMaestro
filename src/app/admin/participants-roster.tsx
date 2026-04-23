"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { JokerConfirmDialog } from "@/components/joker-confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ParticipantAttendance = "pending" | "confirmed" | "declined" | "joker";

export interface RosterRow {
  playerId: string;
  name: string;
  attendance: ParticipantAttendance;
  jokersRemaining: number;
}

const POOL = "pool";
const ROSTER = "roster";
type Zone = typeof POOL | typeof ROSTER;

function PlayerCard({
  row,
  dimmed,
  busy,
  onMove,
  onSetJoker,
  onCancelJoker,
}: {
  row: RosterRow;
  dimmed: boolean;
  busy: boolean;
  onMove: () => void;
  onSetJoker: () => void;
  onCancelJoker: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.playerId,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const isAttending = row.attendance === "confirmed" || row.attendance === "joker";
  const toRoster = !isAttending;
  const zoneLabel = isAttending ? "Dabei" : "Pool";
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={`${row.name}, aktuell ${zoneLabel}. Ziehen zum Verschieben.`}
      className={`flex items-center justify-between rounded-xl border border-border bg-surface-muted p-3 touch-none select-none cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      } ${dimmed ? "opacity-60" : ""}`}
    >
      <span className="flex-1 text-sm font-medium text-foreground">
        {row.name}
        {row.attendance === "joker" && (
          <span className="ml-2 rounded-full border border-primary/50 bg-primary-soft px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-primary-strong">
            Joker
          </span>
        )}
      </span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onMove();
        }}
        aria-label={toRoster ? "Zu Dabei verschieben" : "In den Pool zurück"}
        className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      >
        {toRoster ? "→" : "←"}
      </button>
      {row.attendance === "joker" ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCancelJoker();
          }}
          disabled={busy}
          className={`ml-2 inline-flex h-8 items-center rounded-lg border border-border-strong px-2 text-xs font-semibold text-foreground hover:bg-surface-muted ${
            busy ? "opacity-60" : ""
          }`}
        >
          Joker entfernen
        </button>
      ) : row.jokersRemaining > 0 ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSetJoker();
          }}
          disabled={busy}
          className={`ml-2 inline-flex h-8 items-center rounded-lg border border-border-strong px-2 text-xs font-semibold text-foreground hover:bg-surface-muted ${
            busy ? "opacity-60" : ""
          }`}
        >
          Joker für {row.name} setzen
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="ml-2 inline-flex h-8 items-center rounded-lg border border-border px-2 text-xs font-semibold text-foreground-muted opacity-60"
        >
          Keine Joker übrig
        </button>
      )}
    </div>
  );
}

function DropColumn({
  zone,
  title,
  subtitle,
  isEmpty,
  emptyLabel,
  children,
}: {
  zone: Zone;
  title: string;
  subtitle: string;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: zone });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] rounded-xl border p-3 space-y-2 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-muted-foreground">{subtitle}</span>
      </div>
      <div className="space-y-2">{children}</div>
      {isEmpty && <p className="text-xs text-muted-foreground">{emptyLabel}</p>}
    </div>
  );
}

export function ParticipantsRoster({
  gameDayId,
  participants,
}: {
  gameDayId: string;
  participants: RosterRow[];
}) {
  const router = useRouter();
  const [local, setLocal] = useState(participants);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [jokerTarget, setJokerTarget] = useState<RosterRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RosterRow | null>(null);
  const [jokerBusy, setJokerBusy] = useState(false);

  async function adminSetJoker(row: RosterRow) {
    setJokerBusy(true);
    setError(null);
    const res = await fetch(
      `/api/game-days/${gameDayId}/participants/${row.playerId}/joker`,
      { method: "POST" },
    );
    setJokerBusy(false);
    if (res.ok) {
      setJokerTarget(null);
      router.refresh();
      return;
    }
    setError("Konnte Joker nicht setzen");
  }

  async function adminCancelJoker(row: RosterRow) {
    setJokerBusy(true);
    setError(null);
    const res = await fetch(
      `/api/game-days/${gameDayId}/participants/${row.playerId}/joker`,
      { method: "DELETE" },
    );
    setJokerBusy(false);
    if (res.ok) {
      setCancelTarget(null);
      router.refresh();
      return;
    }
    setError("Konnte Joker nicht entfernen");
  }

  useEffect(() => {
    setLocal(participants);
  }, [participants]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  async function patch(playerId: string, status: ParticipantAttendance) {
    const row = local.find((r) => r.playerId === playerId);
    if (!row) return;
    const previousStatus = row.attendance;
    setLocal((rows) =>
      rows.map((r) => (r.playerId === playerId ? { ...r, attendance: status } : r)),
    );
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
    setError(null);
    const res = await fetch(
      `/api/game-days/${gameDayId}/participants/${playerId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
    if (!res.ok) {
      setLocal((rows) =>
        rows.map((r) =>
          r.playerId === playerId ? { ...r, attendance: previousStatus } : r,
        ),
      );
      setError("Konnte Status nicht speichern");
      return;
    }
    router.refresh();
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const playerId = String(active.id);
    const overId = String(over.id);
    if (overId !== POOL && overId !== ROSTER) return;
    const zone: Zone = overId;
    const row = local.find((r) => r.playerId === playerId);
    if (!row) return;
    if (zone === ROSTER && row.attendance !== "confirmed") {
      if (row.attendance === "joker") return; // joker stays put — cancel only via explicit button
      void patch(playerId, "confirmed");
    } else if (zone === POOL && row.attendance === "confirmed") {
      void patch(playerId, "pending");
    }
    // intentionally no drag-cancel for joker: admin must click the explicit "Joker entfernen" button
  }

  const pool = local.filter((r) => r.attendance !== "confirmed" && r.attendance !== "joker");
  const roster = local.filter((r) => r.attendance === "confirmed" || r.attendance === "joker");

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DropColumn
            zone={POOL}
            title="Spielerpool"
            subtitle={`${pool.length} Spieler`}
            isEmpty={pool.length === 0}
            emptyLabel="Pool ist leer."
          >
            {pool.map((r) => (
              <PlayerCard
                key={r.playerId}
                row={r}
                dimmed={pendingIds.has(r.playerId)}
                busy={jokerBusy}
                onMove={() => patch(r.playerId, "confirmed")}
                onSetJoker={() => setJokerTarget(r)}
                onCancelJoker={() => setCancelTarget(r)}
              />
            ))}
          </DropColumn>
          <DropColumn
            zone={ROSTER}
            title="Dabei"
            subtitle={`${roster.length} / 6`}
            isEmpty={roster.length === 0}
            emptyLabel="Noch niemand dabei."
          >
            {roster.map((r) => (
              <PlayerCard
                key={r.playerId}
                row={r}
                dimmed={pendingIds.has(r.playerId)}
                busy={jokerBusy}
                onMove={() => patch(r.playerId, "pending")}
                onSetJoker={() => setJokerTarget(r)}
                onCancelJoker={() => setCancelTarget(r)}
              />
            ))}
          </DropColumn>
        </div>
      </DndContext>
      {(roster.length < 4 || roster.length > 6) && (
        <p className="text-xs text-muted-foreground">
          Für das Starten des Spieltags werden 4–6 bestätigte Spieler benötigt.
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <JokerConfirmDialog
        open={jokerTarget !== null}
        onClose={() => setJokerTarget(null)}
        onConfirm={() => jokerTarget && adminSetJoker(jokerTarget)}
        jokersRemaining={jokerTarget?.jokersRemaining ?? 0}
        ppgSnapshot={null}
        loading={jokerBusy}
        targetName={jokerTarget?.name}
      />
      <Dialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={cancelTarget ? `Joker von ${cancelTarget.name} entfernen?` : ""}
      >
        <div className="space-y-3 text-sm text-foreground">
          <p>
            Der Joker wird entfernt und die Teilnahme auf „unbestätigt“ zurückgesetzt.
            Der Slot steht wieder zur Verfügung.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelTarget(null)} disabled={jokerBusy}>
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => cancelTarget && adminCancelJoker(cancelTarget)}
              loading={jokerBusy}
            >
              Ja, entfernen
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
