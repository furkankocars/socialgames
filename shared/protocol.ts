// Types shared by the server and the client. Kept dependency-free so both sides
// can import them through a relative path.

export type GameId = "tabu" | "vampir" | "okey" | "okey101" | "pisti";

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** Whether the host can fill empty seats with bots. */
  bots: boolean;
  /** The only table sizes allowed, when not every count between min and max works. */
  playerCounts?: number[];
}

export const GAMES: GameInfo[] = [
  {
    id: "tabu",
    name: "Tabu",
    description: "İki takım, yasaklı kelimeleri kullanmadan anlat.",
    minPlayers: 4,
    maxPlayers: 16,
    // Bots can neither describe nor guess words.
    bots: false,
  },
  {
    id: "vampir",
    name: "Vampir Köylü",
    description: "Geceleri vampirler avlanır, gündüz köy oylar.",
    minPlayers: 4,
    maxPlayers: 16,
    bots: true,
  },
  {
    id: "okey",
    name: "Okey",
    description: "Klasik 4 kişilik okey. Elini diz, ilk biten kazanır.",
    minPlayers: 4,
    maxPlayers: 4,
    bots: true,
  },
  {
    id: "okey101",
    name: "101 Okey",
    description: "101 sayıyla el aç, masaya işle, en az ceza alan kazanır.",
    minPlayers: 4,
    maxPlayers: 4,
    bots: true,
  },
  {
    id: "pisti",
    name: "Pişti",
    description: "Yerdeki kartı aynısıyla ya da valeyle topla, tek karta pişti yap.",
    minPlayers: 2,
    maxPlayers: 4,
    bots: true,
    playerCounts: [2, 4],
  },
];

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  /** A bot plays this seat: one the host added, or one standing in for a player who left. */
  bot: boolean;
}

/** Drinks a player can send across the table, as in a kahvehane. */
export type Treat = "cay" | "kahve" | "oralet" | "soda";

export const TREATS: { id: Treat; name: string }[] = [
  { id: "cay", name: "Çay" },
  { id: "kahve", name: "Türk kahvesi" },
  { id: "oralet", name: "Oralet" },
  { id: "soda", name: "Soda" },
];

export interface ChatEntry {
  id: number;
  at: number;
  from: string;
  /** Sender's name when the line was written, so it survives them leaving. */
  name: string;
  text?: string;
  treat?: Treat;
  /** Who the treat is for; null means the whole table. */
  to?: string | null;
}

export interface RoomView {
  code: string;
  hostId: string;
  you: string;
  players: PlayerView[];
  selectedGame: GameId;
  status: "lobby" | "playing";
  /** Game-specific view, already filtered for the receiving player. */
  game: unknown;
  /** Latest table chat lines, oldest first. */
  chat: ChatEntry[];
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServer {
  hello: (data: { token: string }, ack: (res: Ack<{ playerId: string }>) => void) => void;
  "room:create": (data: { name: string }, ack: (res: Ack<{ code: string }>) => void) => void;
  "room:join": (data: { code: string; name: string }, ack: (res: Ack<{ code: string }>) => void) => void;
  "room:leave": (ack: (res: Ack) => void) => void;
  "room:selectGame": (data: { gameId: GameId }, ack: (res: Ack) => void) => void;
  "room:start": (data: { options?: Record<string, unknown> }, ack: (res: Ack) => void) => void;
  "room:backToLobby": (ack: (res: Ack) => void) => void;
  "room:kick": (data: { playerId: string }, ack: (res: Ack) => void) => void;
  "room:addBot": (ack: (res: Ack) => void) => void;
  "room:chat": (data: { text?: string; treat?: Treat; to?: string | null }, ack: (res: Ack) => void) => void;
  "game:action": (action: { type: string; [key: string]: unknown }, ack: (res: Ack) => void) => void;
}

export interface ServerToClient {
  "room:state": (room: RoomView | null) => void;
}
