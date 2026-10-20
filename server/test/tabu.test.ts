import { describe, expect, it } from "vitest";
import { TabuGame } from "../src/games/tabu/tabu.js";
import { fakeContext } from "./helpers.js";

describe("Tabu", () => {
  it("plays a full turn and hides the card from the guessing team", () => {
    const { ctx, runTimers } = fakeContext(4);
    const game = new TabuGame(ctx, { rounds: 1 });
    game.handleAction("p0", { type: "begin" });
    const v = game.getView("p0");
    const narrator = v.narratorId!;
    const team = v.teams[v.activeTeam];
    const teammate = team.find((id) => id !== narrator)!;
    const opponent = v.teams[1 - v.activeTeam][0];

    game.handleAction(narrator, { type: "startTurn" });
    expect(game.getView(narrator).card).not.toBeNull();
    expect(game.getView(opponent).card).not.toBeNull();
    expect(game.getView(teammate).card).toBeNull();

    game.handleAction(narrator, { type: "correct" });
    game.handleAction(narrator, { type: "correct" });
    game.handleAction(opponent, { type: "taboo" });
    expect(() => game.handleAction(teammate, { type: "taboo" })).toThrow();
    expect(game.getView(narrator).scores[v.activeTeam]).toBe(1);

    runTimers();
    const after = game.getView("p0");
    expect(after.phase).toBe("ready");
    expect(after.activeTeam).toBe(1 - v.activeTeam);

    game.handleAction(after.narratorId!, { type: "startTurn" });
    runTimers();
    expect(game.getView("p0").phase).toBe("finished");
  });

  it("limits passes", () => {
    const { ctx } = fakeContext(4);
    const game = new TabuGame(ctx, {});
    game.handleAction("p0", { type: "begin" });
    const narrator = game.getView("p0").narratorId!;
    game.handleAction(narrator, { type: "startTurn" });
    for (let i = 0; i < 3; i++) game.handleAction(narrator, { type: "pass" });
    expect(() => game.handleAction(narrator, { type: "pass" })).toThrow();
  });
});
