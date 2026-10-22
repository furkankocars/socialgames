/** Word categories, in the order the lobby lists them. Index 0 means every category. */
export const CASUS_CATEGORIES = ["Tümü", "Ülke", "Şehir", "Eşya", "Aktivite", "Meslek", "Yemek", "Hayvan", "Spor", "Yabancı Ünlü", "Mekan"] as const;

export type CasusPhase = "reveal" | "talk" | "vote" | "guess" | "result" | "finished";

/** How a round ended. */
export type CasusOutcome =
  /** The table voted out a spy and the spy then missed the word. */
  | "caught"
  /** The vote missed the spies, or tied. */
  | "escaped"
  /** A spy named the word, before or after the vote. */
  | "guessed"
  /** A spy tried the word during questions and missed. */
  | "missed";

export interface CasusView {
  phase: CasusPhase;
  round: number;
  rounds: number;
  /** The category the host picked, "Tümü" included. */
  category: string;
  spyCount: number;
  isSpy: boolean;
  /** The secret word; null for a spy until the round is over. */
  word: string | null;
  /** The secret word's own category; hidden from spies until the round is over. */
  wordCategory: string | null;
  /** Everyone sees the list the spy picks from, so nobody hints too broadly. */
  candidates: string[];
  /** Who opens the questions this round. */
  firstAsker: string;
  /** Reveal: players who have seen their card. */
  ready: string[];
  /** Questions: players who want to go to the vote now. */
  wantVote: string[];
  /** Vote: who has voted; the choices stay secret until everyone has. */
  voted: string[];
  myVote: string | null;
  /** All votes, once the vote is over. */
  votes: Record<string, string> | null;
  talkMsLeft: number | null;
  talkSeconds: number;
  /** The player the vote landed on, null on a tie. */
  accusedId: string | null;
  /** The spy who gets to name the word. */
  guesserId: string | null;
  guess: string | null;
  /** Revealed when the round is over; a spy only ever sees themselves before that. */
  spies: string[];
  outcome: CasusOutcome | null;
  winner: "spies" | "town" | null;
  scores: Record<string, number>;
  log: string[];
}

export type CasusAction =
  | { type: "ready" }
  | { type: "wantVote"; on: boolean }
  | { type: "vote"; targetId: string }
  | { type: "guess"; word: string }
  | { type: "next" };
