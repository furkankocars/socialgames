import { describe, expect, it } from "vitest";
import { CasusGame, maxSpies } from "../src/games/casus/casus.js";
import { CASUS_WORDS } from "../src/games/casus/words.js";
import { fakeContext } from "./helpers.js";

function setup(count: number, options: Record<string, unknown> = {}, seed = 3) {
  const { ctx, runTimers, bots } = fakeContext(count, seed);
  const game = new CasusGame(ctx, options);
  const ids = ctx.players.map((p) => p.id);
  const spies = ids.filter((id) => game.getView(id).isSpy);
  const town = ids.filter((id) => !spies.includes(id));
  const readyAll = () => ids.forEach((id) => game.handleAction(id, { type: "ready" }));
  const voteAll = (target: (voter: string) => string) => ids.forEach((id) => game.handleAction(id, { type: "vote", targetId: target(id) }));
  const toVote = () => {
    for (const id of ids) if (game.getView(id).phase === "talk") game.handleAction(id, { type: "wantVote", on: true });
  };
  return { game, ids, spies, town, readyAll, voteAll, toVote, runTimers, bots };
}

describe("Casus", () => {
  it("gives the word to everyone but the spy", () => {
    const { game, spies, town } = setup(5, { category: 7 });
    expect(spies).toHaveLength(1);
    const view = game.getView(town[0]);
    expect(view.word).toBeTruthy();
    expect(CASUS_WORDS.Hayvan).toContain(view.word);
    expect(view.wordCategory).toBe("Hayvan");
    expect(view.spies).toEqual([]);
    const spy = game.getView(spies[0]);
    expect(spy.word).toBeNull();
    expect(spy.wordCategory).toBeNull();
    expect(spy.spies).toEqual(spies);
    expect(spy.candidates).toHaveLength(16);
    expect(spy.candidates).toContain(view.word);
  });

  it("keeps spies a minority", () => {
    expect(maxSpies(3)).toBe(1);
    expect(maxSpies(5)).toBe(2);
    expect(setup(4, { spies: 3 }).spies).toHaveLength(1);
    expect(setup(8, { spies: 2 }).spies).toHaveLength(2);
  });

  it("starts the questions once everyone has seen the card, then times out into a vote", () => {
    const { game, ids, readyAll, runTimers, toVote } = setup(4, { talkMinutes: 3 });
    game.handleAction(ids[0], { type: "ready" });
    expect(game.getView(ids[0]).phase).toBe("reveal");
    readyAll();
    expect(game.getView(ids[0]).phase).toBe("talk");
    expect(game.getView(ids[0]).talkMsLeft).toBeGreaterThan(0);
    runTimers();
    expect(game.getView(ids[0]).phase).toBe("vote");
  });

  it("moves to the vote when most of the table asks", () => {
    const { game, ids, readyAll, toVote } = setup(5);
    readyAll();
    game.handleAction(ids[0], { type: "wantVote", on: true });
    game.handleAction(ids[1], { type: "wantVote", on: true });
    expect(game.getView(ids[0]).phase).toBe("talk");
    game.handleAction(ids[2], { type: "wantVote", on: true });
    expect(game.getView(ids[0]).phase).toBe("vote");
  });

  it("caught spy who misses the word loses; votes stay secret until counted", () => {
    const { game, ids, spies, town, readyAll, toVote } = setup(4, { rounds: 3 });
    readyAll();
    toVote();
    const [spy] = spies;
    expect(() => game.handleAction(spy, { type: "vote", targetId: spy })).toThrow();
    game.handleAction(town[0], { type: "vote", targetId: spy });
    expect(game.getView(town[1]).votes).toBeNull();
    expect(game.getView(town[1]).voted).toEqual([town[0]]);
    for (const id of ids.slice()) if (id !== town[0]) game.handleAction(id, { type: "vote", targetId: id === spy ? town[0] : spy });
    const view = game.getView(town[0]);
    expect(view.phase).toBe("guess");
    expect(view.guesserId).toBe(spy);
    expect(() => game.handleAction(town[0], { type: "guess", word: view.candidates[0] })).toThrow();
    const wrong = view.candidates.find((w) => w !== view.word)!;
    game.handleAction(spy, { type: "guess", word: wrong });
    const end = game.getView(spy);
    expect(end.phase).toBe("result");
    expect(end.outcome).toBe("caught");
    expect(end.winner).toBe("town");
    expect(end.word).toBe(view.word);
    expect(end.scores[spy]).toBe(0);
    expect(end.scores[town[0]]).toBe(1);
  });

  it("caught spy who names the word still wins", () => {
    const { game, ids, spies, town, readyAll, voteAll, toVote } = setup(4);
    readyAll();
    toVote();
    const [spy] = spies;
    voteAll((id) => (id === spy ? town[0] : spy));
    game.handleAction(spy, { type: "guess", word: game.getView(town[0]).word! });
    const end = game.getView(spy);
    expect(end.outcome).toBe("guessed");
    expect(end.scores[spy]).toBe(3);
  });

  it("a wrong accusation or a tie lets the spy escape", () => {
    const { game, ids, spies, town, readyAll, voteAll, toVote } = setup(4);
    readyAll();
    toVote();
    voteAll((id) => (id === town[0] ? town[1] : town[0]));
    const end = game.getView(spies[0]);
    expect(end.outcome).toBe("escaped");
    expect(end.accusedId).toBe(town[0]);
    expect(end.scores[spies[0]]).toBe(2);
  });

  it("a spy can guess during the questions; a miss hands the round to the table", () => {
    const { game, spies, town, readyAll, toVote } = setup(4);
    readyAll();
    expect(() => game.handleAction(town[0], { type: "guess", word: game.getView(town[0]).word! })).toThrow();
    const wrong = game.getView(town[0]).candidates.find((w) => w !== game.getView(town[0]).word)!;
    game.handleAction(spies[0], { type: "guess", word: wrong });
    expect(game.getView(town[0]).outcome).toBe("missed");
    expect(game.getView(town[0]).winner).toBe("town");
  });

  it("plays the set number of rounds without repeating a word", () => {
    const { game, ids, readyAll, toVote } = setup(3, { rounds: 3, category: 2 });
    const words = new Set<string>();
    for (let r = 1; r <= 3; r++) {
      const spy = ids.find((id) => game.getView(id).isSpy)!;
      const other = ids.find((id) => id !== spy)!;
      words.add(game.getView(other).word!);
      readyAll();
      game.handleAction(spy, { type: "guess", word: game.getView(other).word! });
      if (r < 3) {
        expect(() => game.handleAction(ids[1], { type: "next" })).toThrow();
        game.handleAction("p0", { type: "next" });
        expect(game.getView(ids[0]).round).toBe(r + 1);
      }
    }
    expect(words.size).toBe(3);
    expect(game.getView(ids[0]).phase).toBe("finished");
  });

  it("stand-in bots keep the round moving", () => {
    const { game, ids } = setup(4);
    for (let i = 0; i < 40 && game.getView(ids[0]).phase !== "result"; i++) {
      for (const id of ids) {
        const action = game.botAction(id);
        if (action) game.handleAction(id, action);
      }
    }
    expect(["result", "finished"]).toContain(game.getView(ids[0]).phase);
  });
});
