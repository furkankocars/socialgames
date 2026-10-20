export type TileColor = "red" | "yellow" | "blue" | "black";

export const TILE_COLORS: TileColor[] = ["red", "yellow", "blue", "black"];

export interface Tile {
  id: number;
  /** null only for the two false jokers (sahte okey). */
  color: TileColor | null;
  /** 1-13, or 0 for a false joker. */
  value: number;
}

export interface OkeySeatView {
  id: string;
  handCount: number;
  /** Tiles this seat discarded, oldest first. Only the last one can be taken. */
  discards: Tile[];
  score: number;
}

export interface OkeyView {
  variant: "okey" | "okey101";
  phase: "draw" | "discard" | "roundOver";
  round: number;
  totalRounds: number;
  seats: OkeySeatView[];
  mySeat: number;
  turn: number;
  dealer: number;
  hand: Tile[];
  indicator: Tile;
  /** The joker for this round: the tile one above the indicator. */
  okey: { color: TileColor; value: number };
  centerCount: number;
  lastRound: OkeyRoundResult | null;
  gameOver: boolean;
  /** 101 only. */
  table: OkeyMeld[];
  opened: ("series" | "pairs" | null)[];
  /** 101 only: a tile taken from the side that must be played this turn. */
  mustUseTileId: number | null;
}

export interface OkeyMeld {
  id: number;
  owner: string;
  kind: "run" | "set" | "pair";
  tiles: Tile[];
}

export interface OkeyRoundResult {
  winnerId: string | null;
  /** Points each seat gained this round, in seat order. */
  deltas: number[];
  note: string;
  /** The winning hand, revealed to everyone. */
  winningHand: Tile[] | null;
}

export type OkeyAction =
  | { type: "drawCenter" }
  | { type: "drawDiscard" }
  | { type: "discard"; tileId: number }
  | { type: "finish"; tileId: number }
  | { type: "nextRound" }
  // 101 only
  | { type: "open"; groups: number[][] }
  | { type: "layMelds"; groups: number[][] }
  | { type: "addToMeld"; meldId: number; tileIds: number[] }
  | { type: "returnDiscard" };

export function nextValue(value: number): number {
  return value === 13 ? 1 : value + 1;
}
