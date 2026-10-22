import { SUITS, type Card, type Suit } from "../../../../shared/games/pisti.js";
import { cardValue, legalCards, trickWinner, type TrickCard } from "../../../../shared/games/batak.js";

/** Tricks a hand should take with this suit as trumps (or with no trumps). */
export function estimateTricks(hand: Card[], trump: Suit | null): number {
  let tricks = 0;
  for (const suit of SUITS) {
    const cards = hand.filter((c) => c.suit === suit).map(cardValue).sort((a, b) => b - a);
    const has = (v: number) => cards.includes(v);
    if (has(14)) tricks += 1;
    if (has(13) && cards.length >= 2) tricks += has(14) ? 0.9 : 0.6;
    if (has(12) && cards.length >= 3) tricks += has(13) || has(14) ? 0.5 : 0.25;
    if (suit === trump) {
      // Every trump past the third tends to win a trick of its own.
      tricks += Math.max(0, cards.length - 3) * 0.9;
      if (has(11) && cards.length >= 4) tricks += 0.3;
    } else if (trump && cards.length <= 1 && hand.some((c) => c.suit === trump)) {
      // A short side suit lets the trumps ruff.
      tricks += cards.length === 0 ? 0.8 : 0.4;
    }
  }
  return tricks;
}

export function bestTrump(hand: Card[]): { suit: Suit; tricks: number } {
  let best = { suit: SUITS[0], tricks: -1 };
  for (const suit of SUITS) {
    const tricks = estimateTricks(hand, suit) + hand.filter((c) => c.suit === suit).length * 0.05;
    if (tricks > best.tricks) best = { suit, tricks };
  }
  return best;
}

/**
 * İhaleli: what to say given the current high bid. Bids up to what the hand
 * is worth (a partner adds about three tricks), and passes past it.
 */
export function batakBotBid(hand: Card[], high: number, minBid: number, teams: boolean): number {
  const worth = Math.floor(bestTrump(hand).tricks + (teams ? 3 : 0.5));
  const next = Math.max(minBid, high + 1);
  return next <= worth && next <= 13 ? next : 0;
}

/** Koz maça: how many tricks to promise, spades being trumps. */
export function batakBotPromise(hand: Card[]): number {
  return Math.max(1, Math.min(13, Math.round(estimateTricks(hand, "spades"))));
}

interface BotTable {
  hand: Card[];
  trick: TrickCard[];
  trump: Suit | null;
  trumpBroken: boolean;
  seat: number;
  /** Seats that score with this one, including itself. */
  partners: number[];
  /** Cards already played this hand. */
  played: Card[];
}

/**
 * A plain but sensible player: every trick is worth a point, so it tries to
 * win as many as it can, but cheaply. It leads cards that are sure winners,
 * wins a trick with the lowest card that does, leaves a partner's winning
 * trick alone, and throws its smallest card when it cannot win.
 */
export function batakBotMove({ hand, trick, trump, trumpBroken, seat, partners, played }: BotTable): Card {
  const legal = legalCards(hand, trick, trump, trumpBroken);
  const low = (cards: Card[]) => cards.reduce((a, b) => (rankScore(b, trump) < rankScore(a, trump) ? b : a));
  const high = (cards: Card[]) => cards.reduce((a, b) => (rankScore(b, trump) > rankScore(a, trump) ? b : a));

  if (trick.length === 0) {
    // A card no one left can beat in its own suit.
    const isTop = (c: Card) => {
      for (let v = cardValue(c) + 1; v <= 14; v++) {
        const rank = v === 14 ? 1 : v;
        const out = played.some((p) => p.suit === c.suit && p.rank === rank) || hand.some((h) => h.suit === c.suit && h.rank === rank);
        if (!out) return false;
      }
      return true;
    };
    const winners = legal.filter((c) => isTop(c) && c.suit !== trump);
    if (winners.length > 0) return high(winners);
    const trumpWinners = legal.filter((c) => isTop(c) && c.suit === trump);
    if (trumpWinners.length > 0 && hand.filter((c) => c.suit === trump).length >= 2) return trumpWinners[0];
    // Otherwise lead low from the longest plain suit, keeping trumps back.
    const plain = legal.filter((c) => c.suit !== trump);
    const pool = plain.length > 0 ? plain : legal;
    const length = (s: Suit) => hand.filter((c) => c.suit === s).length;
    const longest = pool.reduce((a, b) => (length(b.suit) > length(a.suit) ? b : a)).suit;
    return low(pool.filter((c) => c.suit === longest));
  }

  const winnerNow = trickWinner(trick, trump);
  const last = trick.length === 3;
  const winning = legal.filter((c) => trickWinner([...trick, { seat, card: c }], trump) === seat);
  if (partners.includes(winnerNow)) {
    // A partner holds the trick: stay out of the way unless they are likely to be beaten.
    const theirs = trick.find((t) => t.seat === winnerNow)!.card;
    if (last || cardValue(theirs) >= 13 || theirs.suit === trump) return low(legal);
  }
  if (winning.length > 0) return low(winning);
  return low(legal);
}

/** Orders cards for throwing away: trumps are worth keeping more than any plain card. */
function rankScore(card: Card, trump: Suit | null) {
  return cardValue(card) + (card.suit === trump ? 20 : 0);
}
