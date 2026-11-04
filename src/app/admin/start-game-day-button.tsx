"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryAction } from "@/components/ui/list";

export function StartGameDayButton({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const res = await fetch(`/api/game-days/${gameDayId}/start`, { method: "POST" });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <PrimaryAction onClick={onClick} disabled={loading} testId="start-game-day">
      {loading ? "Startet…" : "Spieltag starten"}
    </PrimaryAction>
  );
}
