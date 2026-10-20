import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "../../shared/protocol.js";
import { RoomManager } from "../src/rooms.js";
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
});
