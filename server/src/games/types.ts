import type { GameId } from "../../../shared/protocol.js";

export interface GamePlayer {
  id: string;
  name: string;
}

export interface GameContext {
  /** Players in seat order at the moment the game started. */
  players: GamePlayer[];
  /** Push fresh views to every player in the room. */
  update(): void;
  /** Schedule a callback; all timers are cleared when the game ends. */
  setTimer(fn: () => void, ms: number): void;
  clearTimers(): void;
  random(): number;
  /** The room's current host, who controls setup and round changes. */
  hostId(): string;
}

export interface GameInstance {
  getView(playerId: string): unknown;
  /** Throws GameError for invalid moves. */
  handleAction(playerId: string, action: { type: string; [key: string]: unknown }): void;
}

export interface GameDefinition {
  id: GameId;
  create(ctx: GameContext, options: Record<string, unknown>): GameInstance;
}

/** An error whose message is safe to show to the player. */
export class GameError extends Error {}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
