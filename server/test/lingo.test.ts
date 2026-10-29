import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("shows the first letter and keeps other players' letters hidden", () => {
    const { game, ids, word, wrong } = setup(3);
    const view = game.getView(ids[0]);
    expect(view.length).toBe(5);
    expect(view.first).toBe(word()[0]);
    expect(view.word).toBeNull();
    game.handleAction(ids[1], { type: "guess", word: wrong() });
    expect(game.getView(ids[1]).boards[ids[1]].rows[0].word).toBe(wrong());
    const seen = game.getView(ids[0]).boards[ids[1]].rows[0];
    expect(seen.word).toBeNull();
    expect(seen.marks).toHaveLength(5);
  });

  it("refuses guesses that break the rules", () => {
    const { game, ids, word, wrong } = setup(2);
    expect(() => game.handleAction(ids[0], { type: "guess", word: "ab" })).toThrow("5 harfli");
    const other = LINGO_ANSWERS[5].find((w) => w[0] !== word()[0])!;
    expect(() => game.handleAction(ids[0], { type: "guess", word: other })).toThrow("ile başlamalı");
    expect(() => game.handleAction(ids[0], { type: "guess", word: word()[0] + "qqqq" })).toThrow("sözlükte yok");
    game.handleAction(ids[0], { type: "guess", word: wrong() });
    expect(() => game.handleAction(ids[0], { type: "guess", word: wrong() })).toThrow("zaten denedin");
  });

  it("scores by try and order, then reveals the word", () => {
    const { game, ids, word, wrong } = setup(3);
    game.handleAction(ids[1], { type: "guess", word: wrong() });
    game.handleAction(ids[1], { type: "guess", word: word() });
    game.handleAction(ids[0], { type: "guess", word: wrong() });
    game.handleAction(ids[0], { type: "guess", word: wrong(1) });
    game.handleAction(ids[0], { type: "guess", word: word().toLocaleUpperCase("tr") });
    for (let i = 0; i < 5; i++) game.handleAction(ids[2], { type: "guess", word: wrong(i) });
    const view = game.getView(ids[2]);
    expect(view.phase).toBe("result");
    expect(view.word).toBe(word());
    // 2nd try 4 + first place 2; 3rd try 3 + second place 1.
    expect(view.scores).toEqual({ [ids[0]]: 4, [ids[1]]: 6, [ids[2]]: 0 });
    expect(view.boards[ids[1]].rows[0].word).toBe(wrong());
    expect(view.nextMsLeft).toBe(NEXT_ROUND_MS);
  });

  it("ends the round when time runs out, deals the next on its own and grows the words", () => {
    const { game, ids, runTimers } = setup(2, { length: 0, rounds: 3 });
    expect(game.getView(ids[0]).length).toBe(4);
    runTimers();
    expect(game.getView(ids[0]).phase).toBe("result");
    runTimers();
    expect(game.getView(ids[0]).phase).toBe("play");
    expect(game.getView(ids[0]).length).toBe(5);
    runTimers();
    expect(() => game.handleAction(ids[1], { type: "next" })).toThrow("oda sahibi");
    game.handleAction(ids[0], { type: "next" });
    expect(game.getView(ids[0]).length).toBe(6);
    runTimers();
    expect(game.getView(ids[0]).phase).toBe("finished");
    expect(game.getView(ids[0]).nextMsLeft).toBeNull();
  });

  it("lets bots play out a game at their own pace", () => {
    let solved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { game, ids, bots, runTimers } = setup(3, {}, seed);
      ids.forEach((id) => bots.add(id));
      for (const id of ids) expect(game.botAction(id)).toBeNull();
      for (let step = 0; step < 100 && game.getView(ids[0]).phase === "play"; step++) {
        vi.advanceTimersByTime(15_000);
        for (const id of ids) {
          const action = game.botAction(id);
          if (action) game.handleAction(id, action);
        }
      }
      const view = game.getView(ids[0]);
      expect(view.phase).toBe("result");
      solved += ids.filter((id) => view.boards[id].solved).length;
      runTimers();
    }
    expect(solved).toBeGreaterThan(20);
  });
});
