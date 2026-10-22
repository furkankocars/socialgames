import type { Card, Suit } from "./pisti.js";

export type { Card, Suit } from "./pisti.js";

/**
 * İhaleli: the highest bidder names trumps and must take that many tricks.
 * Koz maça: spades are always trumps and everyone says how many tricks they will take.
 */
export type BatakMode = "ihaleli" | "kozmaca";

export const HAND_SIZE = 13;
/** Lowest bid in ihaleli: alone, and for a pair playing together. */
export const MIN_BID = 4;
export const MIN_BID_TEAMS = 7;

/** Ace high: 2 is the lowest card, the ace (rank 1) the highest. */
export function cardValue(card: Card): number {
  return card.rank === 1 ? 14 : card.rank;
}

export interface TrickCard {
  seat: number;
  card: Card;
}

/** The seat whose card takes the trick: the highest trump, or else the highest card of the suit led. */
export function trickWinner(trick: TrickCard[], trump: Suit | null): number {
  const lead = trick[0].card.suit;
  const beats = (a: Card, b: Card) => {
    if (a.suit === b.suit) return cardValue(a) > cardValue(b);
    return a.suit === trump;
  };
  let best = trick[0];
  for (const t of trick.slice(1)) {
    if (t.card.suit !== lead && t.card.suit !== trump) continue;
    if (beats(t.card, best.card)) best = t;
  }
  return best.seat;
}

/**
 * The cards a player may play. Follow the suit led and beat the best card of
 * it if you can; with none of that suit, play a trump and beat the trumps
 * already down if you can. Trumps cannot be led until one has been played,
 * unless your hand holds nothing else.
 */
export function legalCards(hand: Card[], trick: TrickCard[], trump: Suit | null, trumpBroken: boolean): Card[] {
  if (trick.length === 0) {
    if (trump && !trumpBroken) {
      const others = hand.filter((c) => c.suit !== trump);
      if (others.length > 0) return others;
    }
    return hand;
  }
  const lead = trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === lead);
  if (follow.length > 0) {
    // Once someone trumped a plain suit, no card of that suit can win any more.
    if (lead !== trump && trick.some((t) => t.card.suit === trump)) return follow;
    const best = Math.max(...trick.filter((t) => t.card.suit === lead).map((t) => cardValue(t.card)));
    const higher = follow.filter((c) => cardValue(c) > best);
    return higher.length > 0 ? higher : follow;
  }
  const trumps = trump ? hand.filter((c) => c.suit === trump) : [];
  if (trumps.length > 0) {
    const down = trick.filter((t) => t.card.suit === trump).map((t) => cardValue(t.card));
    const best = down.length > 0 ? Math.max(...down) : 0;
    const higher = trumps.filter((c) => cardValue(c) > best);
    return higher.length > 0 ? higher : trumps;
  }
  return hand;
}

export interface BatakSeatView {
  id: string;
  handCount: number;
  side: number;
  /** İhaleli: the last bid made, 0 for a pass; koz maça: the tricks promised. Null before speaking. */
  bid: number | null;
  passed: boolean;
  tricks: number;
}

export interface BatakSide {
  seats: number[];
  score: number;
}

export interface BatakTrick {
  /** Grows with every trick, so the client can show each one once. */
  id: number;
  cards: TrickCard[];
  winner: number;
}

export interface BatakSideResult {
  /** What the side had to take: the contract for the bidder's side in ihaleli, the sum of its promises in koz maça; 0 for nothing. */
  bid: number;
  tricks: number;
  /** Points this hand: the tricks taken, or minus the bid when it was not made. */
  delta: number;
  made: boolean;
}

export interface BatakRoundResult {
  sides: BatakSideResult[];
  note: string;
}

export interface BatakView {
  mode: BatakMode;
  teams: boolean;
  phase: "bid" | "trump" | "play" | "roundOver";
  round: number;
  rounds: number;
  minBid: number;
  seats: BatakSeatView[];
  sides: BatakSide[];
  mySeat: number;
  turn: number;
  dealer: number;
  hand: Card[];
  /** Ids of the cards in your hand that may be played now. */
  legal: number[];
  /** İhaleli: who holds the highest bid so far, and that bid. */
  bidder: number | null;
  bid: number;
  trump: Suit | null;
  trumpBroken: boolean;
  trick: TrickCard[];
  lastTrick: BatakTrick | null;
  lastRound: BatakRoundResult | null;
  /** Points per side for every finished hand, oldest first. */
  history: number[][];
  gameOver: boolean;
  turnMsLeft: number | null;
  turnSeconds: number;
  notice: string | null;
}

export type BatakAction =
  | { type: "bid"; amount: number }
  | { type: "trump"; suit: Suit }
  | { type: "play"; cardId: number }
  | { type: "nextRound" };

export const SUIT_NAMES: Record<Suit, string> = { spades: "maça", hearts: "kupa", diamonds: "karo", clubs: "sinek" };
