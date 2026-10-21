import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "../../shared/protocol.js";
import { BOT_DELAY_MS, BOT_TAKEOVER_MS, RoomManager } from "../src/rooms.js";
import type { OkeyView } from "../../shared/games/okey.js";
import { seeded } from "./helpers.js";

function setup() {
  const views = new Map<string, RoomView | null>();
  const rooms = new RoomManager((id, view) => views.set(id, view), seeded(5));
  return { rooms, views };
}

afterEach(() => vi.useRealTimers());

describe("RoomManager", () => {
  it("creates and joins rooms by code, case-insensitively", () => {
    const { rooms, views } = setup();
    const code = rooms.createRoom("a", "Ali");
    rooms.joinRoom("b", code.toLowerCase(), "Banu");
    expect(views.get("a")!.players.map((p) => p.name)).toEqual(["Ali", "Banu"]);
    expect(views.get("b")!.hostId).toBe("a");
    expect(() => rooms.joinRoom("c", "ZZZZ", "Can")).toThrow("Oda bulunamadı.");
  });

  it("only lets the host start, and checks player counts", () => {
    const { rooms, views } = setup();
    const code = rooms.createRoom("a", "Ali");
    for (const id of ["b", "c"]) rooms.joinRoom(id, code, id);
    expect(() => rooms.startGame("a", {})).toThrow(/en az 4/);
    rooms.joinRoom("d", code, "d");
    expect(() => rooms.startGame("b", {})).toThrow(/oda sahibi/);
    rooms.selectGame("a", "okey");
    rooms.startGame("a", {});
    expect(views.get("c")!.status).toBe("playing");
    expect(() => rooms.joinRoom("e", code, "e")).toThrow(/başladı/);
  });

  it("hands the room to another player when the host leaves", () => {
    const { rooms, views } = setup();
    const code = rooms.createRoom("a", "Ali");
    rooms.joinRoom("b", code, "Banu");
    rooms.leaveRoom("a");
    expect(views.get("a")).toBeNull();
    expect(views.get("b")!.hostId).toBe("b");
  });

  it("keeps a disconnected player's lobby seat for a while", () => {
    vi.useFakeTimers();
    const { rooms, views } = setup();
    const code = rooms.createRoom("a", "Ali");
    rooms.joinRoom("b", code, "Banu");
    rooms.setConnected("b", false);
    vi.advanceTimersByTime(60_000);
    rooms.setConnected("b", true);
    vi.advanceTimersByTime(5 * 60_000);
    expect(views.get("a")!.players).toHaveLength(2);
    rooms.setConnected("b", false);
    vi.advanceTimersByTime(5 * 60_000);
    expect(views.get("a")!.players).toHaveLength(1);
  });

  function startOkey() {
    const ctx = setup();
    const code = ctx.rooms.createRoom("a", "Ali");
    for (const id of ["b", "c", "d"]) ctx.rooms.joinRoom(id, code, id);
    ctx.rooms.selectGame("a", "okey");
    ctx.rooms.startGame("a", {});
    return { ...ctx, code, game: () => ctx.views.get("a")!.game as OkeyView };
  }

  it("puts a bot in the seat of a player who leaves mid-game, and gives it back on rejoin", () => {
    vi.useFakeTimers();
    const { rooms, views, code, game } = startOkey();
    const turnId = game().seats[game().turn].id;
    rooms.leaveRoom(turnId);
    expect(views.get(turnId)).toBeNull();
    const watcher = ["a", "b", "c", "d"].find((id) => id !== turnId)!;
    expect(views.get(watcher)!.status).toBe("playing");
    expect(views.get(watcher)!.players.find((p) => p.id === turnId)!.bot).toBe(true);

    // The bot (dealer, 15 tiles) throws a tile and the turn moves on.
    const before = game().turn;
    vi.advanceTimersByTime(BOT_DELAY_MS);
    expect((views.get(watcher)!.game as OkeyView).turn).not.toBe(before);

    rooms.joinRoom(turnId, code, "Geri");
    const back = views.get(turnId)!;
    expect(back.status).toBe("playing");
    expect(back.players.find((p) => p.id === turnId)!.bot).toBe(false);
    expect((back.game as OkeyView).hand).toHaveLength(14);
  });

  it("lets a bot take over a dropped player only after a grace period", () => {
    vi.useFakeTimers();
    const { rooms, views } = startOkey();
    rooms.setConnected("b", false);
    vi.advanceTimersByTime(BOT_TAKEOVER_MS - 1);
    expect(views.get("a")!.players.find((p) => p.id === "b")!.bot).toBe(false);
    vi.advanceTimersByTime(1);
    expect(views.get("a")!.players.find((p) => p.id === "b")!.bot).toBe(true);
    rooms.setConnected("b", true);
    expect(views.get("a")!.players.find((p) => p.id === "b")!.bot).toBe(false);
  });

  it("drops players who left once the game ends, and closes a room only bots are in", () => {
    vi.useFakeTimers();
    const { rooms, views, code } = startOkey();
    rooms.leaveRoom("d");
    rooms.backToLobby("a");
    expect(views.get("a")!.players.map((p) => p.id)).toEqual(["a", "b", "c"]);

    rooms.selectGame("a", "vampir");
    rooms.joinRoom("d", code, "d");
    rooms.startGame("a", {});
    for (const id of ["a", "b", "c", "d"]) rooms.leaveRoom(id);
    expect(() => rooms.joinRoom("a", code, "Ali")).toThrow("Oda bulunamadı.");
  });
});

