export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

export interface Card {
  id: number;
  suit: Suit;
  /** 1 is the ace, 11 the jack (vale), 12 the queen, 13 the king. */
  rank: number;
}

export const JACK = 11;

/** What a card is worth at the end of a round: aces and jacks 1, 2 of clubs 2, 10 of diamonds 3. */
export function cardPoints(card: Card): number {
  if (card.rank === 1 || card.rank === JACK) return 1;
  if (card.rank === 2 && card.suit === "clubs") return 2;
  if (card.rank === 10 && card.suit === "diamonds") return 3;
  return 0;
}

export const PISTI_POINTS = 10;
/** A jack played on a lone jack. */
export const JACK_PISTI_POINTS = 20;
/** Going to the side that took the most cards. */
export const MAJORITY_POINTS = 3;

export interface PistiSide {
  /** Seats that score together: one seat, or two partners sitting across. */
  seats: number[];
  score: number;
  /** Cards taken this round. */
  captured: number;
  /** Pişti points made this round. */
  pistiPoints: number;
  pistis: number;
}

export interface PistiSeatView {
  id: string;
  handCount: number;
  side: number;
}

export interface PistiMove {
  /** Grows with every card played, so the client can animate each one once. */
  id: number;
  seat: number;
  card: Card;
  /** The pile this card took, including itself; empty when it stayed on the pile. */
  took: number;
  /** 0, 10 or 20. */
  pisti: number;
}

export interface PistiSideResult {
  cards: number;
  majority: number;
  cardPoints: number;
  pistiPoints: number;
  total: number;
}

export interface PistiRoundResult {
  /** In side order. */
  sides: PistiSideResult[];
  note: string;
}

export interface PistiView {
  phase: "play" | "roundOver";
  round: number;
  /** The game ends after a round in which a side reaches this many points. */
  target: number;
  teams: boolean;
  seats: PistiSeatView[];
  sides: PistiSide[];
  mySeat: number;
  turn: number;
  dealer: number;
  hand: Card[];
  /** Face-up cards on the pile, oldest first. */
  pile: Card[];
  /** The three cards dealt face down under the first open card. */
  pileHidden: number;
  deckCount: number;
  lastMove: PistiMove | null;
  /** Who took cards last; the pile left at the end of a round goes to them. */
  lastTaker: number | null;
  lastRound: PistiRoundResult | null;
  gameOver: boolean;
  turnMsLeft: number | null;
  turnSeconds: number;
  notice: string | null;
}

export type PistiAction = { type: "play"; cardId: number } | { type: "nextRound" };

const RANK_LABELS: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}
