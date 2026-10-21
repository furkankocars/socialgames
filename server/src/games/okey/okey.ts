import type { OkeyMeld, OkeyRoundResult, OkeyView, Tile } from "../../../../shared/games/okey.js";
import { clampInt } from "../tabu/tabu.js";
import { GameError, type GameAction, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { okeyBotAction } from "./bot.js";
import {
  analyzeGroup,
  canFinishWithMelds,
  canFinishWithPairs,
  dealSetup,
  isPair,
  isWild,
  tilePoints,
  type Okey,
} from "./tiles.js";

type Variant = OkeyView["variant"];

const OPEN_POINTS = 101;
const OPEN_PAIRS = 5;
const UNOPENED_PENALTY = 202;
/** A turn that runs out is played by the bot; this many moves at most. */
const MAX_TIMEOUT_MOVES = 4;

export class OkeyGame implements GameInstance {
  private seats: string[];
  private hands: Tile[][] = [];
  private discards: Tile[][] = [];
  private center: Tile[] = [];
  private indicator!: Tile;
  private okey!: Okey;
  private turn = 0;
  private dealer = 0;
  private phase: OkeyView["phase"] = "discard";
  private scores = [0, 0, 0, 0];
  private round = 0;
  private totalRounds: number;
  private lastRound: OkeyRoundResult | null = null;
  private table: OkeyMeld[] = [];
  private opened: ("series" | "pairs" | null)[] = [null, null, null, null];
  private mustUseTileId: number | null = null;
  private nextMeldId = 1;
  /** Katlamalı: everyone starts with points and loses them; first to 0 ends the game. */
  private katlamali: boolean;
  private indicatorBonus: boolean;
  private shownIndicator = [false, false, false, false];
  private turnMs: number;
  private turnEndsAt: number | null = null;
  /** The latest thing that happened outside a normal move, for everyone to read. */
  private notice: string | null = null;

  constructor(
    private ctx: GameContext,
    private variant: Variant,
    options: Record<string, unknown>,
  ) {
    this.seats = ctx.players.map((p) => p.id);
    this.totalRounds = clampInt(options.rounds, 1, 20, variant === "okey" ? 5 : 3);
    this.katlamali = variant === "okey" && options.katlamali === 1;
    this.indicatorBonus = variant === "okey" && options.gosterge !== 0;
    const seconds = clampInt(options.turnSeconds, 0, 120, 0);
    this.turnMs = seconds === 0 ? 0 : Math.max(10, seconds) * 1000;
    if (this.katlamali) this.scores.fill(clampInt(options.startPoints, 4, 50, 20));
    this.dealer = Math.floor(ctx.random() * 4);
    this.startRound();
  }

  /** Deal a fresh round; exposed for tests that need a known hand. */
  startRound(setup = dealSetup(this.ctx.random)) {
    this.round++;
    if (this.round > 1) this.dealer = (this.dealer + 1) % 4;
    const { tiles, indicator, okey } = setup;
    this.indicator = indicator;
    this.okey = okey;
    const handSize = this.variant === "okey" ? 14 : 21;
    this.hands = [];
    for (let s = 0; s < 4; s++) {
      const seat = (this.dealer + s) % 4;
      this.hands[seat] = tiles.splice(0, s === 0 ? handSize + 1 : handSize);
    }
    this.center = tiles;
    this.discards = [[], [], [], []];
    this.table = [];
    this.opened = [null, null, null, null];
    this.mustUseTileId = null;
    this.shownIndicator = [false, false, false, false];
    this.notice = null;
    this.turn = this.dealer;
    this.phase = "discard";
    this.armTurnTimer();
  }

  getView(playerId: string): OkeyView {
    const mySeat = this.seats.indexOf(playerId);
    return {
      variant: this.variant,
      phase: this.phase,
      round: this.round,
      totalRounds: this.katlamali ? 0 : this.totalRounds,
      katlamali: this.katlamali,
      turnMsLeft: this.turnEndsAt === null ? null : Math.max(0, this.turnEndsAt - Date.now()),
      turnSeconds: this.turnMs / 1000,
      canShowIndicator: mySeat >= 0 && this.canShowIndicator(mySeat),
      notice: this.notice,
      seats: this.seats.map((id, s) => ({
        id,
        handCount: this.hands[s].length,
        discards: this.discards[s].slice(),
        score: this.scores[s],
      })),
      mySeat,
      turn: this.turn,
      dealer: this.dealer,
      hand: mySeat >= 0 ? this.hands[mySeat].slice() : [],
      indicator: this.indicator,
      okey: this.okey,
      centerCount: this.center.length,
      lastRound: this.lastRound,
      gameOver: this.isGameOver(),
      table: this.table.map((m) => ({ ...m, tiles: m.tiles.slice() })),
      opened: this.opened.slice(),
      mustUseTileId: mySeat === this.turn ? this.mustUseTileId : null,
    };
  }

  handleAction(playerId: string, action: { type: string; [key: string]: unknown }): void {
    const before = `${this.round}:${this.turn}:${this.phase}`;
    this.apply(playerId, action);
    // A new turn (or a drawn tile) restarts the clock; 101 lays within a turn don't.
    if (`${this.round}:${this.turn}:${this.phase}` !== before) this.armTurnTimer();
  }

  private apply(playerId: string, action: { type: string; [key: string]: unknown }): void {
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

    if (this.phase === "roundOver") throw new GameError("El bitti.");
    if (seat !== this.turn) throw new GameError("Sıra sende değil.");
    const hand = this.hands[seat];

    switch (action.type) {
      case "showIndicator": {
        if (!this.canShowIndicator(seat)) throw new GameError("Göstergeyi şimdi gösteremezsin.");
        this.shownIndicator[seat] = true;
        const deltas = this.seats.map((_, s) => (this.katlamali ? (s === seat ? 0 : -1) : s === seat ? 1 : 0));
        deltas.forEach((d, s) => (this.scores[s] += d));
        this.notice = `${this.name(seat)} göstergeyi gösterdi (${this.katlamali ? "herkese -1" : "+1"}).`;
        return;
      }
      case "drawCenter": {
        this.requirePhase("draw");
        const tile = this.center.pop();
        if (!tile) throw new GameError("Ortada taş kalmadı.");
        hand.push(tile);
        this.phase = "discard";
        return;
      }
      case "drawDiscard": {
        this.requirePhase("draw");
        const pile = this.discards[(seat + 3) % 4];
        const tile = pile.pop();
        if (!tile) throw new GameError("Yanda taş yok.");
        hand.push(tile);
        // In 101 a tile taken from the side has to be played this turn.
        if (this.variant === "okey101") this.mustUseTileId = tile.id;
        this.phase = "discard";
        return;
      }
      case "returnDiscard": {
        this.requireVariant101();
        this.requirePhase("discard");
        const index = hand.findIndex((t) => t.id === this.mustUseTileId);
        if (index < 0) throw new GameError("Geri koyacak taş yok.");
        this.discards[(seat + 3) % 4].push(hand.splice(index, 1)[0]);
        this.mustUseTileId = null;
        this.phase = "draw";
        return;
      }
      case "discard": {
        this.requirePhase("discard");
        if (this.mustUseTileId !== null && hand.some((t) => t.id === this.mustUseTileId)) {
          throw new GameError("Yandan aldığın taşı bu el kullanmalısın (ya da geri koy).");
        }
        const tile = this.takeFromHand(seat, [action.tileId])[0];
        this.discards[seat].push(tile);
        this.mustUseTileId = null;
        if (this.variant === "okey101" && hand.length === 0) {
          this.finish101(seat, tile);
          return;
        }
        this.advanceTurn();
        return;
      }
      case "finish": {
        if (this.variant !== "okey") throw new GameError("101'de son taşı atarak bitirirsin.");
        this.requirePhase("discard");
        const tileId = action.tileId;
        const rest = hand.filter((t) => t.id !== tileId);
        if (rest.length !== hand.length - 1) throw new GameError("Bu taş elinde değil.");
        const pairs = canFinishWithPairs(rest, this.okey);
        if (!pairs && !canFinishWithMelds(rest, this.okey)) throw new GameError("Elin bitmiyor. Taşları kontrol et.");
        const tile = this.takeFromHand(seat, [tileId])[0];
        this.discards[seat].push(tile);
        const okeyThrown = isWild(tile, this.okey);
        const how = [pairs && "çiftten", okeyThrown && "okey atarak"].filter(Boolean).join(" ve ");
        if (this.katlamali) {
          // Each of çift and okey doubles what the others lose: 2, 4 or 8.
          const loss = 2 * (pairs ? 2 : 1) * (okeyThrown ? 2 : 1);
          const deltas = this.seats.map((_, s) => (s === seat ? 0 : -loss));
          this.endRound(seat, deltas, `${this.name(seat)} ${how ? how + " " : ""}bitirdi, herkes ${loss} puan kaybetti.`, rest);
        } else {
          const points = pairs || okeyThrown ? 4 : 2;
          const deltas = [0, 0, 0, 0];
          deltas[seat] = points;
          this.endRound(seat, deltas, `${this.name(seat)} ${how ? how + " " : ""}bitirdi (+${points}).`, rest);
        }
        return;
      }
      case "open": {
        this.requireVariant101();
        this.requirePhase("discard");
        if (this.opened[seat]) throw new GameError("Zaten açtın.");
        const groups = this.readGroups(seat, action.groups);
        if (groups.every((g) => g.length === 2)) {
          if (groups.length < OPEN_PAIRS) throw new GameError(`Çiftten açmak için en az ${OPEN_PAIRS} çift gerekli.`);
          if (!groups.every((g) => isPair(g, this.okey))) throw new GameError("Çiftlerden biri geçersiz.");
          this.layGroups(seat, groups, "pairs");
          this.opened[seat] = "pairs";
          return;
        }
        let total = 0;
        for (const g of groups) {
          const result = analyzeGroup(g, this.okey);
          if (!result) throw new GameError("Gruplardan biri geçerli bir seri ya da per değil.");
          total += result.points;
        }
        if (total < OPEN_POINTS) throw new GameError(`Açmak için en az ${OPEN_POINTS} gerekli, sende ${total} var.`);
        this.layGroups(seat, groups, "series");
        this.opened[seat] = "series";
        return;
      }
      case "layMelds": {
        this.requireVariant101();
        this.requirePhase("discard");
        const how = this.opened[seat];
        if (!how) throw new GameError("Önce elini açmalısın.");
        const groups = this.readGroups(seat, action.groups);
        for (const g of groups) {
          const ok = how === "pairs" ? isPair(g, this.okey) : analyzeGroup(g, this.okey) !== null;
          if (!ok) throw new GameError(how === "pairs" ? "Geçersiz çift." : "Geçersiz seri ya da per.");
        }
        this.layGroups(seat, groups, how);
        return;
      }
      case "addToMeld": {
        this.requireVariant101();
        this.requirePhase("discard");
        if (!this.opened[seat]) throw new GameError("İşlemek için önce elini açmalısın.");
        const meld = this.table.find((m) => m.id === action.meldId);
        if (!meld) throw new GameError("Masada böyle bir grup yok.");
        if (meld.kind === "pair") throw new GameError("Çiftlere taş işlenmez.");
        const tiles = this.readGroups(seat, [action.tileIds])[0];
        const combined = [...meld.tiles, ...tiles];
        const result = analyzeGroup(combined, this.okey);
        if (!result || result.kind !== meld.kind) throw new GameError("Bu taş o gruba işlenmez.");
        this.takeFromHand(
          seat,
          tiles.map((t) => t.id),
        );
        meld.tiles = result.ordered;
        this.clearMustUse(tiles);
        return;
      }
      default:
        throw new GameError("Bilinmeyen hamle.");
    }
  }

  botAction(playerId: string): GameAction | null {
    return okeyBotAction(this.getView(playerId));
  }

  private finish101(seat: number, lastTile: Tile) {
    const doubled = this.opened[seat] === "pairs" || isWild(lastTile, this.okey);
    const factor = doubled ? 2 : 1;
    const deltas = this.seats.map((_, s) => {
      if (s === seat) return -OPEN_POINTS * factor;
      return this.handPenalty(s) * factor;
    });
    this.endRound(seat, deltas, `${this.name(seat)} bitirdi${doubled ? " (cezalar 2 katı)" : ""}.`, []);
  }

  private handPenalty(s: number): number {
    if (!this.opened[s]) return UNOPENED_PENALTY;
    const sum = this.hands[s].reduce((acc, t) => acc + tilePoints(t, this.okey), 0);
    return this.opened[s] === "pairs" ? sum * 2 : sum;
  }

  private advanceTurn() {
    if (this.center.length === 0) {
      const deltas = this.variant === "okey" ? [0, 0, 0, 0] : this.seats.map((_, s) => this.handPenalty(s));
      this.endRound(null, deltas, "Ortadaki taşlar bitti, el berabere.", null);
      return;
    }
    this.turn = (this.turn + 1) % 4;
    this.phase = "draw";
  }

  private endRound(winner: number | null, deltas: number[], note: string, winningHand: Tile[] | null) {
    deltas.forEach((d, s) => (this.scores[s] += d));
    this.lastRound = { winnerId: winner === null ? null : this.seats[winner], deltas, note, winningHand };
    this.phase = "roundOver";
  }

  private isGameOver() {
    if (this.phase !== "roundOver") return false;
    return this.katlamali ? this.scores.some((p) => p <= 0) : this.round >= this.totalRounds;
  }

  /** The indicator's twin can be shown once, on your first turn, before your first discard. */
  private canShowIndicator(seat: number) {
    return (
      this.indicatorBonus &&
      this.phase !== "roundOver" &&
      this.turn === seat &&
      !this.shownIndicator[seat] &&
      this.discards[seat].length === 0 &&
      this.hands[seat].some((t) => t.color === this.indicator.color && t.value === this.indicator.value)
    );
  }

  private armTurnTimer() {
    this.ctx.clearTimers();
    this.turnEndsAt = null;
    if (!this.turnMs || this.phase === "roundOver") return;
    this.turnEndsAt = Date.now() + this.turnMs;
    const round = this.round;
    const seat = this.turn;
    this.ctx.setTimer(() => {
      if (this.round !== round || this.turn !== seat || this.phase === "roundOver") return;
      this.playForTimeout(seat);
      this.ctx.update();
    }, this.turnMs);
  }

  /** Time ran out: finish the seat's turn the way a bot would. */
  private playForTimeout(seat: number) {
    const id = this.seats[seat];
    for (let i = 0; i < MAX_TIMEOUT_MOVES && this.turn === seat && this.phase !== "roundOver"; i++) {
      const before = `${this.turn}:${this.phase}:${this.hands[seat].length}`;
      try {
        const action = okeyBotAction(this.getView(id));
        if (action) this.handleAction(id, action);
      } catch {
        // Fall through to the plain move below.
      }
      if (`${this.turn}:${this.phase}:${this.hands[seat].length}` !== before) continue;
      if (this.phase === "draw") this.handleAction(id, { type: "drawCenter" });
      else {
        if (this.mustUseTileId !== null) this.handleAction(id, { type: "returnDiscard" });
        else this.handleAction(id, { type: "discard", tileId: this.hands[seat].at(-1)!.id });
      }
    }
    this.notice = `${this.name(seat)} süresini doldurdu, hamlesi otomatik yapıldı.`;
  }

  /** Validates tile-id groups from the client against the player's hand. */
  private readGroups(seat: number, raw: unknown): Tile[][] {
    if (!Array.isArray(raw) || raw.length === 0) throw new GameError("Taş seçmedin.");
    const hand = this.hands[seat];
    const seen = new Set<number>();
    const groups = raw.map((g) => {
      if (!Array.isArray(g) || g.length === 0) throw new GameError("Boş grup.");
      return g.map((id) => {
        const tile = hand.find((t) => t.id === id);
        if (!tile || seen.has(tile.id)) throw new GameError("Geçersiz taş seçimi.");
        seen.add(tile.id);
        return tile;
      });
    });
    if (seen.size >= hand.length) throw new GameError("Atmak için elinde en az bir taş kalmalı.");
    return groups;
  }

  private layGroups(seat: number, groups: Tile[][], how: "series" | "pairs") {
    for (const g of groups) {
      this.takeFromHand(
        seat,
        g.map((t) => t.id),
      );
      const series = how === "series" ? analyzeGroup(g, this.okey)! : null;
      this.table.push({
        id: this.nextMeldId++,
        owner: this.seats[seat],
        kind: series ? series.kind : "pair",
        tiles: series ? series.ordered : g.slice(),
      });
      this.clearMustUse(g);
    }
  }

  private clearMustUse(tiles: Tile[]) {
    if (tiles.some((t) => t.id === this.mustUseTileId)) this.mustUseTileId = null;
  }

  private takeFromHand(seat: number, ids: unknown[]): Tile[] {
    const hand = this.hands[seat];
    return ids.map((id) => {
      const index = hand.findIndex((t) => t.id === id);
      if (index < 0) throw new GameError("Bu taş elinde değil.");
      return hand.splice(index, 1)[0];
    });
  }

  private requirePhase(phase: OkeyView["phase"]) {
    if (this.phase !== phase) throw new GameError(phase === "draw" ? "Önce taş atmalısın." : "Önce taş çekmelisin.");
  }

  private requireVariant101() {
    if (this.variant !== "okey101") throw new GameError("Bu hamle sadece 101'de var.");
  }

  private name(seat: number) {
    return this.ctx.players[seat].name;
  }
}

export const okey: GameDefinition = {
  id: "okey",
  create: (ctx, options) => new OkeyGame(ctx, "okey", options),
};

export const okey101: GameDefinition = {
  id: "okey101",
  create: (ctx, options) => new OkeyGame(ctx, "okey101", options),
};
