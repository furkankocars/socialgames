import { describe, expect, it } from "vitest";
import { PistiGame, newDeck } from "../src/games/pisti/pisti.js";
import { cardPoints, type Card, type PistiView } from "../../shared/games/pisti.js";
import { fakeContext } from "./helpers.js";

const card = (suit: Card["suit"], rank: number, id: number): Card => ({ id, suit, rank });

/** Puts the game in a known spot: who holds what, what lies on the table. */
function setUp(game: PistiGame, hands: Card[][], pile: Card[], turn = 0, deck: Card[] = []) {
  const g = game as unknown as { hands: Card[][]; pile: Card[]; hidden: number; turn: number; deck: Card[] };
  g.hands = hands;
  g.pile = pile;
  g.hidden = 0;
  g.turn = turn;
  g.deck = deck;
}

function view(game: PistiGame, id = "p0") {
  return game.getView(id) as PistiView;
}

describe("Pişti", () => {
  it("deals four cards each and four to the table, three of them face down", () => {
    const { ctx } = fakeContext(2);
    const game = new PistiGame(ctx, {});
    const v = view(game);
    expect(v.hand).toHaveLength(4);
    expect(v.seats.map((s) => s.handCount)).toEqual([4, 4]);
    expect(v.pile).toHaveLength(1);
    expect(v.pileHidden).toBe(3);
    expect(v.deckCount).toBe(52 - 4 - 8);
    expect(newDeck().reduce((sum, c) => sum + cardPoints(c), 0)).toBe(13);
  });

  it("only seats two or four", () => {
    expect(() => new PistiGame(fakeContext(3).ctx, {})).toThrow();
  });

  it("scores a pişti for matching a lone card, and twenty for a jack on a jack", () => {
    const { ctx } = fakeContext(2);
    const game = new PistiGame(ctx, {});
    setUp(game, [[card("hearts", 7, 1), card("clubs", 11, 2)], [card("spades", 3, 3), card("spades", 11, 4)]], [card("diamonds", 7, 5)]);
    game.handleAction("p0", { type: "play", cardId: 1 });
    let v = view(game);
    expect(v.lastMove).toMatchObject({ seat: 0, took: 2, pisti: 10 });
    expect(v.sides[0]).toMatchObject({ captured: 2, pistis: 1, pistiPoints: 10 });
    expect(v.pile).toEqual([]);

    // A jack on a lone non-jack takes it, but that is no pişti.
    game.handleAction("p1", { type: "play", cardId: 3 });
    game.handleAction("p0", { type: "play", cardId: 2 });
    v = view(game);
    expect(v.lastMove).toMatchObject({ took: 2, pisti: 0 });

    setUp(game, [[card("hearts", 11, 6), card("hearts", 5, 9)], [card("spades", 11, 4), card("spades", 6, 10)]], [], 1);
    game.handleAction("p1", { type: "play", cardId: 4 });
    game.handleAction("p0", { type: "play", cardId: 6 });
    expect(view(game).lastMove).toMatchObject({ seat: 0, pisti: 20 });
    expect(view(game).sides[0].pistiPoints).toBe(30);
  });

  it("refuses moves out of turn and cards not in hand", () => {
    const { ctx } = fakeContext(2);
    const game = new PistiGame(ctx, {});
    const v = view(game);
    const notMine = v.turn === 0 ? "p1" : "p0";
    expect(() => game.handleAction(notMine, { type: "play", cardId: view(game, notMine).hand[0].id })).toThrow("Sıra");
    expect(() => game.handleAction(v.seats[v.turn].id, { type: "play", cardId: 999 })).toThrow();
  });

  it("gives the last pile to the last taker and counts the round", () => {
    const { ctx } = fakeContext(2);
    const game = new PistiGame(ctx, { target: 51 });
    setUp(
      game,
      [[card("diamonds", 10, 1)], [card("clubs", 2, 2)]],
      [card("spades", 1, 3), card("hearts", 10, 4)],
    );
    // p0 takes the pile with the 10 of diamonds; p1's 2 of clubs is left and goes to p0 too.
    game.handleAction("p0", { type: "play", cardId: 1 });
    game.handleAction("p1", { type: "play", cardId: 2 });
    const v = view(game);
    expect(v.phase).toBe("roundOver");
    expect(v.lastRound!.sides[0]).toEqual({ cards: 4, majority: 3, cardPoints: 1 + 3 + 2, pistiPoints: 0, total: 9 });
    expect(v.lastRound!.sides[1].total).toBe(0);
    expect(v.sides[0].score).toBe(9);
    expect(v.gameOver).toBe(false);
    expect(() => game.handleAction("p1", { type: "nextRound" })).toThrow("oda sahibi");
    game.handleAction("p0", { type: "nextRound" });
    expect(view(game).round).toBe(2);
    expect(view(game).sides[0].captured).toBe(0);
  });

  it("pairs partners across the table when played eşli", () => {
    const { ctx } = fakeContext(4);
    const game = new PistiGame(ctx, { teams: 1 });
    const v = view(game);
    expect(v.sides.map((s) => s.seats)).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(v.seats.map((s) => s.side)).toEqual([0, 1, 0, 1]);
    expect(view(new PistiGame(fakeContext(4).ctx, { teams: 0 })).sides).toHaveLength(4);
  });

  it("lets bots play whole games to the target", () => {
    for (const [count, teams] of [
      [2, 0],
      [4, 0],
      [4, 1],
    ]) {
      for (let seed = 1; seed <= 5; seed++) {
        const { ctx } = fakeContext(count, seed);
        const game = new PistiGame(ctx, { teams, target: 101 });
        const ids = ctx.players.map((p) => p.id);
        for (let step = 0; step < 5000 && !view(game).gameOver; step++) {
          const v = view(game);
          if (v.phase === "roundOver") {
            const total = v.lastRound!.sides.reduce((sum, r) => sum + r.cards, 0);
            expect(total).toBe(52);
            game.handleAction("p0", { type: "nextRound" });
            continue;
          }
          const id = ids.find((p) => game.botAction(p))!;
          game.handleAction(id, game.botAction(id)!);
        }
        const v = view(game);
        expect(v.gameOver).toBe(true);
        expect(Math.max(...v.sides.map((s) => s.score))).toBeGreaterThanOrEqual(101);
      }
    }
  });

  it("plays the card for a player whose time runs out", () => {
    const { ctx, runTimers } = fakeContext(2);
    const game = new PistiGame(ctx, { turnSeconds: 15 });
    const before = view(game);
    expect(before.turnMsLeft).toBeGreaterThan(0);
    runTimers();
    const after = view(game);
    expect(after.turn).not.toBe(before.turn);
    expect(after.notice).toContain("süresini doldurdu");
  });
});
