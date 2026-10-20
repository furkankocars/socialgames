// Types shared by the server and the client. Kept dependency-free so both sides
// can import them through a relative path.

export type GameId = "tabu" | "vampir" | "okey" | "okey101";

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

export const GAMES: GameInfo[] = [
  {
    id: "tabu",
    name: "Tabu",
    description: "İki takım, yasaklı kelimeleri kullanmadan anlat.",
    minPlayers: 4,
    maxPlayers: 16,
  },
  {
    id: "vampir",
    name: "Vampir Köylü",
    description: "Geceleri vampirler avlanır, gündüz köy oylar.",
    minPlayers: 4,
    maxPlayers: 16,
  },
  {
    id: "okey",
    name: "Okey",
    description: "Klasik 4 kişilik okey. Elini diz, ilk biten kazanır.",
    minPlayers: 4,
    maxPlayers: 4,
  },
  {
    id: "okey101",
    name: "101 Okey",
    description: "101 sayıyla el aç, masaya işle, en az ceza alan kazanır.",
    minPlayers: 4,
    maxPlayers: 4,
  },
];

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
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
  "game:action": (action: { type: string; [key: string]: unknown }, ack: (res: Ack) => void) => void;
}

export interface ServerToClient {
  "room:state": (room: RoomView | null) => void;
}
