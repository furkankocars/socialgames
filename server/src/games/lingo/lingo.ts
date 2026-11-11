import { LINGO_LENGTHS, LINGO_TRIES, LINGO_TURN_SECONDS, lingoPoints, type LingoMark, type LingoView } from "../../../../shared/games/lingo.js";
import { GameError, type GameAction, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { LINGO_ANSWERS, LINGO_WORDS, normalize } from "./words.js";

/** How long the finished round stays up before the next one deals itself. */
export const NEXT_ROUND_MS = 12_000;

/** A bot thinks this long on its turn before it starts typing. */
const BOT_THINK_MS = [3_000, 8_000];

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

interface Row {
  by: string;
  word: string | null;
  marks: LingoMark[];
}

export class LingoGame implements GameInstance {
  private ids: string[];
  private names: Map<string, string>;
  private rounds: number;
  /** 0 for growing words. */
  private lengthOption: number;
  private turnSeconds: number;
  private scores = new Map<string, number>();
  private used = new Set<string>();

  private round = 0;
  private phase: LingoView["phase"] = "play";
  private word = "";
  private rows: Row[] = [];
  /** Index into ids of the player on turn. */
  private turnAt = 0;
  /** Bumped on every turn change, so a stale timer knows it is stale. */
  private turnNo = 0;
  private draft = "";
  private solver: string | null = null;
  private points = 0;
  private turnEndsAt: number | null = null;
  private nextAt: number | null = null;
  /** When the bot on turn starts typing, and the word it settled on. */
  private botReadyAt: number | null = null;
  private botWord: string | null = null;
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
    const seconds = Number(options.turnSeconds);
    this.turnSeconds = (LINGO_TURN_SECONDS as readonly number[]).includes(seconds) ? seconds : 30;
    for (const id of this.ids) this.scores.set(id, 0);
    this.startRound();
  }

  private get length(): number {
    return this.lengthOption || LINGO_LENGTHS[(this.round - 1) % LINGO_LENGTHS.length];
  }

  private get turn(): string | null {
    return this.phase === "play" ? this.ids[this.turnAt] : null;
  }

  getView(_playerId: string): LingoView {
    const now = Date.now();
    const opener = (this.round - 1) % this.ids.length;
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      length: this.length,
      tries: LINGO_TRIES,
      first: this.word[0],
      word: this.phase === "play" ? null : this.word,
      rows: this.rows.map((r) => ({ by: r.by, word: r.word, marks: r.marks.slice() })),
      turn: this.turn,
      draft: this.draft,
      turnMsLeft: this.turn !== null && this.turnEndsAt !== null ? Math.max(0, this.turnEndsAt - now) : null,
      turnSeconds: this.turnSeconds,
      solver: this.solver,
      points: this.points,
      nextMsLeft: this.phase === "result" && this.nextAt !== null ? Math.max(0, this.nextAt - now) : null,
      order: [...this.ids.slice(opener), ...this.ids.slice(0, opener)],
      scores: Object.fromEntries(this.scores),
      log: this.log.slice(),
    };
  }

  handleAction(playerId: string, action: GameAction): void {
    if (!this.ids.includes(playerId)) throw new GameError("Bu oyunda değilsin.");
    switch (action.type) {
      case "draft": {
        if (this.turn !== playerId) return;
        const letters = [...normalize(String(action.word ?? "")).replace(/[^a-zçğıöşü]/g, "")].slice(0, this.length - 1);
        this.draft = letters.join("");
        return;
      }
      case "guess": {
        if (this.phase !== "play") throw new GameError("Tur bitti.");
        if (this.turn !== playerId) throw new GameError(`Sıra ${this.name(this.turn!)} oyuncusunda.`);
        const guess = normalize(String(action.word ?? ""));
        if ([...guess].length !== this.length) throw new GameError(`Kelime ${this.length} harfli olmalı.`);
        if (guess[0] !== this.word[0]) throw new GameError(`Kelime ${this.word[0].toLocaleUpperCase("tr")} ile başlamalı.`);
        if (this.rows.some((r) => r.word === guess)) throw new GameError("Bu kelime zaten denendi.");
        if (!LINGO_WORDS.has(guess)) throw new GameError("Bu kelime sözlükte yok.");
        this.rows.push({ by: playerId, word: guess, marks: markGuess(guess, this.word) });
        if (guess === this.word) {
          this.solver = playerId;
          this.points = lingoPoints(this.rows.length);
          this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + this.points);
          this.log.push(`${this.name(playerId)} ${this.rows.length}. satırda buldu: +${this.points}.`);
          this.endRound();
        } else this.nextTurn();
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
   * On its turn a bot thinks a while, settles on a word that fits the board
   * (now and then minding only the green squares), then types it letter by
   * letter so the table can watch, and sends it.
   */
  botAction(playerId: string): GameAction | null {
    if (this.turn !== playerId) return null;
    if (this.botReadyAt === null) {
      // A seat that just turned into a bot thinks a while first.
      this.planBot();
      return null;
    }
    if (Date.now() < this.botReadyAt) return null;
    this.botWord ??= this.pickBotWord();
    const typed = [...this.draft].length;
    const rest = [...this.botWord].slice(1);
    if (typed < rest.length) return { type: "draft", word: rest.slice(0, typed + 1).join("") };
    return { type: "guess", word: this.botWord };
  }

  private pickBotWord(): string {
    // Like a person, a bot thinks of any word it knows, not just the ones a round can be about.
    const tried = new Set(this.rows.map((r) => r.word));
    const pool = this.botWords().filter((w) => !tried.has(w));
    const careless = this.ctx.random() < 0.4;
    const seen = this.rows.filter((r) => r.word !== null) as { word: string; marks: LingoMark[] }[];
    const fits = pool.filter((w) => seen.every((r) => sameMarks(markGuess(r.word, w), r.marks, careless)));
    const choices = fits.length ? fits : pool;
    return choices[Math.floor(this.ctx.random() * choices.length)];
  }

  private botPool: string[] | null = null;
  private botWords(): string[] {
    this.botPool ??= [...LINGO_WORDS].filter((w) => w.length === this.length && w[0] === this.word[0]);
    return this.botPool;
  }

  private planBot() {
    const [min, max] = BOT_THINK_MS;
    const wait = min + Math.floor(this.ctx.random() * (max - min));
    this.botReadyAt = Date.now() + wait;
    // Wakes the room so its bot loop asks again once the bot is ready.
    const turnNo = this.turnNo;
    this.ctx.setTimer(() => this.turnNo === turnNo && this.ctx.update(), wait + 50);
  }

  private startRound() {
    this.ctx.clearTimers();
    this.round++;
    const answers = LINGO_ANSWERS[this.length];
    let fresh = answers.filter((w) => !this.used.has(w));
    if (!fresh.length) fresh = answers;
    this.word = fresh[Math.floor(this.ctx.random() * fresh.length)];
    this.used.add(this.word);
    this.rows = [];
    this.solver = null;
    this.points = 0;
    this.nextAt = null;
    this.phase = "play";
    this.botPool = null;
    this.log.push(`${this.round}. tur: ${this.length} harfli, ${this.word[0].toLocaleUpperCase("tr")} ile başlıyor.`);
    // Each round a different player opens.
    this.beginTurn((this.round - 1) % this.ids.length);
  }

  private nextTurn() {
    if (this.rows.length >= LINGO_TRIES) {
      this.endRound();
      return;
    }
    this.beginTurn((this.turnAt + 1) % this.ids.length);
  }

  private beginTurn(at: number) {
    this.ctx.clearTimers();
    this.turnAt = at;
    this.turnNo++;
    this.draft = "";
    this.botReadyAt = null;
    this.botWord = null;
    this.turnEndsAt = Date.now() + this.turnSeconds * 1000;
    const turnNo = this.turnNo;
    this.ctx.setTimer(() => {
      if (this.turnNo !== turnNo || this.phase !== "play") return;
      // A turn that runs out still uses up its row, so a round always ends.
      const id = this.ids[this.turnAt];
      this.rows.push({ by: id, word: null, marks: [] });
      this.log.push(`${this.name(id)} süreyi kaçırdı.`);
      this.nextTurn();
      this.ctx.update();
    }, this.turnSeconds * 1000);
    if (this.ctx.isBot(this.ids[at])) this.planBot();
  }

  private endRound() {
    this.ctx.clearTimers();
    this.turnNo++;
    this.turnEndsAt = null;
    this.draft = "";
    if (!this.solver) this.log.push("Kimse bulamadı.");
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
