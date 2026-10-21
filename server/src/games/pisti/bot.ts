import { JACK, cardPoints, type Card } from "../../../../shared/games/pisti.js";

interface BotTable {
  hand: Card[];
  /** Face-up cards on the pile, top last. */
  pile: Card[];
  /** Face-down cards under them, which count toward the pile's size only. */
  hidden: number;
  /** How many of each rank have been played face up this round. */
  seen: Map<number, number>;
}

/** How much a pile is worth taking: its card points plus a bit for the card count. */
function pileValue(pile: Card[], hidden: number) {
  return pile.reduce((sum, c) => sum + cardPoints(c), 0) + (pile.length + hidden) * 0.25;
}

/**
 * A plain but sensible pişti player: take the pile with a matching card,
 * save jacks for piles worth taking, and otherwise throw the card the next
 * player is least likely to answer.
 */
export function pistiBotMove({ hand, pile, hidden, seen }: BotTable): Card {
  const top = pile.at(-1);
  if (top) {
    const match = hand.find((c) => c.rank === top.rank);
    if (match) return match;
    const jack = hand.find((c) => c.rank === JACK);
    const onlyJacks = hand.every((c) => c.rank === JACK);
    if (jack && (onlyJacks || pileValue(pile, hidden) >= 2 || hand.length === 1)) return jack;
  }
  const choices = hand.filter((c) => c.rank !== JACK);
  if (choices.length === 0) return hand[0];
  // Safest card: a rank that has mostly been played already, so nobody can match it,
  // that also costs little if it is taken. On an empty table this avoids a pişti.
  const risk = (c: Card) => {
    const out = (seen.get(c.rank) ?? 0) + hand.filter((h) => h.rank === c.rank).length;
    return (4 - out) * 2 + cardPoints(c) * 3;
  };
  return choices.reduce((best, c) => (risk(c) < risk(best) ? c : best));
}
