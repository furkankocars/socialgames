// Okey rules both sides need: the server to check moves, the client to show
// what the tiles on your rack add up to.
import type { Tile, TileColor } from "./okey.js";

export interface Okey {
  color: TileColor;
  value: number;
}

export function isWild(tile: Tile, okey: Okey): boolean {
  return tile.color === okey.color && tile.value === okey.value;
}

/** Color/value a non-wild tile counts as; false jokers stand in for the okey. */
export function effective(tile: Tile, okey: Okey): { color: TileColor; value: number } {
  return tile.color === null ? { color: okey.color, value: okey.value } : { color: tile.color, value: tile.value };
}

interface Split {
  normals: { color: TileColor; value: number }[];
  wilds: number;
}

export function split(tiles: Tile[], okey: Okey): Split {
  const normals = tiles.filter((t) => !isWild(t, okey)).map((t) => effective(t, okey));
  return { normals, wilds: tiles.length - normals.length };
}

export type GroupKind = "run" | "set" | "pair";

/**
 * Checks a single laid-down group. Wilds are placed to give the group the most
 * points. Returns null when the tiles don't form a valid run or set.
 */
export function analyzeGroup(tiles: Tile[], okey: Okey): { kind: "run" | "set"; points: number; ordered: Tile[] } | null {
  if (tiles.length < 3) return null;
  const real = tiles.filter((t) => !isWild(t, okey));
  const wildTiles = tiles.filter((t) => isWild(t, okey));
  const normals = real.map((t) => effective(t, okey));
  if (normals.length === 0) return null;

  if (tiles.length <= 4) {
    const value = normals[0].value;
    const colors = new Set(normals.map((n) => n.color));
    if (normals.every((n) => n.value === value) && colors.size === normals.length) {
      return { kind: "set", points: value * tiles.length, ordered: [...real, ...wildTiles] };
    }
  }

  const color = normals[0].color;
  if (!normals.every((n) => n.color === color)) return null;
  const len = tiles.length;
  if (len > 13) return null;
  let best: { points: number; ordered: Tile[] } | null = null;
  // A run covers positions start..start+len-1 where position 14 is the 1 after 13.
  for (let start = 1; start + len - 1 <= 14; start++) {
    const slots: (Tile | null)[] = new Array(len).fill(null);
    let fits = true;
    normals.forEach((n, i) => {
      if (!fits) return;
      let pos = n.value;
      if (pos === 1 && start > 1) pos = 14;
      const slot = pos - start;
      if (slot < 0 || slot >= len || slots[slot]) fits = false;
      else slots[slot] = real[i];
    });
    if (!fits) continue;
    const wildQueue = wildTiles.slice();
    const ordered = slots.map((t) => t ?? wildQueue.shift()!);
    let points = 0;
    for (let p = start; p < start + len; p++) points += p === 14 ? 1 : p;
    if (!best || points > best.points) best = { points, ordered };
  }
  return best && { kind: "run", ...best };
}

export function isPair(tiles: Tile[], okey: Okey): boolean {
  if (tiles.length !== 2) return false;
  const { normals } = split(tiles, okey);
  if (normals.length < 2) return true;
  return normals[0].color === normals[1].color && normals[0].value === normals[1].value;
}


const COLORS: TileColor[] = ["red", "yellow", "blue", "black"];
/** Tile kinds as indexes: color * 13 + (value - 1); the okey's own wild tiles are WILD. */
const WILD = 52;
const MAX_SEARCH_STEPS = 60000;

interface Candidate {
  /** Kind index for every tile in the group (WILD for an okey). */
  kinds: number[];
  points: number;
}

function kindOf(tile: Tile, okey: Okey): number {
  if (isWild(tile, okey)) return WILD;
  const e = effective(tile, okey);
  return COLORS.indexOf(e.color) * 13 + e.value - 1;
}

/** Every run and set the hand could form, by tile kind. */
function candidates(counts: number[]): Candidate[] {
  const wilds = counts[WILD];
  const has = (color: number, value: number) => counts[color * 13 + value - 1] > 0;
  const out: Candidate[] = [];
  // Sets: one value, distinct colors, okeys filling missing colors.
  for (let value = 1; value <= 13; value++) {
    const colors = [0, 1, 2, 3].filter((c) => has(c, value));
    for (let mask = 1; mask < 16; mask++) {
      const chosen = colors.filter((_, i) => mask & (1 << i));
      if (chosen.length === 0 || mask >= 1 << colors.length) continue;
      for (let w = 0; w <= Math.min(wilds, 4 - chosen.length); w++) {
        const size = chosen.length + w;
        if (size < 3 || size > 4) continue;
        out.push({ kinds: [...chosen.map((c) => c * 13 + value - 1), ...Array(w).fill(WILD)], points: value * size });
      }
    }
  }
  // Runs: one color, consecutive values (13 can be followed by 1), okeys filling gaps.
  for (let c = 0; c < 4; c++) {
    for (let start = 1; start <= 12; start++) {
      const kinds: number[] = [];
      let points = 0;
      let used = 0;
      for (let pos = start; pos <= 14 && kinds.length < 13; pos++) {
        const value = pos === 14 ? 1 : pos;
        if (has(c, value)) kinds.push(c * 13 + value - 1);
        else if (used < wilds) {
          kinds.push(WILD);
          used++;
        } else break;
        points += value;
        if (kinds.length >= 3 && kinds.some((k) => k !== WILD)) {
          out.push({ kinds: kinds.slice(), points });
          // The same run with an okey standing in for a tile we'd rather keep.
          for (let i = 0; i < kinds.length && used < wilds; i++) {
            if (kinds[i] === WILD) continue;
            const swapped = kinds.slice();
            swapped[i] = WILD;
            if (swapped.some((k) => k !== WILD)) out.push({ kinds: swapped, points });
          }
        }
      }
    }
  }
  return out;
}

/**
 * The best way to split a hand into runs and sets. `byTiles` favours using
 * as many tiles as possible (normal okey); otherwise the most points (101).
 */
export function bestGroups(tiles: Tile[], okey: Okey, byTiles = false): { groups: Tile[][]; points: number } {
  const counts = new Array(WILD + 1).fill(0);
  for (const t of tiles) counts[kindOf(t, okey)]++;
  const all = candidates(counts);
  const byFirst = new Map<number, Candidate[]>();
  for (const cand of all) {
    for (const k of new Set(cand.kinds)) byFirst.set(k, [...(byFirst.get(k) ?? []), cand]);
  }
  const value = (c: Candidate) => (byTiles ? c.kinds.length * 1000 : 0) + c.points;
  const memo = new Map<string, { score: number; picks: Candidate[] }>();
  let steps = 0;

  const search = (from: number): { score: number; picks: Candidate[] } => {
    let k = from;
    while (k <= WILD && counts[k] === 0) k++;
    if (k > WILD || ++steps > MAX_SEARCH_STEPS) return { score: 0, picks: [] };
    const key = `${k}:${counts.join("")}`;
    const hit = memo.get(key);
    if (hit) return hit;
    // Leave one tile of this kind out of every group.
    counts[k]--;
    let best = search(k);
    counts[k]++;
    for (const cand of byFirst.get(k) ?? []) {
      // Only groups whose lowest kind is this one, so each split is tried once.
      if (Math.min(...cand.kinds) !== k) continue;
      const need = new Map<number, number>();
      for (const x of cand.kinds) need.set(x, (need.get(x) ?? 0) + 1);
      if ([...need].some(([x, n]) => counts[x] < n)) continue;
      for (const [x, n] of need) counts[x] -= n;
      const rest = search(k);
      for (const [x, n] of need) counts[x] += n;
      const score = rest.score + value(cand);
      if (score > best.score) best = { score, picks: [cand, ...rest.picks] };
    }
    memo.set(key, best);
    return best;
  };

  const { picks } = search(0);
  const pool = new Map<number, Tile[]>();
  for (const t of tiles) {
    const k = kindOf(t, okey);
    pool.set(k, [...(pool.get(k) ?? []), t]);
  }
  const groups = picks.map((p) => p.kinds.map((k) => pool.get(k)!.shift()!));
  // Count each group the way the table will when it's laid down.
  return { groups, points: groups.reduce((n, g) => n + (analyzeGroup(g, okey)?.points ?? 0), 0) };
}
