import { TILE_COLORS, nextValue, type Tile, type TileColor } from "../../../../shared/games/okey.js";
import { shuffle } from "../types.js";
import { analyzeGroup, effective, isPair, isWild, split, type Okey } from "../../../../shared/games/okey-rules.js";

export { analyzeGroup, effective, isPair, isWild, type Okey };

/** The 106-tile set: two of every color/value plus two false jokers. */
export function createTiles(): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (const color of TILE_COLORS) {
      for (let value = 1; value <= 13; value++) tiles.push({ id: id++, color, value });
    }
    tiles.push({ id: id++, color: null, value: 0 });
  }
  return tiles;
}

export function dealSetup(random: () => number) {
  const tiles = shuffle(createTiles(), random);
  // The indicator can't be a false joker; swap one in from deeper in the pile.
  let indicatorIndex = tiles.findIndex((t) => t.color !== null);
  const indicator = tiles.splice(indicatorIndex, 1)[0];
  const okey: Okey = { color: indicator.color!, value: nextValue(indicator.value) };
  return { tiles, indicator, okey };
}

/** Whether the tiles can be split into seven pairs. */
export function canFinishWithPairs(tiles: Tile[], okey: Okey): boolean {
  if (tiles.length !== 14) return false;
  const { normals, wilds } = split(tiles, okey);
  const counts = new Map<string, number>();
  for (const n of normals) {
    const key = `${n.color}-${n.value}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let unpaired = 0;
  for (const c of counts.values()) unpaired += c % 2;
  return unpaired <= wilds;
}

/** Whether every tile can be placed into runs and sets. */
export function canFinishWithMelds(tiles: Tile[], okey: Okey): boolean {
  const { normals, wilds } = split(tiles, okey);
  // Count tiles by color and value (index 1-13).
  const counts: Record<TileColor, number[]> = {
    red: new Array(15).fill(0),
    yellow: new Array(15).fill(0),
    blue: new Array(15).fill(0),
    black: new Array(15).fill(0),
  };
  for (const n of normals) counts[n.color][n.value]++;
  return solve(counts, wilds, false);
}

function solve(counts: Record<TileColor, number[]>, wilds: number, haveGroup: boolean): boolean {
  // Lowest remaining tile, by color then value.
  let color: TileColor | null = null;
  let value = 0;
  for (const c of TILE_COLORS) {
    const v = counts[c].findIndex((n, i) => i >= 1 && i <= 13 && n > 0);
    if (v !== -1) {
      color = c;
      value = v;
      break;
    }
  }
  // Leftover wilds can always extend one of the groups.
  if (color === null) return wilds === 0 || haveGroup;

  counts[color][value]--;
  try {
    // Sets of the same value in different colors.
    const others = TILE_COLORS.filter((c) => c !== color && counts[c][value] > 0);
    for (let mask = 0; mask < 1 << others.length; mask++) {
      const picked = others.filter((_, i) => mask & (1 << i));
      for (let size = 3; size <= 4; size++) {
        const need = size - 1 - picked.length;
        if (need < 0 || need > wilds) continue;
        for (const c of picked) counts[c][value]--;
        const ok = solve(counts, wilds - need, true);
        for (const c of picked) counts[c][value]++;
        if (ok) return true;
      }
    }

    // Runs through this tile. No lower real tile of this color remains, so
    // anything below it is a wild; above it, each position takes either a real
    // tile or a wild. Position 14 is the 1 after 13.
    const row = counts[color];
    const extend = (pos: number, length: number, wildsLeft: number): boolean => {
      if (length >= 3 && solve(counts, wildsLeft, true)) return true;
      if (pos > 14 || length >= 13) return false;
      const realValue = pos === 14 ? 1 : pos;
      if (row[realValue] > 0) {
        row[realValue]--;
        const ok = extend(pos + 1, length + 1, wildsLeft);
        row[realValue]++;
        if (ok) return true;
      }
      return wildsLeft > 0 && extend(pos + 1, length + 1, wildsLeft - 1);
    };
    for (let lead = 0; lead <= wilds && value - lead >= 1; lead++) {
      if (extend(value + 1, 1 + lead, wilds - lead)) return true;
    }

    // The tile as the 1 after 13 (…12-13-1); the positions before it are
    // filled with real tiles or wilds.
    const fill = (v: number, wildsLeft: number): boolean => {
      if (v > 13) return solve(counts, wildsLeft, true);
      if (row[v] > 0) {
        row[v]--;
        const ok = fill(v + 1, wildsLeft);
        row[v]++;
        if (ok) return true;
      }
      return wildsLeft > 0 && fill(v + 1, wildsLeft - 1);
    };
    if (value === 1) {
      for (let start = 12; start >= 2; start--) if (fill(start, wilds)) return true;
    }
    return false;
  } finally {
    counts[color][value]++;
  }
}

/** Face value of a tile left in hand (101 penalties). */
export function tilePoints(tile: Tile, okey: Okey): number {
  if (isWild(tile, okey)) return okey.value;
  return effective(tile, okey).value;
}
