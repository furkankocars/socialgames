import { describe, expect, it } from "vitest";
import type { Tile, TileColor } from "../../shared/games/okey.js";
import { analyzeGroup, bestGroups } from "../../shared/games/okey-rules.js";
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
