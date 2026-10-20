import type { Tile } from "../../../shared/games/okey";

export const ROW = 15;
export const SLOTS = ROW * 2;

export type Slots = (number | null)[];

/** Keeps the player's own arrangement, adding new tiles to free slots. */
export function syncSlots(slots: Slots, hand: Tile[]): Slots {
  const ids = new Set(hand.map((t) => t.id));
  const next = slots.length === SLOTS ? slots.map((id) => (id !== null && ids.has(id) ? id : null)) : new Array(SLOTS).fill(null);
  const placed = new Set(next.filter((id): id is number => id !== null));
  for (const t of hand) {
    if (placed.has(t.id)) continue;
    const free = next.indexOf(null);
    if (free === -1) break;
    next[free] = t.id;
  }
  return next;
}

/** Moves the given tiles so they start at the target slot; tiles in the way move to free slots. */
export function moveTiles(slots: Slots, ids: number[], target: number): Slots {
  const next = slots.map((id) => (id !== null && ids.includes(id) ? null : id));
  const displaced: number[] = [];
  let pos = Math.max(0, Math.min(target, SLOTS - ids.length));
  for (const id of ids) {
    if (next[pos] !== null) displaced.push(next[pos]!);
    next[pos++] = id;
  }
  for (const id of displaced) {
    let free = next.indexOf(null, pos);
    if (free === -1) free = next.indexOf(null);
    next[free] = id;
  }
  return next;
}

function layout(groups: Tile[][]): Slots {
  const slots: Slots = new Array(SLOTS).fill(null);
  let pos = 0;
  for (const g of groups) {
    const rowEnd = (Math.floor(pos / ROW) + 1) * ROW;
    if (pos + g.length > rowEnd && g.length <= ROW) pos = rowEnd;
    for (const t of g) if (pos < SLOTS) slots[pos++] = t.id;
    if (pos % ROW !== 0) pos++;
  }
  // Anything that didn't fit goes to the first free slots.
  const placed = new Set(slots);
  for (const g of groups) for (const t of g) if (!placed.has(t.id)) slots[slots.indexOf(null)] = t.id;
  return slots;
}

const colorOrder = { red: 0, yellow: 1, blue: 2, black: 3 } as const;
const isWild = (t: Tile, okey: { color: string; value: number }) => t.color === okey.color && t.value === okey.value;

/** Groups by color and consecutive values, jokers at the end. */
export function arrangeRuns(hand: Tile[], okey: { color: string; value: number }): Slots {
  const wilds = hand.filter((t) => isWild(t, okey));
  const rest = hand
    .filter((t) => !isWild(t, okey))
    .sort((a, b) => (a.color === null ? 9 : colorOrder[a.color]) - (b.color === null ? 9 : colorOrder[b.color]) || a.value - b.value);
  const groups: Tile[][] = [];
  for (const t of rest) {
    const g = groups[groups.length - 1];
    const last = g?.[g.length - 1];
    if (last && last.color === t.color && t.value === last.value + 1) g.push(t);
    else groups.push([t]);
  }
  if (wilds.length) groups.push(wilds);
  return layout(groups);
}

/** Puts identical tiles next to each other. */
export function arrangePairs(hand: Tile[], okey: { color: string; value: number }): Slots {
  const wilds = hand.filter((t) => isWild(t, okey));
  const byKey = new Map<string, Tile[]>();
  for (const t of hand) {
    if (isWild(t, okey)) continue;
    const key = `${t.color}-${t.value}`;
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }
  const groups = [...byKey.values()].sort((a, b) => b.length - a.length);
  if (wilds.length) groups.push(wilds);
  return layout(groups);
}

/** Selected tiles split into groups wherever the rack has a gap. */
export function selectedGroups(slots: Slots, selected: Set<number>): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  slots.forEach((id, i) => {
    if (i % ROW === 0 && current.length) {
      groups.push(current);
      current = [];
    }
    if (id !== null && selected.has(id)) current.push(id);
    else if (current.length) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}
