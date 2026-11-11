/** Lengths the host can pick; 0 means the words grow 4, 5, 6 and start over. */
export const LINGO_LENGTHS = [4, 5, 6] as const;

/** Rows on the shared board each round; the players take them in turn. */
export const LINGO_TRIES = 6;

/** Seconds a player has for a turn, as the host can pick them. */
export const LINGO_TURN_SECONDS = [20, 30, 45, 60] as const;

/**
 * What a letter of a guess shows: a green square for a letter in
 * its place, a yellow square for a letter that is in the word somewhere else.
 */
export type LingoMark = "hit" | "near" | "miss";

export interface LingoRow {
  /** Who took this row. */
  by: string;
  /** The guessed word; null when the turn ran out before a guess. */
  word: string | null;
  marks: LingoMark[];
}

export type LingoPhase = "play" | "result" | "finished";

export interface LingoView {
  phase: LingoPhase;
  round: number;
  rounds: number;
  length: number;
  tries: number;
  /** Everyone gets the first letter, as on the show. */
  first: string;
  /** The word, once the round is over. */
  word: string | null;
  /** The one board the whole table fills in turn, open to everyone. */
  rows: LingoRow[];
  /** Whose turn it is; null once the round is over. */
  turn: string | null;
  /** What the player on turn has typed so far, after the first letter, live for everyone. */
  draft: string;
  turnMsLeft: number | null;
  turnSeconds: number;
  /** Who found the word this round, and the points it brought. */
  solver: string | null;
  points: number;
  /** Until the next round deals itself. */
  nextMsLeft: number | null;
  /** Seat order, starting with whoever opens this round. */
  order: string[];
  scores: Record<string, number>;
  log: string[];
}

export type LingoAction = { type: "guess"; word: string } | { type: "draft"; word: string } | { type: "next" };

/** Points for finding the word on each row of the board: 6 on the first, 1 on the sixth. */
export function lingoPoints(row: number): number {
  return LINGO_TRIES + 1 - row;
}
