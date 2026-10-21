import type { GameContext } from "../src/games/types.js";

/** Deterministic pseudo-random numbers for repeatable tests. */
export function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function fakeContext(count: number, seed = 1) {
  const timers: (() => void)[] = [];
  const bots = new Set<string>();
  const ctx: GameContext = {
    players: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Oyuncu ${i}` })),
    update: () => {},
    setTimer: (fn) => timers.push(fn),
    clearTimers: () => (timers.length = 0),
    random: seeded(seed),
    hostId: () => "p0",
    isBot: (id) => bots.has(id),
  };
  return { ctx, bots, runTimers: () => timers.splice(0).forEach((fn) => fn()) };
}
