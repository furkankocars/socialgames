/** Lengths the host can pick; 0 means the words grow 4, 5, 6 and start over. */
export const LINGO_LENGTHS = [4, 5, 6] as const;

/** Tries each player gets at a word, as on the TV show. */
export const LINGO_TRIES = 5;

/**
 * What a letter of a guess shows: a green square for a letter in
 * its place, a yellow square for a letter that is in the word somewhere else.
 */
export type LingoMark = "hit" | "near" | "miss";

export interface LingoRow {
  /** The guessed word; null on someone else's board while the round is on. */
  word: string | null;
  marks: LingoMark[];
}

export interface LingoBoard {
  rows: LingoRow[];
  solved: boolean;
  /** Out of tries or solved. */
  done: boolean;
  /** Points this board earned in the round, once it is solved. */
  points: number;
  /** 1 for the first player to solve the word this round, 2 for the next, and so on. */
  place: number | null;
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
  roundMsLeft: number | null;
  roundSeconds: number;
  /** Until the next round deals itself. */
  nextMsLeft: number | null;
  boards: Record<string, LingoBoard>;
  scores: Record<string, number>;
  log: string[];
}

export type LingoAction = { type: "guess"; word: string } | { type: "next" };

/** Points for solving on each try: 5 on the first, 1 on the fifth. */
export function lingoPoints(tryNumber: number): number {
  return LINGO_TRIES + 1 - tryNumber;
}

/** Extra points for the first and second player to solve a word. */
export const LINGO_PLACE_BONUS = [2, 1];
