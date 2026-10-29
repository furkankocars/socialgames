import { LINGO_LENGTHS, LINGO_PLACE_BONUS, LINGO_TRIES, lingoPoints, type LingoBoard, type LingoMark, type LingoView } from "../../../../shared/games/lingo.js";
import { GameError, type GameAction, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { LINGO_ANSWERS, LINGO_WORDS, normalize } from "./words.js";

/** How long the finished round stays up before the next one deals itself. */
export const NEXT_ROUND_MS = 12_000;

/** A bot takes this long over each guess, so the race stays fair to people. */
const BOT_THINK_MS = [8_000, 16_000];

/** Wordle rules: hits first, then each leftover letter of the word can light up one near. */
export function markGuess(guess: string, word: string): LingoMark[] {
  const g = [...guess];
  const w = [...word];
  const marks: LingoMark[] = g.map((c, i) => (c === w[i] ? "hit" : "miss"));
  const left = new Map<string, number>();
  w.forEach((c, i) => marks[i] !== "hit" && left.set(c, (left.get(c) ?? 0) + 1));
  g.forEach((c, i) => {
    if (marks[i] === "hit" || !left.get(c)) return;
    marks[i] = "near";
    left.set(c, left.get(c)! - 1);
  });
  return marks;
}

interface Board {
  guesses: string[];
  marks: LingoMark[][];
  solved: boolean;
  points: number;
  place: number | null;
}

export class LingoGame implements GameInstance {
  private ids: string[];
  private names: Map<string, string>;
  private rounds: number;
  /** 0 for growing words. */
  private lengthOption: number;
  private roundSeconds: number;
  private scores = new Map<string, number>();
  private used = new Set<string>();

  private round = 0;
  private phase: LingoView["phase"] = "play";
  private word = "";
  private boards = new Map<string, Board>();
  private solvers = 0;
  private roundEndsAt: number | null = null;
  private nextAt: number | null = null;
  /** When each bot may guess again. */
  private botReadyAt = new Map<string, number>();
  private log: string[] = [];

  constructor(
    private ctx: GameContext,
    options: Record<string, unknown> = {},
  ) {
    this.ids = ctx.players.map((p) => p.id);
    this.names = new Map(ctx.players.map((p) => [p.id, p.name]));
    const rounds = Number(options.rounds);
    this.rounds = [3, 5, 10, 15].includes(rounds) ? rounds : 5;
    const length = Number(options.length);
    this.lengthOption = (LINGO_LENGTHS as readonly number[]).includes(length) || length === 0 ? length : 5;
    const seconds = Number(options.roundSeconds);
    this.roundSeconds = [60, 90, 120, 180].includes(seconds) ? seconds : 90;
    for (const id of this.ids) this.scores.set(id, 0);
    this.startRound();
  }

  private get length(): number {
    return this.lengthOption || LINGO_LENGTHS[(this.round - 1) % LINGO_LENGTHS.length];
  }

  getView(playerId: string): LingoView {
    const over = this.phase !== "play";
    const boards: Record<string, LingoBoard> = {};
    for (const [id, b] of this.boards) {
      const open = over || id === playerId;
      boards[id] = {
        rows: b.guesses.map((word, i) => ({ word: open ? word : null, marks: b.marks[i] })),
        solved: b.solved,
        done: this.isDone(b),
        points: b.points,
        place: b.place,
      };
    }
    const now = Date.now();
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      length: this.length,
      tries: LINGO_TRIES,
      first: this.word[0],
      word: over ? this.word : null,
      roundMsLeft: this.phase === "play" && this.roundEndsAt !== null ? Math.max(0, this.roundEndsAt - now) : null,
      roundSeconds: this.roundSeconds,
      nextMsLeft: this.phase === "result" && this.nextAt !== null ? Math.max(0, this.nextAt - now) : null,
      boards,
      scores: Object.fromEntries(this.scores),
      log: this.log.slice(),
    };
  }

  handleAction(playerId: string, action: GameAction): void {
    if (!this.ids.includes(playerId)) throw new GameError("Bu oyunda değilsin.");
    switch (action.type) {
      case "guess": {
        if (this.phase !== "play") throw new GameError("Tur bitti.");
        const board = this.boards.get(playerId)!;
        if (this.isDone(board)) throw new GameError(board.solved ? "Kelimeyi zaten buldun." : "Tahmin hakkın bitti.");
        const guess = normalize(String(action.word ?? ""));
        if ([...guess].length !== this.length) throw new GameError(`Kelime ${this.length} harfli olmalı.`);
        if (guess[0] !== this.word[0]) throw new GameError(`Kelime ${this.word[0].toLocaleUpperCase("tr")} ile başlamalı.`);
        if (board.guesses.includes(guess)) throw new GameError("Bu kelimeyi zaten denedin.");
        if (!LINGO_WORDS.has(guess)) throw new GameError("Bu kelime sözlükte yok.");
        board.guesses.push(guess);
        board.marks.push(markGuess(guess, this.word));
        if (guess === this.word) {
          board.solved = true;
          board.place = ++this.solvers;
          board.points = lingoPoints(board.guesses.length) + (LINGO_PLACE_BONUS[board.place - 1] ?? 0);
          this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + board.points);
          this.log.push(`${this.name(playerId)} ${board.guesses.length}. denemede buldu: +${board.points}.`);
        }
        if (this.ctx.isBot(playerId)) this.planBot(playerId);
        if (this.ids.every((id) => this.isDone(this.boards.get(id)!))) this.endRound();
        return;
      }
      case "next": {
        if (this.phase !== "result") throw new GameError("Tur henüz bitmedi.");
        if (playerId !== this.ctx.hostId()) throw new GameError("Yeni turu oda sahibi başlatır.");
        this.startRound();
        return;
      }
      default:
        throw new GameError("Bilinmeyen hamle.");
    }
  }

  /**
   * A bot guesses a word that fits what its own board has shown so far, now
   * and then forgetting the yellow and dark squares, and takes its
   * time over each guess.
   */
  botAction(playerId: string): GameAction | null {
    if (this.phase !== "play") return null;
    const board = this.boards.get(playerId);
    if (!board || this.isDone(board)) return null;
    const readyAt = this.botReadyAt.get(playerId);
    if (readyAt === undefined) {
      // A seat that just turned into a bot thinks a while first.
      this.planBot(playerId);
      return null;
    }
    if (Date.now() < readyAt) return null;
    // Like a person, a bot thinks of any word it knows, not just the ones a round can be about.
    const pool = this.botWords().filter((w) => !board.guesses.includes(w));
    const careless = this.ctx.random() < 0.4;
    const fits = pool.filter((w) => board.guesses.every((g, i) => sameMarks(markGuess(g, w), board.marks[i], careless)));
    const choices = fits.length ? fits : pool;
    return { type: "guess", word: choices[Math.floor(this.ctx.random() * choices.length)] };
  }

  private botPool: string[] | null = null;
  private botWords(): string[] {
    this.botPool ??= [...LINGO_WORDS].filter((w) => w.length === this.length && w[0] === this.word[0]);
    return this.botPool;
  }

  private planBot(playerId: string) {
    const [min, max] = BOT_THINK_MS;
    const wait = min + Math.floor(this.ctx.random() * (max - min));
    this.botReadyAt.set(playerId, Date.now() + wait);
    // Wakes the room so its bot loop asks again once the bot is ready.
    const round = this.round;
    this.ctx.setTimer(() => this.round === round && this.phase === "play" && this.ctx.update(), wait + 50);
  }

  private startRound() {
    this.ctx.clearTimers();
    this.round++;
    const answers = LINGO_ANSWERS[this.length];
    let fresh = answers.filter((w) => !this.used.has(w));
    if (!fresh.length) fresh = answers;
    this.word = fresh[Math.floor(this.ctx.random() * fresh.length)];
    this.used.add(this.word);
    this.boards = new Map(this.ids.map((id) => [id, { guesses: [], marks: [], solved: false, points: 0, place: null }]));
    this.solvers = 0;
    this.nextAt = null;
    this.phase = "play";
    this.botReadyAt.clear();
    this.botPool = null;
    this.log.push(`${this.round}. tur: ${this.length} harfli, ${this.word[0].toLocaleUpperCase("tr")} ile başlıyor.`);
    this.roundEndsAt = Date.now() + this.roundSeconds * 1000;
    const round = this.round;
    this.ctx.setTimer(() => {
      if (this.round !== round || this.phase !== "play") return;
      this.log.push("Süre doldu.");
      this.endRound();
      this.ctx.update();
    }, this.roundSeconds * 1000);
    for (const id of this.ids) if (this.ctx.isBot(id)) this.planBot(id);
  }

  private endRound() {
    this.ctx.clearTimers();
    this.roundEndsAt = null;
    if (!this.solvers) this.log.push("Kimse bulamadı.");
    this.log.push(`Kelime: ${this.word.toLocaleUpperCase("tr")}.`);
    if (this.round >= this.rounds) {
      this.phase = "finished";
      return;
    }
    this.phase = "result";
    this.nextAt = Date.now() + NEXT_ROUND_MS;
    const round = this.round;
    this.ctx.setTimer(() => {
      if (this.round !== round || this.phase !== "result") return;
      this.startRound();
      this.ctx.update();
    }, NEXT_ROUND_MS);
  }

  private isDone(b: Board): boolean {
    return b.solved || b.guesses.length >= LINGO_TRIES;
  }

  private name(id: string): string {
    return this.names.get(id) ?? "Biri";
  }
}

/** Whether a word would have lit up a past guess the same way; a careless bot only checks the green squares. */
function sameMarks(a: LingoMark[], b: LingoMark[], careless: boolean): boolean {
  return a.every((m, i) => (careless ? (m === "hit") === (b[i] === "hit") : m === b[i]));
}

export const lingo: GameDefinition = {
  id: "lingo",
  create: (ctx, options) => new LingoGame(ctx, options),
};
