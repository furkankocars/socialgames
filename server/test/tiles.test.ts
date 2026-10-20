import { describe, expect, it } from "vitest";
import type { Tile, TileColor } from "../../shared/games/okey.js";
import { analyzeGroup, canFinishWithMelds, canFinishWithPairs, createTiles, isPair } from "../src/games/okey/tiles.js";

const okey = { color: "black" as TileColor, value: 7 };
let nextId = 1000;
const t = (color: TileColor | null, value: number): Tile => ({ id: nextId++, color, value });
const W = () => t("black", 7); // the okey tile itself is wild
const F = () => t(null, 0); // false joker stands for black 7

describe("createTiles", () => {
  it("has 106 tiles", () => {
    expect(createTiles()).toHaveLength(106);
  });
});

describe("canFinishWithMelds", () => {
  it("accepts runs and sets", () => {
    const hand = [
      t("red", 1), t("red", 2), t("red", 3), t("red", 4),
      t("blue", 9), t("yellow", 9), t("black", 9),
      t("yellow", 11), t("yellow", 12), t("yellow", 13), t("yellow", 1),
      t("red", 5), t("blue", 5), t("yellow", 5),
    ];
    expect(canFinishWithMelds(hand, okey)).toBe(true);
  });

  it("uses wilds to fill gaps", () => {
    const hand = [
      t("red", 1), W(), t("red", 3),
      t("blue", 9), t("yellow", 9), W(),
      t("yellow", 10), t("yellow", 11), t("yellow", 12),
      t("blue", 2), t("blue", 3), t("blue", 4), t("blue", 5), t("blue", 6),
    ];
    expect(canFinishWithMelds(hand, okey)).toBe(true);
  });

  it("treats the false joker as the okey's value", () => {
    const hand = [
      t("black", 5), t("black", 6), F(),
      t("red", 1), t("red", 2), t("red", 3),
      t("blue", 1), t("blue", 2), t("blue", 3),
      t("yellow", 1), t("yellow", 2), t("yellow", 3), t("yellow", 4), t("yellow", 5),
    ];
    expect(canFinishWithMelds(hand, okey)).toBe(true);
  });

  it("rejects a loose tile", () => {
    const hand = [
      t("red", 1), t("red", 2), t("red", 3), t("red", 4),
      t("blue", 9), t("yellow", 9), t("black", 9),
      t("yellow", 11), t("yellow", 12), t("yellow", 13),
      t("red", 5), t("blue", 5), t("yellow", 5),
      t("blue", 12),
    ];
    expect(canFinishWithMelds(hand, okey)).toBe(false);
  });

  it("rejects wrapping past 1 (13-1-2)", () => {
    const hand = [
      t("red", 13), t("red", 1), t("red", 2),
      t("blue", 1), t("blue", 2), t("blue", 3),
      t("blue", 4), t("blue", 5), t("blue", 6),
      t("yellow", 1), t("yellow", 2), t("yellow", 3), t("yellow", 4), t("yellow", 5),
    ];
    expect(canFinishWithMelds(hand, okey)).toBe(false);
  });
});

describe("pairs", () => {
  it("accepts seven pairs with a wild", () => {
    const hand = [
      t("red", 1), t("red", 1), t("blue", 4), t("blue", 4), t("yellow", 8), t("yellow", 8),
      t("black", 2), t("black", 2), t("red", 13), t("red", 13), t("blue", 10), t("blue", 10),
      t("yellow", 3), W(),
    ];
    expect(canFinishWithPairs(hand, okey)).toBe(true);
  });

  it("checks a single pair", () => {
    expect(isPair([t("red", 3), t("red", 3)], okey)).toBe(true);
    expect(isPair([t("red", 3), t("blue", 3)], okey)).toBe(false);
  });
});

describe("analyzeGroup", () => {
  it("scores runs and sets", () => {
    expect(analyzeGroup([t("red", 10), t("red", 11), t("red", 12)], okey)).toMatchObject({ kind: "run", points: 33 });
    expect(analyzeGroup([t("red", 10), t("blue", 10), t("yellow", 10), t("black", 10)], okey)).toMatchObject({ kind: "set", points: 40 });
  });

  it("places a wild where it scores most", () => {
    const res = analyzeGroup([t("red", 11), t("red", 12), W()], okey);
    expect(res).toMatchObject({ kind: "run", points: 36 });
    expect(res!.ordered.map((x) => x.value)).toEqual([11, 12, 7]);
  });

  it("rejects mixed colors in a run", () => {
    expect(analyzeGroup([t("red", 1), t("blue", 2), t("red", 3)], okey)).toBeNull();
  });
});
