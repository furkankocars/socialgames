import { describe, expect, it } from "vitest";
import { OkeyGame } from "../src/games/okey/okey.js";
import { VampirGame } from "../src/games/vampir/vampir.js";
import { TabuGame } from "../src/games/tabu/tabu.js";
import type { GameInstance } from "../src/games/types.js";
import type { OkeyView } from "../../shared/games/okey.js";
import type { TabuView } from "../../shared/games/tabu.js";
import { fakeContext } from "./helpers.js";

/** Lets every seat's bot move until nobody has a move left. */
function playOut(game: GameInstance, ids: string[], limit = 2000): number {
  let steps = 0;
  for (; steps < limit; steps++) {
    const id = ids.find((p) => game.botAction!(p));
    if (!id) return steps;
    game.handleAction(id, game.botAction!(id)!);
  }
  throw new Error("bots did not finish");
}

describe("Bots", () => {
  for (const variant of ["okey", "okey101"] as const) {
    it(`play a whole ${variant} round with legal moves`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const { ctx } = fakeContext(4, seed);
        const game = new OkeyGame(ctx, variant, { rounds: 1 });
        const ids = ctx.players.map((p) => p.id);
        playOut(game, ids);
        const view = game.getView("p0") as OkeyView;
        expect(view.phase).toBe("roundOver");
        expect(view.lastRound).not.toBeNull();
      }
    });
  }

  it("lets a 101 bot open and finish when its hand allows", () => {
    let finished = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { ctx } = fakeContext(4, seed);
      const game = new OkeyGame(ctx, "okey101", { rounds: 1 });
      playOut(game, ctx.players.map((p) => p.id));
      if (game.getView("p0").lastRound!.winnerId) finished++;
    }
    expect(finished).toBeGreaterThan(0);
  });

  it("carry a vampire game to the end", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { ctx } = fakeContext(7, seed);
      const game = new VampirGame(ctx);
      playOut(game, ctx.players.map((p) => p.id));
      expect(game.getView("p0").winner).not.toBeNull();
    }
  });

  it("pass over a bot narrator in Tabu and hand back a running turn", () => {
    const { ctx, bots } = fakeContext(4, 2);
    const game = new TabuGame(ctx, { rounds: 1 });
    game.handleAction("p0", { type: "begin" });
    let view = game.getView("p0") as TabuView;
    const first = view.narratorId!;
    const activeTeam = view.activeTeam;
    const team = view.teams[activeTeam];
    const mate = team.find((id) => id !== first)!;

    bots.add(first);
    expect(game.getView("p0").narratorId).toBe(mate);
    bots.delete(first);

    game.handleAction(first, { type: "startTurn" });
    bots.add(first);
    expect(game.botAction(first)).toEqual({ type: "skipTurn" });
    game.handleAction(first, { type: "skipTurn" });
    view = game.getView("p0");
    expect(view.phase).toBe("ready");
    expect(view.activeTeam).not.toBe(activeTeam);
    expect(() => game.handleAction(view.narratorId!, { type: "skipTurn" })).toThrow();
  });
});
