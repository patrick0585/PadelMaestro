"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <Button size="sm" onClick={onClick} loading={loading}>
      Spieltag starten
    </Button>
  );
}
