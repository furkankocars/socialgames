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

function newGame(variant: "okey" | "okey101", hand: [TileColor | null, number][]) {
  const { ctx } = fakeContext(4, 3);
  const game = new OkeyGame(ctx, variant, { rounds: 2 });
  game.startRound(rigged(hand, variant === "okey" ? 14 : 21));
  const dealer = game.getView("p0").dealer;
  return { game, dealerId: `p${dealer}`, dealer };
}

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
    const { game, dealerId, dealer } = newGame("okey", [
      ["red", 1], ["red", 2], ["red", 3], ["red", 4],
      ["blue", 9], ["yellow", 9], ["black", 9],
      ["yellow", 11], ["yellow", 12], ["yellow", 13], ["yellow", 1],
      ["red", 5], ["blue", 5], ["yellow", 5],
      ["blue", 12],
    ]);
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
