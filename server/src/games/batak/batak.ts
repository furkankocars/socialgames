import { SUITS, type Card, type Suit } from "../../../../shared/games/pisti.js";
import {
  HAND_SIZE,
  MIN_BID,
  MIN_BID_TEAMS,
  SUIT_NAMES,
  cardValue,
  legalCards,
  trickWinner,
  type BatakMode,
  type BatakRoundResult,
  type BatakSide,
  type BatakTrick,
  type BatakView,
  type TrickCard,
} from "../../../../shared/games/batak.js";
import { newDeck } from "../pisti/pisti.js";
import { clampInt } from "../tabu/tabu.js";
import { GameError, shuffle, type GameAction, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { batakBotBid, batakBotMove, batakBotPromise, bestTrump } from "./bot.js";

const SEATS = 4;

/** Suits alternate in colour, highest card first, as a player holds them. */
const SUIT_ORDER: Suit[] = ["spades", "hearts", "clubs", "diamonds"];
function sortHand(hand: Card[]) {
  return hand.sort((a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || cardValue(b) - cardValue(a));
}

export class BatakGame implements GameInstance {
  private seats: string[];
  private mode: BatakMode;
  private teams: boolean;
  private rounds: number;
  private minBid: number;
  private sides: BatakSide[];
  private sideOf: number[];
  private hands: Card[][] = [];
  private bids: (number | null)[] = [];
  private passed: boolean[] = [];
  private tricks: number[] = [];
  private bidder: number | null = null;
  private bid = 0;
  private trump: Suit | null = null;
  private trumpBroken = false;
  private trick: TrickCard[] = [];
  private played: Card[] = [];
  private lastTrick: BatakTrick | null = null;
  private trickId = 0;
  private phase: BatakView["phase"] = "bid";
  private round = 0;
  private dealer: number;
  private turn = 0;
  private lastRound: BatakRoundResult | null = null;
  private history: number[][] = [];
  /** Grows with every move, so a stale turn timer knows to stand down. */
  private moveId = 0;
  private turnMs: number;
  private turnEndsAt: number | null = null;
  private notice: string | null = null;

  constructor(
    private ctx: GameContext,
    options: Record<string, unknown>,
  ) {
    this.seats = ctx.players.map((p) => p.id);
    if (this.seats.length !== SEATS) throw new GameError("Batak 4 kişiyle oynanır.");
    this.mode = options.mode === 1 ? "kozmaca" : "ihaleli";
    this.teams = options.teams === 1;
    this.rounds = clampInt(options.rounds, 1, 30, 10);
    this.minBid = this.teams ? MIN_BID_TEAMS : MIN_BID;
    const seconds = clampInt(options.turnSeconds, 0, 120, 0);
    this.turnMs = seconds === 0 ? 0 : Math.max(10, seconds) * 1000;
    // Partners sit across from each other: seats 0 and 2 against 1 and 3.
    const groups = this.teams ? [[0, 2], [1, 3]] : this.seats.map((_, s) => [s]);
    this.sides = groups.map((seats) => ({ seats, score: 0 }));
    this.sideOf = this.seats.map((_, s) => groups.findIndex((g) => g.includes(s)));
    this.dealer = Math.floor(ctx.random() * SEATS);
    this.startRound();
  }

  /** Shuffle and deal thirteen cards each; tests pass a stacked deck. */
  startRound(deck = shuffle(newDeck(), this.ctx.random)) {
    this.round++;
    if (this.round > 1) this.dealer = (this.dealer + 1) % SEATS;
    this.hands = this.seats.map((_, s) => sortHand(deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE)));
    this.bids = this.seats.map(() => null);
    this.passed = this.seats.map(() => false);
    this.tricks = this.seats.map(() => 0);
    this.bidder = null;
    this.bid = 0;
    this.trump = this.mode === "kozmaca" ? "spades" : null;
    this.trumpBroken = false;
    this.trick = [];
    this.played = [];
    this.lastTrick = null;
    this.notice = null;
    this.phase = "bid";
    this.turn = (this.dealer + 1) % SEATS;
    this.moveId++;
    this.armTurnTimer();
  }

  getView(playerId: string): BatakView {
    const mySeat = this.seats.indexOf(playerId);
    const myTurnToPlay = mySeat >= 0 && this.phase === "play" && this.turn === mySeat;
    return {
      mode: this.mode,
      teams: this.teams,
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      minBid: this.minBid,
      seats: this.seats.map((id, s) => ({
        id,
        handCount: this.hands[s].length,
        side: this.sideOf[s],
        bid: this.bids[s],
        passed: this.passed[s],
        tricks: this.tricks[s],
      })),
      sides: this.sides.map((side) => ({ ...side, seats: side.seats.slice() })),
      mySeat,
      turn: this.turn,
      dealer: this.dealer,
      hand: mySeat >= 0 ? this.hands[mySeat].slice() : [],
      legal: myTurnToPlay ? this.legal(mySeat).map((c) => c.id) : [],
      bidder: this.bidder,
      bid: this.bid,
      trump: this.trump,
      trumpBroken: this.trumpBroken,
      trick: this.trick.slice(),
      lastTrick: this.lastTrick,
      lastRound: this.lastRound,
      history: this.history.map((h) => h.slice()),
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
    if (seat !== this.turn || this.phase === "roundOver") throw new GameError("Sıra sende değil.");
    this.notice = null;
    this.apply(seat, action);
    this.armTurnTimer();
  }

  botAction(playerId: string): GameAction | null {
    const seat = this.seats.indexOf(playerId);
    if (seat < 0 || seat !== this.turn || this.phase === "roundOver") return null;
    return this.botMove(seat);
  }

  private botMove(seat: number): GameAction {
    const hand = this.hands[seat];
    if (this.phase === "bid") {
      if (this.mode === "kozmaca") return { type: "bid", amount: batakBotPromise(hand) };
      // Whoever is left holding an empty auction has to play the lowest bid.
      return { type: "bid", amount: batakBotBid(hand, this.bid, this.minBid, this.teams) };
    }
    if (this.phase === "trump") return { type: "trump", suit: bestTrump(hand).suit };
    const card = batakBotMove({
      hand,
      trick: this.trick,
      trump: this.trump,
      trumpBroken: this.trumpBroken,
      seat,
      partners: this.sides[this.sideOf[seat]].seats,
      played: this.played,
    });
    return { type: "play", cardId: card.id };
  }

  private apply(seat: number, action: GameAction) {
    if (action.type === "bid") {
      if (this.phase !== "bid") throw new GameError("İhale bitti.");
      this.makeBid(seat, action.amount);
    } else if (action.type === "trump") {
      if (this.phase !== "trump") throw new GameError("Şu an koz seçilmiyor.");
      if (!SUITS.includes(action.suit as Suit)) throw new GameError("Böyle bir koz yok.");
      this.trump = action.suit as Suit;
      this.phase = "play";
      this.turn = seat;
    } else if (action.type === "play") {
      if (this.phase !== "play") throw new GameError("Henüz kart atılmıyor.");
      this.play(seat, action.cardId);
    } else {
      throw new GameError("Bilinmeyen hamle.");
    }
    this.moveId++;
  }

  private makeBid(seat: number, amount: unknown) {
    if (typeof amount !== "number" || !Number.isInteger(amount)) throw new GameError("Geçersiz ihale.");
    if (this.mode === "kozmaca") {
      if (amount < 1 || amount > HAND_SIZE) throw new GameError("1 ile 13 arası bir söz ver.");
      this.bids[seat] = amount;
      if (this.bids.every((b) => b !== null)) {
        this.phase = "play";
        this.turn = (this.dealer + 1) % SEATS;
      } else {
        this.turn = (seat + 1) % SEATS;
      }
      return;
    }

    if (amount === 0) {
      this.passed[seat] = true;
      this.bids[seat] = 0;
    } else {
      const lowest = Math.max(this.minBid, this.bid + 1);
      if (amount < lowest || amount > HAND_SIZE) throw new GameError(`İhale en az ${lowest} olmalı.`);
      this.bids[seat] = amount;
      this.bid = amount;
      this.bidder = seat;
    }
    const open = this.seats.map((_, s) => s).filter((s) => !this.passed[s]);
    if (open.length === 0) {
      // Everyone passed: the dealer plays the lowest bid.
      this.bidder = this.dealer;
      this.bid = this.minBid;
      this.bids[this.dealer] = this.minBid;
      this.passed[this.dealer] = false;
      this.notice = `Herkes pas geçti, ihale ${this.minBid} ile dağıtana kaldı.`;
      return this.closeAuction();
    }
    if (this.bid === HAND_SIZE || (open.length === 1 && open[0] === this.bidder)) return this.closeAuction();
    let next = (seat + 1) % SEATS;
    while (this.passed[next]) next = (next + 1) % SEATS;
    this.turn = next;
  }

  private closeAuction() {
    this.phase = "trump";
    this.turn = this.bidder!;
  }

  private legal(seat: number) {
    return legalCards(this.hands[seat], this.trick, this.trump, this.trumpBroken);
  }

  private play(seat: number, cardId: unknown) {
    const hand = this.hands[seat];
    const card = hand.find((c) => c.id === cardId);
    if (!card) throw new GameError("Bu kart elinde değil.");
    if (!this.legal(seat).includes(card)) throw new GameError(this.whyNot(seat, card));
    hand.splice(hand.indexOf(card), 1);
    this.trick.push({ seat, card });
    this.played.push(card);
    if (card.suit === this.trump) this.trumpBroken = true;

    if (this.trick.length < SEATS) {
      this.turn = (seat + 1) % SEATS;
      return;
    }
    const winner = trickWinner(this.trick, this.trump);
    this.tricks[winner]++;
    this.lastTrick = { id: ++this.trickId, cards: this.trick, winner };
    this.trick = [];
    this.turn = winner;
    if (this.hands.every((h) => h.length === 0)) this.endRound();
  }

  /** Says which rule a refused card breaks. */
  private whyNot(seat: number, card: Card): string {
    const hand = this.hands[seat];
    if (this.trick.length === 0) return `Koz henüz açılmadı, ${SUIT_NAMES[this.trump!]} ile başlayamazsın.`;
    const lead = this.trick[0].card.suit;
    if (card.suit !== lead && hand.some((c) => c.suit === lead)) return `Yerdeki renge (${SUIT_NAMES[lead]}) uymalısın.`;
    if (card.suit !== lead && card.suit !== this.trump && hand.some((c) => c.suit === this.trump)) return "Elinde yerdeki renk yoksa koz atmalısın.";
    return "Yükseltmen gerekiyor: yerdekini geçen kartın varken küçük atamazsın.";
  }

  private endRound() {
    const results = this.sides.map((side, i) => {
      const tricks = side.seats.reduce((sum, s) => sum + this.tricks[s], 0);
      let bid = 0;
      if (this.mode === "kozmaca") bid = side.seats.reduce((sum, s) => sum + (this.bids[s] ?? 0), 0);
      else if (this.sideOf[this.bidder!] === i) bid = this.bid;
      const made = tricks >= bid;
      const delta = made ? tricks : -bid;
      side.score += delta;
      return { bid, tricks, delta, made };
    });
    let note: string;
    if (this.mode === "ihaleli") {
      const r = results[this.sideOf[this.bidder!]];
      const who = this.sideName(this.sideOf[this.bidder!]);
      note = r.made ? `${who} ${this.bid} ihaleyi ${r.tricks} elle çıkardı.` : `${who} battı: ${this.bid} ihaleye ${r.tricks} el, -${this.bid}.`;
    } else {
      const sunk = results.map((r, i) => (r.made ? null : this.sideName(i))).filter(Boolean);
      note = sunk.length === 0 ? "Herkes sözünü tuttu." : `Sözünü tutamayan: ${sunk.join(", ")}.`;
    }
    this.history.push(results.map((r) => r.delta));
    this.lastRound = { sides: results, note };
    this.phase = "roundOver";
  }

  private isGameOver() {
    return this.phase === "roundOver" && this.round >= this.rounds;
  }

  private armTurnTimer() {
    this.ctx.clearTimers();
    this.turnEndsAt = null;
    if (!this.turnMs || this.phase === "roundOver") return;
    this.turnEndsAt = Date.now() + this.turnMs;
    const { moveId, turn } = this;
    this.ctx.setTimer(() => {
      if (this.moveId !== moveId || this.turn !== turn || this.phase === "roundOver") return;
      this.apply(turn, this.botMove(turn));
      this.notice = `${this.ctx.players[turn].name} süresini doldurdu, hamlesi otomatik yapıldı.`;
      this.armTurnTimer();
      this.ctx.update();
    }, this.turnMs);
  }

  private sideName(side: number) {
    return this.sides[side].seats.map((s) => this.ctx.players[s].name).join(" ve ");
  }
}

export const batak: GameDefinition = {
  id: "batak",
  create: (ctx, options) => new BatakGame(ctx, options),
};
