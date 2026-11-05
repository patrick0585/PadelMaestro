"use client";
import { useStartGameDay } from "./start-game-day-button";
import { TICKET_ACTION_GO } from "./admin-ticket";

export function TicketStartButton({ gameDayId }: { gameDayId: string }) {
  const { start, loading, error } = useStartGameDay(gameDayId);
  return (
    <>
      <button type="button" onClick={start} disabled={loading} className={TICKET_ACTION_GO} data-testid="ticket-start">
        {loading ? "Startet…" : "Starten"}
      </button>
      {error && (
        <p role="alert" className="col-span-2 rounded-xl bg-black/35 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
    </>
  );
}
