import {
  colorOf,
  findMove,
  inCheck,
  initialPosition,
  makeMove,
  other,
  positionEnd,
  positionKey,
  toSan,
  type ChessEnd,
  type ChessMoveRecord,
  type ChessPosition,
  type ChessView,
  type Color,
  type Promotion,
  typeOf,
} from "../../../../shared/games/chess.js";
import { clampInt } from "../tabu/tabu.js";
import { GameError, type GameAction, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { chessBotMove, type BotLevel } from "./bot.js";

const PROMOTIONS = ["q", "r", "b", "n"];

export class ChessGame implements GameInstance {
  /** Seat 0 plays white in odd games; colours swap every rematch. */
  private seats: string[];
  private scores = [0, 0];
  private game = 0;
  private position!: ChessPosition;
  private moves: ChessMoveRecord[] = [];
  private history: string[] = [];
  private result: ChessView["result"] = null;
  private drawOffer: Color | null = null;
  private minutes: number;
  private incrementMs: number;
  private clock = { w: 0, b: 0 };
  /** When the running clock last started. */
  private clockStartedAt: number | null = null;
  private botLevel: BotLevel;

  constructor(
    private ctx: GameContext,
    options: Record<string, unknown>,
  ) {
    if (ctx.players.length !== 2) throw new GameError("Satranç iki kişiyle oynanır.");
    this.seats = ctx.players.map((p) => p.id);
    if (ctx.random() < 0.5) this.seats.reverse();
    this.minutes = [0, 1, 3, 5, 10, 15, 30].includes(Number(options.minutes)) ? Number(options.minutes) : 0;
    this.incrementMs = this.minutes ? clampInt(options.increment, 0, 30, 0) * 1000 : 0;
    this.botLevel = clampInt(options.botLevel, 1, 3, 2) as BotLevel;
    this.newGame();
  }

  private newGame() {
    this.game++;
    this.position = initialPosition();
    this.moves = [];
    this.history = [positionKey(this.position)];
    this.result = null;
    this.drawOffer = null;
    this.clock = { w: this.minutes * 60000, b: this.minutes * 60000 };
    this.clockStartedAt = null;
    this.ctx.clearTimers();
  }

  /** White sits in seat 0 in odd games. */
  private colorOf(playerId: string): Color | null {
    const seat = this.seats.indexOf(playerId);
    if (seat < 0) return null;
    return (seat + this.game - 1) % 2 === 0 ? "w" : "b";
  }

  private idOf(color: Color): string {
    return this.seats.find((id) => this.colorOf(id) === color)!;
  }

  /** The running clock only starts once white has made the first move. */
  private running(): Color | null {
    return this.minutes && !this.result && this.clockStartedAt !== null ? this.position.turn : null;
  }

  private msLeft(color: Color): number | null {
    if (!this.minutes) return null;
    const run = this.running() === color ? Date.now() - this.clockStartedAt! : 0;
    return Math.max(0, this.clock[color] - run);
  }

  getView(playerId: string): ChessView {
    return {
      position: { ...this.position, board: this.position.board.slice() },
      players: this.seats.map((id, seat) => ({ id, color: this.colorOf(id)!, msLeft: this.msLeft(this.colorOf(id)!), score: this.scores[seat] })),
      myColor: this.colorOf(playerId),
      moves: this.moves.slice(),
      running: this.running(),
      check: !this.result || this.result.reason === "checkmate" ? inCheck(this.position) : false,
      drawOffer: this.drawOffer,
      result: this.result,
      game: this.game,
      minutes: this.minutes,
      increment: this.incrementMs / 1000,
    };
  }

  handleAction(playerId: string, action: GameAction): void {
    const color = this.colorOf(playerId);
    if (!color) throw new GameError("Bu masada değilsin.");

    if (action.type === "rematch") {
      if (!this.result) throw new GameError("Oyun daha bitmedi.");
      // Usually the host's call; if a bot holds the host's seat, either player may.
      if (playerId !== this.ctx.hostId() && !this.ctx.isBot(this.ctx.hostId())) throw new GameError("Rövanşı oda sahibi başlatır.");
      this.newGame();
      return;
    }
    if (this.result) throw new GameError("Oyun bitti.");

    switch (action.type) {
      case "move":
        return this.move(color, action);
      case "resign":
        return this.finish(other(color), "resign");
      case "offerDraw":
        if (this.moves.length < 2) throw new GameError("Beraberlik için önce birkaç hamle oynanmalı.");
        if (this.drawOffer === color) throw new GameError("Teklifin zaten masada.");
        if (this.drawOffer) return this.finish(null, "agreement");
        this.drawOffer = color;
        return;
      case "answerDraw":
        if (this.drawOffer !== other(color)) throw new GameError("Bekleyen bir beraberlik teklifi yok.");
        if (action.accept === true) return this.finish(null, "agreement");
        this.drawOffer = null;
        return;
      default:
        throw new GameError("Bilinmeyen hamle.");
    }
  }

  private move(color: Color, action: GameAction) {
    if (this.position.turn !== color) throw new GameError("Sıra rakibinde.");
    const promotion = PROMOTIONS.includes(action.promotion as string) ? (action.promotion as Promotion) : undefined;
    const m = findMove(this.position, Number(action.from), Number(action.to), promotion);
    if (!m) throw new GameError("Bu hamle kurallara uymuyor.");

    if (this.minutes) {
      if (this.clockStartedAt !== null) this.clock[color] -= Date.now() - this.clockStartedAt;
      this.clockStartedAt = null;
      // White's first move doesn't start a clock; black's clock starts after it.
      if (this.moves.length > 0) this.clock[color] += this.incrementMs;
    }
    const before = this.position;
    const captured = before.board[m.to] || (before.board[m.from].toLowerCase() === "p" && m.to === before.ep ? (color === "w" ? "p" : "P") : "");
    this.moves.push({ from: m.from, to: m.to, san: toSan(before, m), captured: captured || null });
    this.position = makeMove(before, m);
    // Moving on declines a draw offered to the mover; the mover's own offer stays up.
    if (this.drawOffer === other(color)) this.drawOffer = null;
    const key = positionKey(this.position);
    this.history.push(key);

    const end = positionEnd(this.position);
    if (end) return this.finish(end === "checkmate" ? color : null, end);
    if (this.history.filter((k) => k === key).length >= 3) return this.finish(null, "repetition");
    this.armClock();
  }

  private armClock() {
    this.ctx.clearTimers();
    if (!this.minutes) return;
    this.clockStartedAt = Date.now();
    const turn = this.position.turn;
    this.ctx.setTimer(() => this.flag(turn), this.clock[turn] + 50);
  }

  private flag(color: Color) {
    if (this.result || this.position.turn !== color) return;
    if ((this.msLeft(color) ?? 1) > 0) {
      this.armClock();
      return;
    }
    this.clock[color] = 0;
    // Running out of time is a draw if the opponent could never mate.
    const opponent = other(color);
    const board = this.position.board;
    const cannotMate = pieces(board, opponent).length === 0 || (onlyMinor(board, opponent) && pieces(board, color).length === 0);
    this.finish(cannotMate ? null : opponent, "timeout");
    this.ctx.update();
  }

  private finish(winner: Color | null, reason: ChessEnd) {
    // A clock still runs only on resigning, agreeing or flagging; stop it where it is.
    if (this.clockStartedAt !== null) this.clock[this.position.turn] = this.msLeft(this.position.turn)!;
    this.result = { winner, reason };
    this.drawOffer = null;
    this.clockStartedAt = null;
    this.ctx.clearTimers();
    for (let seat = 0; seat < 2; seat++) {
      const c = this.colorOf(this.seats[seat]);
      this.scores[seat] += winner === null ? 0.5 : winner === c ? 1 : 0;
    }
  }

  botAction(playerId: string): GameAction | null {
    const color = this.colorOf(playerId);
    if (!color) return null;
    if (this.result) return null;
    if (this.drawOffer === other(color)) return { type: "answerDraw", accept: false };
    if (this.position.turn !== color) return null;
    const m = chessBotMove(this.position, this.botLevel, this.ctx.random, new Set(this.history.slice(-12)));
    return { type: "move", from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) };
  }
}

/** This side's pieces other than the king. */
function pieces(board: string[], color: Color): string[] {
  return board.filter((p) => p && colorOf(p) === color && typeOf(p) !== "k");
}

/** Nothing but the king and a single knight or bishop. */
function onlyMinor(board: string[], color: Color): boolean {
  const own = pieces(board, color);
  return own.length === 1 && "nb".includes(typeOf(own[0]));
}

export const chess: GameDefinition = {
  id: "chess",
  create: (ctx, options) => new ChessGame(ctx, options),
};
