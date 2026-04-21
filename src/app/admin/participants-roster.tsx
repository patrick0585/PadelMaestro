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

export type ParticipantAttendance = "pending" | "confirmed" | "declined";

export interface RosterRow {
  playerId: string;
  name: string;
  attendance: ParticipantAttendance;
}

const POOL = "pool";
const ROSTER = "roster";
type Zone = typeof POOL | typeof ROSTER;

function PlayerCard({
  row,
  dimmed,
  onMove,
}: {
  row: RosterRow;
  dimmed: boolean;
  onMove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.playerId,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const toRoster = row.attendance !== "confirmed";
  const zoneLabel = row.attendance === "confirmed" ? "Dabei" : "Pool";
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={`${row.name}, aktuell ${zoneLabel}. Ziehen zum Verschieben.`}
      className={`flex items-center justify-between rounded-xl border border-border bg-surface p-3 touch-none select-none cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      } ${dimmed ? "opacity-60" : ""}`}
    >
      <span className="flex-1 text-sm font-medium text-foreground">{row.name}</span>
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
      void patch(playerId, "confirmed");
    } else if (zone === POOL && row.attendance === "confirmed") {
      void patch(playerId, "pending");
    }
  }

  const pool = local.filter((r) => r.attendance !== "confirmed");
  const roster = local.filter((r) => r.attendance === "confirmed");

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
                onMove={() => patch(r.playerId, "confirmed")}
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
                onMove={() => patch(r.playerId, "pending")}
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
    </div>
  );
}
