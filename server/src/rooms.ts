import { GAMES, type GameId, type RoomView } from "../../shared/protocol.js";
import { GameError, type GameAction, type GameContext, type GameInstance } from "./games/types.js";
import { gameDefinitions } from "./games/index.js";

interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  /** A bot plays this player's seat in the running game. */
  bot: boolean;
  /** Walked out of a running game; only the bot keeps the seat until it ends. */
  left: boolean;
  /** Added by the host to fill a seat; always played by a bot. */
  robot: boolean;
}

interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  selectedGame: GameId;
  game: GameInstance | null;
  /** Players who were dealt into the running game. */
  seated: Set<string>;
  timers: Set<ReturnType<typeof setTimeout>>;
  botTimer: ReturnType<typeof setTimeout> | null;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_NAME_LENGTH = 20;
const MAX_ROOM_PLAYERS = 16;

/** How long a disconnected player keeps their lobby seat. */
const LOBBY_GRACE_MS = 2 * 60 * 1000;
/** How long a dropped player has to come back before a bot takes their seat. */
export const BOT_TAKEOVER_MS = 15 * 1000;
/** Pause before each bot move, so people can follow what happened. */
export const BOT_DELAY_MS = 1000;

export type Notify = (playerId: string, view: RoomView | null) => void;

export class RoomManager {
  private nextBotId = 1;
  private rooms = new Map<string, Room>();
  private roomOfPlayer = new Map<string, string>();
  private lobbyCleanup = new Map<string, ReturnType<typeof setTimeout>>();
  private botTakeover = new Map<string, ReturnType<typeof setTimeout>>();

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
      players: [{ id: playerId, name, connected: true, bot: false, left: false, robot: false }],
      selectedGame: "tabu",
      game: null,
      seated: new Set(),
      timers: new Set(),
      botTimer: null,
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
      // Also covers a player who left a running game and comes back to their seat.
      if (this.roomOfPlayer.get(playerId) !== code) {
        this.leaveRoom(playerId);
        this.roomOfPlayer.set(playerId, code);
      }
      this.cancelTakeover(playerId);
      existing.name = name;
      existing.connected = true;
      existing.left = false;
      existing.bot = false;
    } else {
      if (room.game) throw new GameError("Oyun başladı, bitmesini bekle.");
      if (room.players.length >= MAX_ROOM_PLAYERS) throw new GameError("Oda dolu.");
      this.leaveRoom(playerId);
      room.players.push({ id: playerId, name, connected: true, bot: false, left: false, robot: false });
      this.roomOfPlayer.set(playerId, code);
    }
    this.broadcast(room);
    return code;
  }

  leaveRoom(playerId: string): void {
    const room = this.roomFor(playerId);
    if (!room) return;
    this.roomOfPlayer.delete(playerId);
    this.cancelTakeover(playerId);
    this.notify(playerId, null);
    const player = room.players.find((p) => p.id === playerId)!;
    if (room.game && room.seated.has(playerId)) {
      // A bot finishes the game in their place; rejoining the room takes the seat back.
      player.left = true;
      player.connected = false;
      player.bot = true;
    } else {
      room.players = room.players.filter((p) => p.id !== playerId);
    }
    if (!room.players.some((p) => !p.left && !p.robot)) {
      this.deleteRoom(room);
      return;
    }
    if (room.hostId === playerId) this.pickNewHost(room);
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
    this.cancelTakeover(playerId);
    if (connected) {
      player.bot = false;
    } else {
      if (room.hostId === playerId) this.pickNewHost(room);
      this.scheduleLobbyCleanup(playerId);
      if (room.game && room.seated.has(playerId)) {
        this.botTakeover.set(
          playerId,
          setTimeout(() => {
            this.botTakeover.delete(playerId);
            const r = this.roomFor(playerId);
            const p = r?.players.find((x) => x.id === playerId);
            if (!r?.game || !p || p.connected || !r.seated.has(playerId)) return;
            p.bot = true;
            this.broadcast(r);
          }, BOT_TAKEOVER_MS),
        );
      }
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
    const players = room.players.filter((p) => p.connected && !p.left);
    if (players.length < info.minPlayers) throw new GameError(`${info.name} için en az ${info.minPlayers} oyuncu gerekli.`);
    if (players.length > info.maxPlayers) throw new GameError(`${info.name} en fazla ${info.maxPlayers} kişiyle oynanır.`);
    if (!info.bots && players.some((p) => p.robot)) throw new GameError(`${info.name} botlarla oynanmaz, önce botları çıkar.`);
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
      isBot: (id) => room.players.some((p) => p.id === id && p.bot),
    };
    room.seated = new Set(players.map((p) => p.id));
    room.game = gameDefinitions[room.selectedGame].create(ctx, options);
    this.broadcast(room);
  }

  backToLobby(playerId: string): void {
    const room = this.hostRoom(playerId);
    this.endGame(room);
    this.broadcast(room);
  }

  addBot(playerId: string): void {
    const room = this.hostRoom(playerId);
    if (room.game) throw new GameError("Oyun devam ediyor.");
    const info = GAMES.find((g) => g.id === room.selectedGame)!;
    if (!info.bots) throw new GameError(`${info.name} botlarla oynanmaz.`);
    if (room.players.length >= MAX_ROOM_PLAYERS) throw new GameError("Oda dolu.");
    let n = 1;
    while (room.players.some((p) => p.name === `Bot ${n}`)) n++;
    room.players.push({ id: `bot-${this.nextBotId++}`, name: `Bot ${n}`, connected: true, bot: true, left: false, robot: true });
    this.broadcast(room);
  }

  kick(playerId: string, target: string): void {
    const room = this.hostRoom(playerId);
    if (target === playerId) throw new GameError("Kendini atamazsın.");
    const robot = room.players.find((p) => p.id === target && p.robot);
    if (robot) {
      if (room.game) throw new GameError("Oyun sırasında bot çıkarılamaz.");
      room.players = room.players.filter((p) => p !== robot);
      this.broadcast(room);
      return;
    }
    if (!room.players.some((p) => p.id === target && !p.left)) throw new GameError("Oyuncu bulunamadı.");
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
    this.stopBots(room);
    room.game = null;
    room.seated = new Set();
    room.players = room.players.filter((p) => !p.left);
    for (const p of room.players) {
      p.bot = p.robot;
      this.cancelTakeover(p.id);
      // Their lobby grace may have run out during the game.
      if (!p.connected && !this.lobbyCleanup.has(p.id)) this.scheduleLobbyCleanup(p.id);
    }
  }

  private deleteRoom(room: Room) {
    this.clearTimers(room);
    this.stopBots(room);
    for (const p of room.players) this.cancelTakeover(p.id);
    this.rooms.delete(room.code);
  }

  private clearTimers(room: Room) {
    for (const t of room.timers) clearTimeout(t);
    room.timers.clear();
  }

  private scheduleLobbyCleanup(playerId: string) {
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

  private cancelTakeover(playerId: string) {
    const pending = this.botTakeover.get(playerId);
    if (pending) clearTimeout(pending);
    this.botTakeover.delete(playerId);
  }

  /** Bots move one at a time, each after a short pause. */
  private scheduleBots(room: Room) {
    if (!room.game?.botAction || room.botTimer || !room.players.some((p) => p.bot)) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      this.runBots(room);
    }, BOT_DELAY_MS);
  }

  private runBots(room: Room) {
    const game = room.game;
    if (!game?.botAction || this.rooms.get(room.code) !== room) return;
    for (const p of room.players) {
      if (!p.bot) continue;
      let action: GameAction | null;
      try {
        action = game.botAction(p.id);
        if (!action) continue;
        game.handleAction(p.id, action);
      } catch (err) {
        // A bot bug must not take the room down; the seat just waits.
        console.error("bot hamlesi başarısız", err);
        continue;
      }
      this.broadcast(room);
      return;
    }
  }

  private stopBots(room: Room) {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = null;
  }

  private pickNewHost(room: Room) {
    const others = room.players.filter((p) => !p.left && !p.robot && p.id !== room.hostId);
    const next = others.find((p) => p.connected) ?? others[0];
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
      players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected, bot: p.bot })),
      selectedGame: room.selectedGame,
      status: room.game ? "playing" : "lobby",
      game: room.game ? room.game.getView(playerId) : null,
    };
  }

  private broadcast(room: Room) {
    for (const p of room.players) if (!p.left && !p.robot) this.notify(p.id, this.viewFor(room, p.id));
    this.scheduleBots(room);
  }
}

function cleanName(name: string): string {
  const trimmed = String(name ?? "").trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) throw new GameError("İsim boş olamaz.");
  return trimmed;
}
