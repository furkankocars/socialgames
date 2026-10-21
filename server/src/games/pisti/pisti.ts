import {
  JACK,
  JACK_PISTI_POINTS,
  MAJORITY_POINTS,
  PISTI_POINTS,
  SUITS,
  cardPoints,
  type Card,
  type PistiMove,
  type PistiRoundResult,
  type PistiSide,
  type PistiView,
} from "../../../../shared/games/pisti.js";
import { clampInt } from "../tabu/tabu.js";
import { GameError, shuffle, type GameAction, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { pistiBotMove } from "./bot.js";

const HAND_SIZE = 4;
const TABLE_START = 4;

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 13; rank++) deck.push({ id: deck.length, suit, rank });
  return deck;
}

export class PistiGame implements GameInstance {
  private seats: string[];
  private n: number;
  private teams: boolean;
  private target: number;
  private sides: PistiSide[];
  private sideOf: number[];
  private hands: Card[][] = [];
  private deck: Card[] = [];
  private pile: Card[] = [];
  private hidden = 0;
  /** Cards each side took this round. */
  private taken: Card[][] = [];
  private turn = 0;
  private dealer: number;
  private phase: PistiView["phase"] = "play";
  private round = 0;
  private lastMove: PistiMove | null = null;
  private lastTaker: number | null = null;
  private lastRound: PistiRoundResult | null = null;
  private moveId = 0;
  /** Ranks played face up this round, which a careful player (and the bot) keeps count of. */
  private seen = new Map<number, number>();
  private turnMs: number;
  private turnEndsAt: number | null = null;
  private notice: string | null = null;

  constructor(
    private ctx: GameContext,
    options: Record<string, unknown>,
  ) {
    this.seats = ctx.players.map((p) => p.id);
    this.n = this.seats.length;
    if (this.n !== 2 && this.n !== 4) throw new GameError("Pişti 2 ya da 4 kişiyle oynanır.");
    this.teams = this.n === 4 && options.teams === 1;
    this.target = clampInt(options.target, 51, 301, 101);
    const seconds = clampInt(options.turnSeconds, 0, 120, 0);
    this.turnMs = seconds === 0 ? 0 : Math.max(10, seconds) * 1000;
    // Partners sit across from each other: seats 0 and 2 against 1 and 3.
    const groups = this.teams ? [[0, 2], [1, 3]] : this.seats.map((_, s) => [s]);
    this.sides = groups.map((seats) => ({ seats, score: 0, captured: 0, pistiPoints: 0, pistis: 0 }));
    this.sideOf = this.seats.map((_, s) => groups.findIndex((g) => g.includes(s)));
    this.dealer = Math.floor(ctx.random() * this.n);
    this.startRound();
  }

  /** Shuffle and deal a round; tests pass a stacked deck (dealt from the end). */
  startRound(deck = shuffle(newDeck(), this.ctx.random)) {
    this.round++;
    if (this.round > 1) this.dealer = (this.dealer + 1) % this.n;
    this.deck = deck;
    this.pile = this.deck.splice(-TABLE_START);
    this.hidden = TABLE_START - 1;
    this.taken = this.sides.map(() => []);
    for (const side of this.sides) Object.assign(side, { captured: 0, pistiPoints: 0, pistis: 0 });
    this.seen = new Map([[this.pile.at(-1)!.rank, 1]]);
    this.lastMove = null;
    this.lastTaker = null;
    this.notice = null;
    this.phase = "play";
    this.deal();
    this.turn = (this.dealer + 1) % this.n;
    this.armTurnTimer();
  }

  getView(playerId: string): PistiView {
    const mySeat = this.seats.indexOf(playerId);
    return {
      phase: this.phase,
      round: this.round,
      target: this.target,
      teams: this.teams,
      seats: this.seats.map((id, s) => ({ id, handCount: this.hands[s].length, side: this.sideOf[s] })),
      sides: this.sides.map((side) => ({ ...side, seats: side.seats.slice() })),
      mySeat,
      turn: this.turn,
      dealer: this.dealer,
      hand: mySeat >= 0 ? this.hands[mySeat].slice() : [],
      pile: this.pile.slice(this.hidden),
      pileHidden: this.hidden,
      deckCount: this.deck.length,
      lastMove: this.lastMove,
      lastTaker: this.lastTaker,
      lastRound: this.lastRound,
      gameOver: this.isGameOver(),
      turnMsLeft: this.turnEndsAt === null ? null : Math.max(0, this.turnEndsAt - Date.now()),
      turnSeconds: this.turnMs / 1000,
      notice: this.notice,
    };
  }

  handleAction(playerId: string, action: GameAction): void {
    const seat = this.seats.indexOf(playerId);
    if (seat < 0) throw new GameError("Bu masada değilsin.");
    if (action.type === "nextRound") {
      if (this.phase !== "roundOver") throw new GameError("El henüz bitmedi.");
      if (this.isGameOver()) throw new GameError("Oyun bitti.");
      if (playerId !== this.ctx.hostId()) throw new GameError("Yeni eli oda sahibi başlatır.");
      this.lastRound = null;
      this.startRound();
      return;
    }
    if (action.type !== "play") throw new GameError("Bilinmeyen hamle.");
    if (this.phase !== "play") throw new GameError("El bitti.");
    if (seat !== this.turn) throw new GameError("Sıra sende değil.");
    this.play(seat, action.cardId);
    this.armTurnTimer();
  }

  botAction(playerId: string): GameAction | null {
    const seat = this.seats.indexOf(playerId);
    if (seat < 0 || this.phase !== "play" || seat !== this.turn) return null;
    return { type: "play", cardId: this.botCard(seat).id };
  }

  private botCard(seat: number): Card {
    return pistiBotMove({ hand: this.hands[seat], pile: this.pile.slice(this.hidden), hidden: this.hidden, seen: this.seen });
  }

  private play(seat: number, cardId: unknown) {
    const hand = this.hands[seat];
    const index = hand.findIndex((c) => c.id === cardId);
    if (index < 0) throw new GameError("Bu kart elinde değil.");
    const card = hand.splice(index, 1)[0];
    const top = this.pile.at(-1);
    this.seen.set(card.rank, (this.seen.get(card.rank) ?? 0) + 1);
    this.notice = null;
    let took = 0;
    let pisti = 0;
    if (top && (card.rank === top.rank || card.rank === JACK)) {
      // A lone card matched by rank is a pişti; a jack on a lone jack counts double.
      if (this.pile.length === 1 && card.rank === top.rank) pisti = card.rank === JACK ? JACK_PISTI_POINTS : PISTI_POINTS;
      const side = this.sides[this.sideOf[seat]];
      this.taken[this.sideOf[seat]].push(...this.pile, card);
      took = this.pile.length + 1;
      side.captured += took;
      if (pisti) {
        side.pistis++;
        side.pistiPoints += pisti;
      }
      this.pile = [];
      this.hidden = 0;
      this.lastTaker = seat;
    } else {
      this.pile.push(card);
    }
    this.lastMove = { id: ++this.moveId, seat, card, took, pisti };

    this.turn = (seat + 1) % this.n;
    if (this.hands.every((h) => h.length === 0)) {
      if (this.deck.length > 0) this.deal();
      else this.endRound();
    }
  }

  private deal() {
    this.hands = this.seats.map(() => []);
    for (let s = 0; s < this.n; s++) {
      const seat = (this.dealer + 1 + s) % this.n;
      this.hands[seat] = this.deck.splice(-HAND_SIZE);
    }
  }

  private endRound() {
    // Whatever is left on the table goes to whoever took cards last.
    if (this.pile.length > 0 && this.lastTaker !== null) {
      const side = this.sideOf[this.lastTaker];
      this.taken[side].push(...this.pile);
      this.sides[side].captured += this.pile.length;
      this.pile = [];
      this.hidden = 0;
    }
    const most = Math.max(...this.sides.map((s) => s.captured));
    const leaders = this.sides.filter((s) => s.captured === most).length;
    const results = this.sides.map((side, i) => {
      const majority = leaders === 1 && side.captured === most ? MAJORITY_POINTS : 0;
      const points = this.taken[i].reduce((sum, c) => sum + cardPoints(c), 0);
      const total = majority + points + side.pistiPoints;
      side.score += total;
      return { cards: side.captured, majority, cardPoints: points, pistiPoints: side.pistiPoints, total };
    });
    const best = results.reduce((b, r, i) => (r.total > results[b].total ? i : b), 0);
    const tied = results.filter((r) => r.total === results[best].total).length > 1;
    const note = tied ? "El berabere bitti." : `Eli ${this.sideName(best)} aldı (+${results[best].total}).`;
    this.lastRound = { sides: results, note };
    this.phase = "roundOver";
    this.armTurnTimer();
  }

  /** Over once a side reaches the target with the top score alone; a tie at the top plays on. */
  private isGameOver() {
    if (this.phase !== "roundOver") return false;
    const scores = this.sides.map((s) => s.score);
    const top = Math.max(...scores);
    return top >= this.target && scores.filter((s) => s === top).length === 1;
  }

  private armTurnTimer() {
    this.ctx.clearTimers();
    this.turnEndsAt = null;
    if (!this.turnMs || this.phase !== "play") return;
    this.turnEndsAt = Date.now() + this.turnMs;
    const { round, turn } = this;
    const moveId = this.moveId;
    this.ctx.setTimer(() => {
      if (this.round !== round || this.turn !== turn || this.moveId !== moveId || this.phase !== "play") return;
      this.play(turn, this.botCard(turn).id);
      this.notice = `${this.ctx.players[turn].name} süresini doldurdu, kartı otomatik atıldı.`;
      this.armTurnTimer();
      this.ctx.update();
    }, this.turnMs);
  }

  private sideName(side: number) {
    return this.sides[side].seats.map((s) => this.ctx.players[s].name).join(" ve ");
  }
}

export const pisti: GameDefinition = {
  id: "pisti",
  create: (ctx, options) => new PistiGame(ctx, options),
};
