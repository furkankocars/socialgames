import type { OkeyAction, OkeyView, Tile } from "../../../../shared/games/okey.js";
import { autoLay } from "../../../../shared/games/okey-rules.js";
import { analyzeGroup, canFinishWithMelds, canFinishWithPairs, effective, isWild, meldTakes, type Okey } from "./tiles.js";

const OPEN_POINTS = 101;
const OPEN_PAIRS = 5;

/**
 * A plain but sensible player for a seat whose owner left. It sees only that
 * seat's view: draws, finishes when the hand allows it, lays down in 101, and
 * otherwise throws the tile that fits worst with the rest of the hand.
 */
export function okeyBotAction(view: OkeyView): OkeyAction | null {
  if (view.phase === "roundOver" || view.turn !== view.mySeat) return null;
  const { hand, okey } = view;

  if (view.phase === "draw") {
    const side = view.seats[(view.mySeat + 3) % 4].discards.at(-1);
    if (view.variant === "okey" && side && finishingTile([...hand, side], okey) !== null) return { type: "drawDiscard" };
    if (view.variant === "okey101" && side && useForSide(view, side) !== null) return { type: "drawDiscard" };
    return { type: "drawCenter" };
  }

  if (view.variant === "okey") {
    const finish = finishingTile(hand, okey);
    if (finish !== null) return { type: "finish", tileId: finish };
    return { type: "discard", tileId: worstTile(hand, okey).id };
  }
  return play101(view);
}

function play101(view: OkeyView): OkeyAction {
  const { hand, okey } = view;
  if (view.mustUseTileId !== null) {
    const side = hand.find((t) => t.id === view.mustUseTileId);
    return (side && useForSide(view, side, hand)) ?? { type: "returnDiscard" };
  }
  const opened = view.opened[view.mySeat];

  if (!opened) {
    const melds = keepOne(findMelds(hand, okey), hand);
    const points = melds.reduce((sum, g) => sum + analyzeGroup(g, okey)!.points, 0);
    if (points >= OPEN_POINTS) return { type: "open", groups: ids(melds) };
    const pairs = keepOne(findPairs(hand, okey), hand);
    if (pairs.length >= OPEN_PAIRS) return { type: "open", groups: ids(pairs) };
  } else {
    const more = keepOne(opened === "pairs" ? findPairs(hand, okey) : findMelds(hand, okey), hand);
    if (more.length) return { type: "layMelds", groups: ids(more) };
    if (opened === "series" && hand.length > 1) {
      for (const tile of hand) {
        for (const meld of view.table) {
          if (meld.kind === "pair") continue;
          const result = analyzeGroup([...meld.tiles, tile], okey);
          if (result?.kind === meld.kind) return { type: "addToMeld", meldId: meld.id, tileIds: [tile.id] };
        }
      }
    }
  }
  // With penalties on, keep the tiles that would fit a group on the table.
  const risky = (t: Tile) => view.penalties && meldTakes(t, view.table, okey) !== null;
  return { type: "discard", tileId: worstTile(hand, okey, risky).id };
}

/** 101: the move that plays a tile taken from the side, or null when it can't be used. */
function useForSide(view: OkeyView, side: Tile, hand = [...view.hand, side]): OkeyAction | null {
  const opened = view.opened[view.mySeat];
  if (opened === "series") {
    const meldId = meldTakes(side, view.table, view.okey);
    if (meldId !== null && hand.length > 1) return { type: "addToMeld", meldId, tileIds: [side.id] };
  }
  const auto = autoLay(hand, view.okey, opened, side.id);
  if (!auto.groups) return null;
  return { type: opened ? "layMelds" : "open", groups: auto.groups };
}

/** A tile whose discard leaves a finished hand, if there is one. */
function finishingTile(hand: Tile[], okey: Okey): number | null {
  const tried = new Set<string>();
  for (const tile of hand) {
    const key = `${tile.color}-${tile.value}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const rest = hand.filter((t) => t !== tile);
    if (canFinishWithPairs(rest, okey) || canFinishWithMelds(rest, okey)) return tile.id;
  }
  return null;
}

/** The tile with the fewest neighbours for runs, sets and pairs; never a wild unless nothing else is left. */
export function worstTile(hand: Tile[], okey: Okey, avoid: (t: Tile) => boolean = () => false): Tile {
  const plain = hand.filter((t) => !isWild(t, okey));
  const safe = plain.filter((t) => !avoid(t));
  const pool = safe.length ? safe : plain.length ? plain : hand;
  let worst = pool[0];
  let worstScore = Infinity;
  for (const tile of pool) {
    const a = effective(tile, okey);
    let score = 0;
    for (const other of plain) {
      if (other === tile) continue;
      const b = effective(other, okey);
      const gap = Math.abs(a.value - b.value);
      if (a.color === b.color) score += gap === 0 ? 2 : gap === 1 ? 3 : gap === 2 ? 1 : 0;
      else if (gap === 0) score += 2;
    }
    // Between equally loose tiles, throw the higher one (less penalty in 101).
    if (score < worstScore || (score === worstScore && a.value > effective(worst, okey).value)) {
      worst = tile;
      worstScore = score;
    }
  }
  return worst;
}

/** Greedy runs and sets, highest scoring first, then wilds wherever they fit. */
export function findMelds(hand: Tile[], okey: Okey): Tile[][] {
  let left = hand.filter((t) => !isWild(t, okey));
  const wilds = hand.filter((t) => isWild(t, okey));
  const melds: Tile[][] = [];
  for (;;) {
    let best: { tiles: Tile[]; points: number } | null = null;
    for (const group of candidates(left, okey)) {
      const result = analyzeGroup(group, okey);
      if (result && (!best || result.points > best.points)) best = { tiles: result.ordered, points: result.points };
    }
    if (!best) break;
    melds.push(best.tiles);
    left = left.filter((t) => !best!.tiles.includes(t));
  }
  for (const wild of wilds) {
    const i = melds.findIndex((g) => analyzeGroup([...g, wild], okey));
    if (i >= 0) melds[i] = analyzeGroup([...melds[i], wild], okey)!.ordered;
  }
  return melds;
}

function candidates(tiles: Tile[], okey: Okey): Tile[][] {
  const out: Tile[][] = [];
  const byValue = new Map<number, Map<string, Tile>>();
  const byColor = new Map<string, Map<number, Tile>>();
  for (const t of tiles) {
    const { color, value } = effective(t, okey);
    if (!byValue.has(value)) byValue.set(value, new Map());
    if (!byValue.get(value)!.has(color)) byValue.get(value)!.set(color, t);
    if (!byColor.has(color)) byColor.set(color, new Map());
    if (!byColor.get(color)!.has(value)) byColor.get(color)!.set(value, t);
  }
  for (const colors of byValue.values()) if (colors.size >= 3) out.push([...colors.values()]);
  for (const values of byColor.values()) {
    let run: Tile[] = [];
    for (let v = 1; v <= 14; v++) {
      const t = values.get(v === 14 ? 1 : v);
      if (t && !(v === 14 && run.length === 0) && !run.includes(t)) run.push(t);
      else {
        if (run.length >= 3) out.push(run);
        run = t ? [t] : [];
      }
    }
    if (run.length >= 3) out.push(run);
  }
  return out;
}

function findPairs(hand: Tile[], okey: Okey): Tile[][] {
  const seen = new Map<string, Tile>();
  const pairs: Tile[][] = [];
  for (const t of hand) {
    if (isWild(t, okey)) continue;
    const { color, value } = effective(t, okey);
    const key = `${color}-${value}`;
    const first = seen.get(key);
    if (first) {
      pairs.push([first, t]);
      seen.delete(key);
    } else seen.set(key, t);
  }
  return pairs;
}

/** Drops groups until at least one tile stays in hand for the discard. */
function keepOne(groups: Tile[][], hand: Tile[]): Tile[][] {
  const kept = groups.slice();
  while (kept.length && kept.reduce((n, g) => n + g.length, 0) >= hand.length) kept.pop();
  return kept;
}

function ids(groups: Tile[][]): number[][] {
  return groups.map((g) => g.map((t) => t.id));
}
