import { describe, expect, it } from "vitest";
import { VampirGame, rolesFor } from "../src/games/vampir/vampir.js";
import { fakeContext } from "./helpers.js";

function setup(count: number, options: Record<string, unknown> = {}) {
  const { ctx, runTimers } = fakeContext(count, 7);
  const game = new VampirGame(ctx, options);
  const roles = new Map(ctx.players.map((p) => [p.id, game.getView(p.id).myRole!]));
  const byRole = (role: string) => [...roles].filter(([, r]) => r === role).map(([id]) => id);
  return { game, roles, byRole, runTimers };
}

describe("Vampir Köylü", () => {
  it("assigns roles", () => {
    expect(rolesFor(4)).toEqual(["vampir", "gozcu", "koylu", "koylu"]);
    expect(rolesFor(8).filter((r) => r === "vampir")).toHaveLength(2);
  });

  it("hides roles from villagers but shows fellow vampires", () => {
    const { game, byRole } = setup(8);
    const [v1, v2] = byRole("vampir");
    const villager = byRole("koylu")[0];
    expect(game.getView(v1).players.find((p) => p.id === v2)!.role).toBe("vampir");
    expect(game.getView(villager).players.find((p) => p.id === v1)!.role).toBeUndefined();
  });

  it("doctor saves the victim, then the village hangs the vampire", () => {
    const { game, byRole } = setup(5);
    const [vampire] = byRole("vampir");
    const [doctor] = byRole("doktor");
    const [seer] = byRole("gozcu");
    const victim = byRole("koylu")[0];

    game.handleAction(vampire, { type: "nightTarget", targetId: victim });
    game.handleAction(doctor, { type: "nightTarget", targetId: victim });
    game.handleAction(seer, { type: "nightTarget", targetId: vampire });
    const day = game.getView(seer);
    expect(day.phase).toBe("day");
    expect(day.players.every((p) => p.alive)).toBe(true);
    expect(day.seerResults).toEqual([{ targetId: vampire, isVampire: true }]);

    for (const p of day.players) game.handleAction(p.id, { type: "vote", targetId: vampire });
    const end = game.getView(seer);
    expect(end.phase).toBe("finished");
    expect(end.winner).toBe("koy");
  });

  it("vampires win when they reach parity", () => {
    const { game, byRole } = setup(4);
    const [vampire] = byRole("vampir");
    const [seer] = byRole("gozcu");
    const [a, b] = byRole("koylu");
    game.handleAction(vampire, { type: "nightTarget", targetId: a });
    game.handleAction(seer, { type: "nightTarget", targetId: b });
    // Day: three alive, the village hangs an innocent.
    for (const id of [vampire, seer, b]) game.handleAction(id, { type: "vote", targetId: b });
    expect(game.getView(seer).winner).toBe("vampir");
  });

  it("a tied day vote hangs nobody", () => {
    const { game, byRole } = setup(4);
    const [vampire] = byRole("vampir");
    const [seer] = byRole("gozcu");
    const [a, b] = byRole("koylu");
    game.handleAction(vampire, { type: "nightTarget", targetId: a });
    game.handleAction(seer, { type: "nightTarget", targetId: vampire });
    game.handleAction(vampire, { type: "vote", targetId: seer });
    game.handleAction(seer, { type: "vote", targetId: vampire });
    game.handleAction(b, { type: "vote", targetId: null });
    const v = game.getView(b);
    expect(v.phase).toBe("night");
    expect(v.players.filter((p) => p.alive)).toHaveLength(3);
  });

  it("doctor can't guard the same player two nights in a row", () => {
    const { game, byRole } = setup(5);
    const [vampire] = byRole("vampir");
    const [doctor] = byRole("doktor");
    const [seer] = byRole("gozcu");
    const [a, b] = byRole("koylu");
    game.handleAction(vampire, { type: "nightTarget", targetId: a });
    game.handleAction(doctor, { type: "nightTarget", targetId: b });
    game.handleAction(seer, { type: "nightTarget", targetId: a });
    for (const id of [vampire, doctor, seer, b]) game.handleAction(id, { type: "vote", targetId: null });
    expect(game.getView(doctor).guardBlocked).toBe(b);
    expect(() => game.handleAction(doctor, { type: "nightTarget", targetId: b })).toThrow();
    game.handleAction(doctor, { type: "nightTarget", targetId: seer });
  });

  it("a timed day ends when the clock runs out, with the votes cast so far", () => {
    const { game, byRole, runTimers } = setup(5, { dayMinutes: 2 });
    const [vampire] = byRole("vampir");
    const [doctor] = byRole("doktor");
    const [seer] = byRole("gozcu");
    const [a, b] = byRole("koylu");
    game.handleAction(vampire, { type: "nightTarget", targetId: a });
    game.handleAction(doctor, { type: "nightTarget", targetId: b });
    game.handleAction(seer, { type: "nightTarget", targetId: vampire });
    const day = game.getView(seer);
    expect(day.daySeconds).toBe(120);
    expect(day.dayMsLeft).toBeGreaterThan(0);
    game.handleAction(seer, { type: "vote", targetId: vampire });
    runTimers();
    const end = game.getView(seer);
    expect(end.phase).toBe("finished");
    expect(end.winner).toBe("koy");
  });

  it("can keep the dead players' roles secret", () => {
    const { game, byRole } = setup(4, { reveal: 0 });
    const [vampire] = byRole("vampir");
    const [seer] = byRole("gozcu");
    const [a] = byRole("koylu");
    game.handleAction(vampire, { type: "nightTarget", targetId: a });
    game.handleAction(seer, { type: "nightTarget", targetId: vampire });
    const v = game.getView(seer);
    expect(v.players.find((p) => p.id === a)!.alive).toBe(false);
    expect(v.players.find((p) => p.id === a)!.role).toBeUndefined();
    expect(v.events.join(" ")).not.toContain("Köylü");
  });
});
