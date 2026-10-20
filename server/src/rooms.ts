import { GAMES, type GameId, type RoomView } from "../../shared/protocol.js";
import { GameError, type GameContext, type GameInstance } from "./games/types.js";
import { gameDefinitions } from "./games/index.js";

interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
}

interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  selectedGame: GameId;
  game: GameInstance | null;
  timers: Set<ReturnType<typeof setTimeout>>;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_NAME_LENGTH = 20;
const MAX_ROOM_PLAYERS = 16;

/** How long a disconnected player keeps their lobby seat. */
const LOBBY_GRACE_MS = 2 * 60 * 1000;

export type Notify = (playerId: string, view: RoomView | null) => void;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private roomOfPlayer = new Map<string, string>();
  private lobbyCleanup = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private notify: Notify,
    private random: () => number = Math.random,
  ) {}

  createRoom(playerId: string, rawName: string): string {
    const name = cleanName(rawName);
    this.leaveRoom(playerId);
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      hostId: playerId,
      players: [{ id: playerId, name, connected: true }],
      selectedGame: "tabu",
      game: null,
      timers: new Set(),
    };
    this.rooms.set(code, room);
    this.roomOfPlayer.set(playerId, code);
    this.broadcast(room);
    return code;
  }

  joinRoom(playerId: string, rawCode: string, rawName: string): string {
    const name = cleanName(rawName);
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new GameError("Oda bulunamadı.");
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.name = name;
      existing.connected = true;
    } else {
      if (room.game) throw new GameError("Oyun başladı, bitmesini bekle.");
      if (room.players.length >= MAX_ROOM_PLAYERS) throw new GameError("Oda dolu.");
      this.leaveRoom(playerId);
      room.players.push({ id: playerId, name, connected: true });
      this.roomOfPlayer.set(playerId, code);
    }
    this.broadcast(room);
    return code;
  }

  leaveRoom(playerId: string): void {
    const room = this.roomFor(playerId);
    if (!room) return;
    this.roomOfPlayer.delete(playerId);
    room.players = room.players.filter((p) => p.id !== playerId);
    this.notify(playerId, null);
    if (room.players.length === 0) {
      this.clearTimers(room);
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) this.pickNewHost(room);
    // A player who walks out of a running game ends it for everyone.
    if (room.game) this.endGame(room);
    this.broadcast(room);
  }

  /** Called when a player's last socket connects. */
  setConnected(playerId: string, connected: boolean): void {
    const room = this.roomFor(playerId);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId)!;
    player.connected = connected;
    const pending = this.lobbyCleanup.get(playerId);
    if (pending) {
      clearTimeout(pending);
      this.lobbyCleanup.delete(playerId);
    }
    if (!connected) {
      if (room.hostId === playerId) this.pickNewHost(room);
      this.lobbyCleanup.set(
        playerId,
        setTimeout(() => {
          this.lobbyCleanup.delete(playerId);
          const r = this.roomFor(playerId);
          const p = r?.players.find((x) => x.id === playerId);
          if (r && p && !p.connected && !r.game) this.leaveRoom(playerId);
        }, LOBBY_GRACE_MS),
      );
    }
    this.broadcast(room);
  }

  selectGame(playerId: string, gameId: GameId): void {
    const room = this.hostRoom(playerId);
    if (room.game) throw new GameError("Oyun devam ediyor.");
    if (!GAMES.some((g) => g.id === gameId)) throw new GameError("Bilinmeyen oyun.");
    room.selectedGame = gameId;
    this.broadcast(room);
  }

  startGame(playerId: string, options: Record<string, unknown>): void {
    const room = this.hostRoom(playerId);
    if (room.game) throw new GameError("Oyun zaten başladı.");
    const info = GAMES.find((g) => g.id === room.selectedGame)!;
    const players = room.players.filter((p) => p.connected);
    if (players.length < info.minPlayers) throw new GameError(`${info.name} için en az ${info.minPlayers} oyuncu gerekli.`);
    if (players.length > info.maxPlayers) throw new GameError(`${info.name} en fazla ${info.maxPlayers} kişiyle oynanır.`);
    const ctx: GameContext = {
      players: players.map((p) => ({ id: p.id, name: p.name })),
      update: () => this.broadcast(room),
      setTimer: (fn, ms) => {
        const t = setTimeout(() => {
          room.timers.delete(t);
          fn();
        }, ms);
        room.timers.add(t);
      },
      clearTimers: () => this.clearTimers(room),
      random: this.random,
      hostId: () => room.hostId,
    };
    room.game = gameDefinitions[room.selectedGame].create(ctx, options);
    this.broadcast(room);
  }

  backToLobby(playerId: string): void {
    const room = this.hostRoom(playerId);
    this.endGame(room);
    this.broadcast(room);
  }

  kick(playerId: string, target: string): void {
    const room = this.hostRoom(playerId);
    if (target === playerId) throw new GameError("Kendini atamazsın.");
    if (!room.players.some((p) => p.id === target)) throw new GameError("Oyuncu bulunamadı.");
    this.leaveRoom(target);
  }

  gameAction(playerId: string, action: { type: string; [key: string]: unknown }): void {
    const room = this.roomFor(playerId);
    if (!room?.game) throw new GameError("Aktif oyun yok.");
    room.game.handleAction(playerId, action);
    this.broadcast(room);
  }

  /** Re-send the current state to a player (e.g. after reconnecting). */
  resend(playerId: string): void {
    const room = this.roomFor(playerId);
    this.notify(playerId, room ? this.viewFor(room, playerId) : null);
  }

  private endGame(room: Room) {
    this.clearTimers(room);
    room.game = null;
  }

  private clearTimers(room: Room) {
    for (const t of room.timers) clearTimeout(t);
    room.timers.clear();
  }

  private pickNewHost(room: Room) {
    const next = room.players.find((p) => p.connected && p.id !== room.hostId) ?? room.players.find((p) => p.id !== room.hostId);
    if (next) room.hostId = next.id;
  }

  private roomFor(playerId: string): Room | undefined {
    const code = this.roomOfPlayer.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  private hostRoom(playerId: string): Room {
    const room = this.roomFor(playerId);
    if (!room) throw new GameError("Bir odada değilsin.");
    if (room.hostId !== playerId) throw new GameError("Bunu sadece oda sahibi yapabilir.");
    return room;
  }

  private viewFor(room: Room, playerId: string): RoomView {
    return {
      code: room.code,
      hostId: room.hostId,
      you: playerId,
      players: room.players.map((p) => ({ ...p })),
      selectedGame: room.selectedGame,
      status: room.game ? "playing" : "lobby",
      game: room.game ? room.game.getView(playerId) : null,
    };
  }

  private broadcast(room: Room) {
    for (const p of room.players) this.notify(p.id, this.viewFor(room, p.id));
  }
}

function cleanName(name: string): string {
  const trimmed = String(name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) throw new GameError("İsim boş olamaz.");
  return trimmed;
}
