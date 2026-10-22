import { describe, expect, it } from "vitest";
import { BatakGame } from "../src/games/batak/batak.js";
import { legalCards, trickWinner, type BatakView, type TrickCard } from "../../shared/games/batak.js";
import type { Card } from "../../shared/games/pisti.js";
import { fakeContext } from "./helpers.js";

let nextId = 1000;
const c = (suit: Card["suit"], rank: number): Card => ({ id: nextId++, suit, rank });
const t = (seat: number, card: Card): TrickCard => ({ seat, card });

function view(game: BatakGame, id = "p0") {
  return game.getView(id) as BatakView;
}

/** Plays the whole game with every seat on the bot's moves. */
function playOut(game: BatakGame, ids = ["p0", "p1", "p2", "p3"], maxMoves = 5000) {
  for (let i = 0; i < maxMoves; i++) {
    const v = view(game);
    if (v.phase === "roundOver") {
      if (v.gameOver) return v;
      game.handleAction("p0", { type: "nextRound" });
      continue;
    }
    const id = ids[v.turn];
    const action = game.botAction(id);
    expect(action).not.toBeNull();
    game.handleAction(id, action!);
  }
  throw new Error("oyun bitmedi");
}

describe("Batak rules", () => {
  it("takes a trick with the highest trump, else the highest card of the suit led", () => {
    expect(trickWinner([t(0, c("hearts", 10)), t(1, c("hearts", 1)), t(2, c("clubs", 1)), t(3, c("hearts", 13))], "spades")).toBe(1);
    expect(trickWinner([t(0, c("hearts", 10)), t(1, c("hearts", 1)), t(2, c("spades", 2)), t(3, c("spades", 3))], "spades")).toBe(3);
    expect(trickWinner([t(0, c("hearts", 2)), t(1, c("clubs", 1)), t(2, c("diamonds", 1)), t(3, c("hearts", 3))], null)).toBe(3);
  });

  it("makes you follow suit and go higher when you can", () => {
    const hand = [c("hearts", 5), c("hearts", 12), c("hearts", 1), c("spades", 4)];
    const legal = legalCards(hand, [t(0, c("hearts", 10))], "spades", false);
    expect(legal.map((x) => x.rank).sort()).toEqual([1, 12]);
    // Once the suit has been trumped, any card of it will do.
    const trumped = legalCards(hand, [t(0, c("hearts", 10)), t(1, c("spades", 2))], "spades", true);
    expect(trumped).toHaveLength(3);
  });

  it("makes you trump when you are out of the suit, and overtrump if you can", () => {
    const hand = [c("spades", 3), c("spades", 9), c("clubs", 4)];
    expect(legalCards(hand, [t(0, c("hearts", 10))], "spades", false).map((x) => x.rank).sort()).toEqual([3, 9]);
    expect(legalCards(hand, [t(0, c("hearts", 10)), t(1, c("spades", 5))], "spades", true).map((x) => x.rank)).toEqual([9]);
    // No trump that beats it: any trump still has to go.
    expect(legalCards(hand, [t(0, c("hearts", 10)), t(1, c("spades", 13))], "spades", true)).toHaveLength(2);
    // No trumps at all: anything.
    expect(legalCards([c("clubs", 4), c("diamonds", 2)], [t(0, c("hearts", 10))], "spades", false)).toHaveLength(2);
  });

  it("keeps trumps from being led until one has been played", () => {
    const hand = [c("spades", 1), c("hearts", 2)];
    expect(legalCards(hand, [], "spades", false).map((x) => x.suit)).toEqual(["hearts"]);
    expect(legalCards(hand, [], "spades", true)).toHaveLength(2);
    expect(legalCards([c("spades", 1)], [], "spades", false)).toHaveLength(1);
  });
});

describe("Batak", () => {
  it("deals thirteen cards each and starts the auction left of the dealer", () => {
    const game = new BatakGame(fakeContext(4).ctx, {});
    const v = view(game);
    expect(v.hand).toHaveLength(13);
    expect(v.seats.map((s) => s.handCount)).toEqual([13, 13, 13, 13]);
    expect(v.phase).toBe("bid");
    expect(v.turn).toBe((v.dealer + 1) % 4);
    expect(v.minBid).toBe(4);
    expect(() => new BatakGame(fakeContext(3).ctx, {})).toThrow();
  });

  it("runs the auction: raises, passes, and the winner names trumps and leads", () => {
    const game = new BatakGame(fakeContext(4).ctx, {});
    const first = view(game).turn;
    const id = (k: number) => `p${(first + k) % 4}`;
    game.handleAction(id(0), { type: "bid", amount: 5 });
    expect(() => game.handleAction(id(1), { type: "bid", amount: 5 })).toThrow("en az 6");
    game.handleAction(id(1), { type: "bid", amount: 7 });
    game.handleAction(id(2), { type: "bid", amount: 0 });
    game.handleAction(id(3), { type: "bid", amount: 0 });
    // The first bidder gets to speak again.
    expect(view(game).turn).toBe(first);
    game.handleAction(id(0), { type: "bid", amount: 0 });
    let v = view(game);
    expect(v).toMatchObject({ phase: "trump", bidder: (first + 1) % 4, bid: 7, turn: (first + 1) % 4 });
    game.handleAction(id(1), { type: "trump", suit: "hearts" });
    v = view(game, id(1));
    expect(v).toMatchObject({ phase: "play", trump: "hearts", turn: (first + 1) % 4 });
    // Hearts are not broken yet, so the leader may not start with one (unless that is all they hold).
    if (v.hand.some((x) => x.suit !== "hearts")) expect(v.legal.every((cid) => v.hand.find((x) => x.id === cid)!.suit !== "hearts")).toBe(true);
  });

  it("gives the lowest bid to the dealer when everyone passes", () => {
    const game = new BatakGame(fakeContext(4).ctx, { teams: 1 });
    const v0 = view(game);
    for (let k = 1; k <= 4; k++) game.handleAction(`p${(v0.dealer + k) % 4}`, { type: "bid", amount: 0 });
    expect(view(game)).toMatchObject({ phase: "trump", bidder: v0.dealer, bid: 7, minBid: 7 });
  });

  it("refuses cards that break the rules and says why", () => {
    const game = new BatakGame(fakeContext(4).ctx, {});
    const g = game as unknown as { hands: Card[][]; phase: string; trump: string; turn: number; trick: TrickCard[] };
    g.hands = [[c("hearts", 2), c("clubs", 5)], [c("spades", 3)], [c("spades", 4)], [c("spades", 5)]];
    g.phase = "play";
    g.trump = "spades";
    g.turn = 0;
    g.trick = [];
    const clubs = g.hands[0][1];
    g.trick = [t(3, c("hearts", 9))];
    expect(() => game.handleAction("p0", { type: "play", cardId: clubs.id })).toThrow("uymalısın");
  });

  it("scores a made contract by tricks and a sunk one by minus the bid", () => {
    const game = new BatakGame(fakeContext(4).ctx, {});
    const g = game as unknown as { tricks: number[]; bidder: number; bid: number; endRound(): void };
    g.bidder = 0;
    g.bid = 6;
    g.tricks = [7, 3, 2, 1];
    g.endRound();
    let v = view(game);
    expect(v.sides.map((s) => s.score)).toEqual([7, 3, 2, 1]);
    expect(v.lastRound!.sides[0]).toMatchObject({ bid: 6, tricks: 7, made: true });

    g.tricks = [5, 4, 2, 2];
    g.endRound();
    v = view(game);
    expect(v.sides.map((s) => s.score)).toEqual([1, 7, 4, 3]);
    expect(v.lastRound!.note).toContain("battı");
  });

  it("scores koz maça by each side's promise", () => {
    const game = new BatakGame(fakeContext(4).ctx, { mode: 1, teams: 1 });
    expect(view(game).trump).toBe("spades");
    const g = game as unknown as { tricks: number[]; bids: number[]; endRound(): void };
    g.bids = [3, 4, 2, 2];
    g.tricks = [4, 3, 3, 3];
    g.endRound();
    const v = view(game);
    // Seats 0 and 2 promised 5 and took 7; seats 1 and 3 promised 6 and took 6.
    expect(v.lastRound!.sides).toMatchObject([{ bid: 5, tricks: 7, delta: 7 }, { bid: 6, tricks: 6, delta: 6 }]);
  });

  it("plays whole games with bots alone, in every mode, without a stuck seat", () => {
    for (const [seed, options] of [
      [1, {}],
      [2, { teams: 1 }],
      [3, { mode: 1 }],
      [4, { mode: 1, teams: 1 }],
    ] as const) {
      const game = new BatakGame(fakeContext(4, seed).ctx, { ...options, rounds: 6 });
      const v = playOut(game);
      expect(v.gameOver).toBe(true);
      expect(v.history).toHaveLength(6);
      for (const round of v.history) expect(round).toHaveLength(options.teams ? 2 : 4);
    }
  });

  it("makes a bot's move when a turn runs out", () => {
    const { ctx, runTimers } = fakeContext(4);
    const game = new BatakGame(ctx, { turnSeconds: 15 });
    const before = view(game).turn;
    runTimers();
    const v = view(game);
    expect(v.seats[before].bid).not.toBeNull();
    expect(v.notice).toContain("süresini doldurdu");
  });
});
