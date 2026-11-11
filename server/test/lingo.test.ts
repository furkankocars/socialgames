import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINGO_TRIES, lingoPoints } from "../../shared/games/lingo.js";
import { LingoGame, NEXT_ROUND_MS, markGuess } from "../src/games/lingo/lingo.js";
import { LINGO_ANSWERS, LINGO_WORDS, normalize } from "../src/games/lingo/words.js";
import { fakeContext } from "./helpers.js";

function setup(count: number, options: Record<string, unknown> = {}, seed = 5) {
  const { ctx, runTimers, bots } = fakeContext(count, seed);
  const game = new LingoGame(ctx, options);
  const ids = ctx.players.map((p) => p.id);
  // The tests peek at the word through a finished round's view.
  const word = () => (game as unknown as { word: string }).word;
  /** A dictionary word of the right shape that is not the answer. */
  const wrong = (n = 0) => LINGO_ANSWERS[word().length].filter((w) => w[0] === word()[0] && w !== word())[n];
  return { game, ids, word, wrong, runTimers, bots };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Lingo", () => {
  it("marks letters like the show, counting repeated letters once", () => {
    expect(markGuess("kalem", "kalem")).toEqual(["hit", "hit", "hit", "hit", "hit"]);
    expect(markGuess("kemal", "kalem")).toEqual(["hit", "near", "near", "near", "near"]);
    expect(markGuess("aaxxx", "xxxxa")).toEqual(["near", "miss", "hit", "hit", "near"]);
    expect(markGuess("kakao", "kalem")).toEqual(["hit", "hit", "miss", "miss", "miss"]);
  });

  it("has words of every length and accepts Turkish capitals", () => {
    for (const n of [4, 5, 6]) {
      expect(LINGO_ANSWERS[n].length).toBeGreaterThan(400);
      expect(LINGO_ANSWERS[n].every((w) => [...w].length === n && LINGO_WORDS.has(w))).toBe(true);
    }
    expect(normalize("IŞIK")).toBe("ışık");
    expect(normalize("İNCİ")).toBe("inci");
    expect(LINGO_WORDS.has("ışık")).toBe(true);
  });

  it("lets players guess in turn on one board everyone sees", () => {
    const { game, ids, word, wrong } = setup(3);
    const view = game.getView(ids[0]);
    expect(view.length).toBe(5);
    expect(view.first).toBe(word()[0]);
    expect(view.word).toBeNull();
    expect(view.turn).toBe(ids[0]);
    expect(() => game.handleAction(ids[1], { type: "guess", word: wrong() })).toThrow("Sıra");
    game.handleAction(ids[0], { type: "draft", word: "AB1c" });
    expect(game.getView(ids[2]).draft).toBe("abc");
    game.handleAction(ids[1], { type: "draft", word: "x" });
    expect(game.getView(ids[2]).draft).toBe("abc");
    game.handleAction(ids[0], { type: "guess", word: wrong() });
    const seen = game.getView(ids[2]);
    expect(seen.rows).toEqual([{ by: ids[0], word: wrong(), marks: markGuess(wrong(), word()) }]);
    expect(seen.turn).toBe(ids[1]);
    expect(seen.draft).toBe("");
  });

  it("refuses guesses that break the rules", () => {
    const { game, ids, word, wrong } = setup(2);
    expect(() => game.handleAction(ids[0], { type: "guess", word: "ab" })).toThrow("5 harfli");
    const other = LINGO_ANSWERS[5].find((w) => w[0] !== word()[0])!;
    expect(() => game.handleAction(ids[0], { type: "guess", word: other })).toThrow("ile başlamalı");
    expect(() => game.handleAction(ids[0], { type: "guess", word: word()[0] + "qqqq" })).toThrow("sözlükte yok");
    game.handleAction(ids[0], { type: "guess", word: wrong() });
    expect(() => game.handleAction(ids[1], { type: "guess", word: wrong() })).toThrow("zaten denendi");
  });

  it("gives the finder points by row, then reveals the word", () => {
    const { game, ids, word, wrong } = setup(3);
    game.handleAction(ids[0], { type: "guess", word: wrong() });
    game.handleAction(ids[1], { type: "guess", word: wrong(1) });
    game.handleAction(ids[2], { type: "guess", word: word().toLocaleUpperCase("tr") });
    const view = game.getView(ids[0]);
    expect(view.phase).toBe("result");
    expect(view.word).toBe(word());
    expect(view.solver).toBe(ids[2]);
    expect(view.turn).toBeNull();
    expect(view.scores).toEqual({ [ids[0]]: 0, [ids[1]]: 0, [ids[2]]: lingoPoints(3) });
    expect(view.nextMsLeft).toBe(NEXT_ROUND_MS);
  });

  it("ends the round when the board fills up", () => {
    const { game, ids, wrong } = setup(2);
    for (let i = 0; i < LINGO_TRIES; i++) game.handleAction(ids[i % 2], { type: "guess", word: wrong(i) });
    const view = game.getView(ids[0]);
    expect(view.phase).toBe("result");
    expect(view.solver).toBeNull();
  });

  it("passes the turn when time runs out, rotates the opener and grows the words", () => {
    const { game, ids, runTimers } = setup(2, { length: 0, rounds: 3 });
    expect(game.getView(ids[0]).length).toBe(4);
    runTimers();
    let view = game.getView(ids[0]);
    expect(view.rows).toEqual([{ by: ids[0], word: null, marks: [] }]);
    expect(view.turn).toBe(ids[1]);
    for (let i = 1; i < LINGO_TRIES; i++) runTimers();
    expect(game.getView(ids[0]).phase).toBe("result");
    runTimers();
    view = game.getView(ids[0]);
    expect(view.phase).toBe("play");
    expect(view.length).toBe(5);
    expect(view.turn).toBe(ids[1]);
    expect(view.order).toEqual([ids[1], ids[0]]);
    for (let i = 0; i < LINGO_TRIES; i++) runTimers();
    expect(() => game.handleAction(ids[1], { type: "next" })).toThrow("oda sahibi");
    game.handleAction(ids[0], { type: "next" });
    expect(game.getView(ids[0]).length).toBe(6);
    for (let i = 0; i < LINGO_TRIES; i++) runTimers();
    expect(game.getView(ids[0]).phase).toBe("finished");
    expect(game.getView(ids[0]).nextMsLeft).toBeNull();
  });

  it("lets bots think, type their word out and play a game", () => {
    let solved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { game, ids, bots, runTimers } = setup(3, {}, seed);
      ids.forEach((id) => bots.add(id));
      expect(game.botAction(ids[0])).toBeNull();
      expect(game.botAction(ids[1])).toBeNull();
      let drafts = 0;
      for (let step = 0; step < 200 && game.getView(ids[0]).phase === "play"; step++) {
        vi.advanceTimersByTime(1_000);
        for (const id of ids) {
          const action = game.botAction(id);
          if (!action) continue;
          if (action.type === "draft") drafts++;
          game.handleAction(id, action);
        }
      }
      const view = game.getView(ids[0]);
      expect(view.phase).toBe("result");
      expect(drafts).toBeGreaterThan(0);
      if (view.solver) solved++;
      runTimers();
    }
    expect(solved).toBeGreaterThan(10);
  });
});
