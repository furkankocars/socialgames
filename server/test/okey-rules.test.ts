import { describe, expect, it } from "vitest";
import type { Tile, TileColor } from "../../shared/games/okey.js";
import { analyzeGroup, autoLay, bestGroups, bestPairs, isPair } from "../../shared/games/okey-rules.js";
import { createTiles, dealSetup } from "../src/games/okey/tiles.js";
import { seeded } from "./helpers.js";

const okey = { color: "black" as TileColor, value: 7 };
let nextId = 1000;
const t = (color: TileColor | null, value: number): Tile => ({ id: nextId++, color, value });

describe("bestGroups", () => {
  it("finds runs and sets and adds up their points", () => {
    const hand = [t("red", 10), t("red", 11), t("red", 12), t("blue", 5), t("yellow", 5), t("black", 5), t("blue", 1)];
    const { groups, points } = bestGroups(hand, okey);
    expect(points).toBe(33 + 15);
    expect(groups).toHaveLength(2);
  });

  it("uses the okey to fill a gap", () => {
    const hand = [t("red", 10), t("red", 12), t("black", 7)];
    expect(bestGroups(hand, okey).points).toBe(33);
  });

  it("can use both copies of a tile in two groups", () => {
    const hand = [t("blue", 3), t("blue", 4), t("blue", 5), t("blue", 3), t("blue", 4), t("blue", 5)];
    expect(bestGroups(hand, okey).groups).toHaveLength(2);
  });

  it("returns only valid groups for random 101 hands, quickly", () => {
    const random = seeded(11);
    const started = Date.now();
    for (let i = 0; i < 30; i++) {
      const { tiles, okey: o } = dealSetup(random);
      const hand = tiles.slice(0, 22);
      const { groups, points } = bestGroups(hand, o);
      let sum = 0;
      const seen = new Set<number>();
      for (const g of groups) {
        const r = analyzeGroup(g, o);
        expect(r).not.toBeNull();
        sum += r!.points;
        for (const tile of g) {
          expect(seen.has(tile.id)).toBe(false);
          seen.add(tile.id);
        }
      }
      expect(points).toBe(sum);
    }
    expect(Date.now() - started).toBeLessThan(3000);
    expect(createTiles()).toHaveLength(106);
  });
});

describe("auto open (101)", () => {
  it("pairs okeys with loose tiles", () => {
    const hand = [t("red", 3), t("red", 3), t("blue", 9), t("black", 7), t("yellow", 2)];
    const pairs = bestPairs(hand, okey);
    expect(pairs).toHaveLength(2);
    pairs.forEach((p) => expect(isPair(p, okey)).toBe(true));
  });

  it("only opens with groups the server accepts, and keeps a tile to discard", () => {
    const random = seeded(23);
    let opened = 0;
    for (let i = 0; i < 60; i++) {
      const { tiles, okey: o } = dealSetup(random);
      const hand = tiles.slice(0, 22);
      const result = autoLay(hand, o, null);
      if (!result.groups) {
        expect(result.points).toBeLessThan(101);
        continue;
      }
      opened++;
      const byId = new Map(hand.map((x) => [x.id, x]));
      const groups = result.groups.map((g) => g.map((id) => byId.get(id)!));
      expect(groups.flat().length).toBeLessThan(hand.length);
      if (result.how === "pairs") groups.forEach((g) => expect(isPair(g, o)).toBe(true));
      else expect(groups.reduce((n, g) => n + analyzeGroup(g, o)!.points, 0)).toBeGreaterThanOrEqual(101);
    }
    expect(opened).toBeGreaterThan(0);
  });
});

describe("autoLay with a tile taken from the side", () => {
  it("builds the groups around that tile, or gives up when it fits nowhere", () => {
    const hand = [
      t("red", 10), t("red", 11), t("red", 12), t("red", 13),
      t("blue", 10), t("yellow", 10), t("black", 10),
      t("blue", 11), t("yellow", 11), t("black", 11),
      t("yellow", 12), t("blue", 2), t("red", 4), t("blue", 12), t("black", 12),
    ];
    const side = hand[10];
    const result = autoLay(hand, okey, null, side.id);
    expect(result.groups).not.toBeNull();
    expect(result.groups!.some((g) => g.includes(side.id))).toBe(true);
    const byId = new Map(hand.map((x) => [x.id, x]));
    const groups = result.groups!.map((g) => g.map((id) => byId.get(id)!));
    expect(groups.reduce((n, g) => n + analyzeGroup(g, okey)!.points, 0)).toBeGreaterThanOrEqual(101);

    const loose = hand[12];
    expect(autoLay(hand, okey, null, loose.id).groups).toBeNull();
    expect(autoLay(hand, okey, null).groups).not.toBeNull();
  });
});

describe("12-13-1", () => {
  it("is a run in normal okey but not in 101", () => {
    const run = [t("red", 12), t("red", 13), t("red", 1)];
    expect(analyzeGroup(run, okey)).toBeNull();
    expect(analyzeGroup(run, okey, true)!.points).toBe(26);
    expect(bestGroups(run, okey).groups).toHaveLength(0);
    expect(bestGroups(run, okey, true).groups).toHaveLength(1);
  });

  it("an okey can't stand in for the 1 after 13 in 101", () => {
    const run = [t("blue", 12), t("blue", 13), t("black", 7)];
    // Only as 11-12-13.
    expect(analyzeGroup(run, okey)!.points).toBe(36);
  });
});
