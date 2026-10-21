import { useEffect, useState } from "react";
import type { RoomView } from "../../shared/protocol";

/** Seconds left until the given timestamp, updated a few times a second. */
export function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

export function nameOf(room: RoomView, id: string | null | undefined): string {
  const player = room.players.find((p) => p.id === id);
  if (!player) return "Ayrılan oyuncu";
  return player.bot ? `${player.name} (bot)` : player.name;
}
