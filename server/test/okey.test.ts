import { describe, expect, it } from "vitest";
import type { Tile, TileColor } from "../../shared/games/okey.js";
import { OkeyGame } from "../src/games/okey/okey.js";
import { createTiles } from "../src/games/okey/tiles.js";
import { fakeContext } from "./helpers.js";

const okeyTile = { color: "black" as TileColor, value: 7 };

/** Builds a deal where the dealer's hand starts with the given tiles. */
function rigged(dealerHand: [TileColor | null, number][], handSize: number) {
  const pool = createTiles();
  const take = (color: TileColor | null, value: number) => {
    const i = pool.findIndex((t) => t.color === color && t.value === value);
    return pool.splice(i, 1)[0];
  };
  const indicator = take("black", 6);
  const hand = dealerHand.map(([c, v]) => take(c, v));
  const rest = pool;
  const tiles: Tile[] = [...hand, ...rest.splice(0, handSize + 1 - hand.length), ...rest];
  return { tiles, indicator, okey: okeyTile };
}

function newGame(variant: "okey" | "okey101", hand: [TileColor | null, number][], options: Record<string, unknown> = { rounds: 2 }) {
  const { ctx, runTimers } = fakeContext(4, 3);
  const game = new OkeyGame(ctx, variant, options);
  game.startRound(rigged(hand, variant === "okey" ? 14 : 21));
  const dealer = game.getView("p0").dealer;
  return { game, dealerId: `p${dealer}`, dealer, runTimers };
}

const winningHand: [TileColor | null, number][] = [
  ["red", 1], ["red", 2], ["red", 3], ["red", 4],
  ["blue", 9], ["yellow", 9], ["black", 9],
  ["yellow", 11], ["yellow", 12], ["yellow", 13], ["yellow", 1],
  ["red", 5], ["blue", 5], ["yellow", 5],
  ["blue", 12],
];

describe("Okey", () => {
  it("deals 15 to the dealer and 14 to the others", () => {
    const { game, dealer } = newGame("okey", []);
    const v = game.getView("p0");
    v.seats.forEach((s, i) => expect(s.handCount).toBe(i === dealer ? 15 : 14));
    expect(v.centerCount).toBe(106 - 1 - 15 - 14 * 3);
  });

  it("enforces turn order and draw/discard phases", () => {
    const { game, dealerId, dealer } = newGame("okey", []);
    const next = `p${(dealer + 1) % 4}`;
    expect(() => game.handleAction(next, { type: "drawCenter" })).toThrow();
    expect(() => game.handleAction(dealerId, { type: "drawCenter" })).toThrow();
    const tile = game.getView(dealerId).hand[0];
    game.handleAction(dealerId, { type: "discard", tileId: tile.id });
    game.handleAction(next, { type: "drawDiscard" });
    expect(game.getView(next).hand.some((t) => t.id === tile.id)).toBe(true);
  });

  it("finishes a valid hand and scores it", () => {
    const { game, dealerId, dealer } = newGame("okey", winningHand);
    const hand = game.getView(dealerId).hand;
    const loose = hand.find((t) => t.color === "blue" && t.value === 12)!;
    const wrong = hand.find((t) => t.color === "red" && t.value === 1)!;
    expect(() => game.handleAction(dealerId, { type: "finish", tileId: wrong.id })).toThrow();
    game.handleAction(dealerId, { type: "finish", tileId: loose.id });
    const v = game.getView("p0");
    expect(v.phase).toBe("roundOver");
    expect(v.seats[dealer].score).toBe(2);
    expect(v.lastRound!.winnerId).toBe(dealerId);
  });
});

describe("Okey settings", () => {
  it("katlamalı: everyone starts with points and the others lose them", () => {
    const { game, dealerId, dealer } = newGame("okey", winningHand, { katlamali: 1, startPoints: 10 });
    expect(game.getView("p0").seats.map((s) => s.score)).toEqual([10, 10, 10, 10]);
    expect(game.getView("p0").totalRounds).toBe(0);
    const loose = game.getView(dealerId).hand.find((t) => t.color === "blue" && t.value === 12)!;
    game.handleAction(dealerId, { type: "finish", tileId: loose.id });
    const v = game.getView("p0");
    expect(v.seats.map((s, i) => (i === dealer ? s.score : s.score + 2))).toEqual([10, 10, 10, 10]);
    expect(v.gameOver).toBe(false);
  });

  it("katlamalı: the game ends once someone runs out of points", () => {
    const { game, dealerId } = newGame("okey", winningHand, { katlamali: 1, startPoints: 4 });
    const loose = game.getView(dealerId).hand.find((t) => t.color === "blue" && t.value === 12)!;
    game.handleAction(dealerId, { type: "finish", tileId: loose.id });
    expect(game.getView("p0").gameOver).toBe(false);
    game.handleAction("p0", { type: "nextRound" });
    game.startRound(rigged(winningHand, 14));
    const dealer2 = game.getView("p0").dealer;
    const id2 = `p${dealer2}`;
    const loose2 = game.getView(id2).hand.find((t) => t.color === "blue" && t.value === 12)!;
    game.handleAction(id2, { type: "finish", tileId: loose2.id });
    expect(game.getView("p0").gameOver).toBe(true);
  });

  it("lets the holder of the indicator's twin show it once, before discarding", () => {
    const { game, dealerId, dealer } = newGame("okey", [["black", 6]], { katlamali: 1, startPoints: 20 });
    const others = game.getView("p0").seats.map((_, i) => i).filter((i) => i !== dealer);
    expect(game.getView(dealerId).canShowIndicator).toBe(true);
    expect(game.getView(`p${others[0]}`).canShowIndicator).toBe(false);
    game.handleAction(dealerId, { type: "showIndicator" });
    const v = game.getView("p0");
    expect(v.seats[dealer].score).toBe(20);
    others.forEach((i) => expect(v.seats[i].score).toBe(19));
    expect(() => game.handleAction(dealerId, { type: "showIndicator" })).toThrow();
  });

  it("can turn the indicator bonus off", () => {
    const { game, dealerId } = newGame("okey", [["black", 6]], { gosterge: 0 });
    expect(game.getView(dealerId).canShowIndicator).toBe(false);
  });

  it("plays the turn automatically when the clock runs out", () => {
    const { game, dealerId, dealer, runTimers } = newGame("okey", [], { turnSeconds: 30 });
    expect(game.getView("p0").turnMsLeft).toBeGreaterThan(29000);
    runTimers();
    const v = game.getView("p0");
    expect(v.seats[dealer].handCount).toBe(14);
    expect(v.turn).toBe((dealer + 1) % 4);
    expect(v.notice).toMatch(/süresini doldurdu/);
    expect(game.getView(dealerId).turnMsLeft).toBeGreaterThan(29000);
  });

  it("has no clock when turns are untimed", () => {
    const { game } = newGame("okey", []);
    expect(game.getView("p0").turnMsLeft).toBeNull();
  });
});

describe("101 Okey", () => {
  const opening: [TileColor | null, number][] = [
    ["red", 10], ["red", 11], ["red", 12], ["red", 13],
    ["blue", 10], ["yellow", 10], ["black", 10],
    ["blue", 11], ["yellow", 11], ["black", 11],
  ];

  it("requires 101 points to open, then lets the player add to melds", () => {
    const { game, dealerId, dealer } = newGame("okey101", opening);
    const hand = game.getView(dealerId).hand;
    const ids = (pred: (t: Tile) => boolean) => hand.filter(pred).map((t) => t.id);
    const shortRun = ids((t) => t.color === "red" && t.value >= 11);
    const tens = ids((t) => t.value === 10 && t.color !== "red").slice(0, 3);
    const elevens = ids((t) => t.value === 11 && t.color !== "red").slice(0, 3);
    expect(() => game.handleAction(dealerId, { type: "open", groups: [shortRun, tens, elevens] })).toThrow(/99/);

    const redTen = ids((t) => t.color === "red" && t.value === 10)[0];
    game.handleAction(dealerId, { type: "open", groups: [shortRun, tens, elevens].map((g, i) => (i === 0 ? [redTen, ...g] : g)) });
    const v = game.getView(dealerId);
    expect(v.opened[dealer]).toBe("series");
    expect(v.table).toHaveLength(3);
    expect(v.hand).toHaveLength(22 - 10);
    expect(v.table[0].tiles.map((t) => t.value)).toEqual([10, 11, 12, 13]);
  });

  it("forces a tile taken from the side to be used or returned", () => {
    const { game, dealerId, dealer } = newGame("okey101", []);
    const next = `p${(dealer + 1) % 4}`;
    const thrown = game.getView(dealerId).hand[0];
    game.handleAction(dealerId, { type: "discard", tileId: thrown.id });
    game.handleAction(next, { type: "drawDiscard" });
    const other = game.getView(next).hand.find((t) => t.id !== thrown.id)!;
    expect(() => game.handleAction(next, { type: "discard", tileId: other.id })).toThrow(/kullanmalısın/);
    game.handleAction(next, { type: "returnDiscard" });
    game.handleAction(next, { type: "drawCenter" });
    game.handleAction(next, { type: "discard", tileId: other.id });
  });
});

describe("Eşli", () => {
  it("katlamalı: only the other team loses points, partners stay level", () => {
    const { game, dealerId, dealer } = newGame("okey", winningHand, { katlamali: 1, startPoints: 20, esli: 1 });
    const loose = game.getView(dealerId).hand.find((t) => t.color === "blue" && t.value === 12)!;
    game.handleAction(dealerId, { type: "finish", tileId: loose.id });
    const v = game.getView("p0");
    v.seats.forEach((s, i) => expect(s.score).toBe(i % 2 === dealer % 2 ? 20 : 18));
    expect(v.teamScores![dealer % 2]).toBe(20);
    expect(v.teamScores![(dealer + 1) % 2]).toBe(18);
  });

  it("normal okey: the winner's partner scores too", () => {
    const { game, dealerId, dealer } = newGame("okey", winningHand, { esli: 1 });
    const loose = game.getView(dealerId).hand.find((t) => t.color === "blue" && t.value === 12)!;
    game.handleAction(dealerId, { type: "finish", tileId: loose.id });
    const v = game.getView("p0");
    expect(v.seats[(dealer + 2) % 4].score).toBe(2);
    expect(v.teamScores![dealer % 2]).toBe(2);
  });

  it("101: team score is the two partners' penalties added up", () => {
    const { game } = newGame("okey101", [], { esli: 1 });
    expect(game.getView("p0").teamScores).toEqual([0, 0]);
    expect(newGame("okey101", []).game.getView("p0").teamScores).toBeNull();
  });
});
