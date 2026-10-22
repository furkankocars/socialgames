import { CASUS_CATEGORIES, type CasusOutcome, type CasusView } from "../../../../shared/games/casus.js";
import { GameError, shuffle, type GameAction, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { CASUS_WORDS } from "./words.js";

/** How many words the spy picks from. */
const CANDIDATES = 16;

/** Points per player for each way a round can end. */
const POINTS = { town: 1, escaped: 2, guessed: 3 };

interface Entry {
  word: string;
  category: string;
}

/** Spies stay a minority: one for three or four players, at most half the rest after that. */
export function maxSpies(players: number): number {
  return Math.max(1, Math.floor((players - 1) / 2));
}

export class CasusGame implements GameInstance {
  private ids: string[];
  private names: Map<string, string>;
  private category: string;
  private pool: Entry[];
  private used = new Set<string>();
  private rounds: number;
  private spyCount: number;
  private talkSeconds: number;
  private scores = new Map<string, number>();

  private round = 0;
  private phase: CasusView["phase"] = "reveal";
  private secret!: Entry;
  private candidates: string[] = [];
  private spies = new Set<string>();
  private firstAsker = "";
  private ready = new Set<string>();
  private wantVote = new Set<string>();
  private votes = new Map<string, string>();
  private talkEndsAt: number | null = null;
  private accusedId: string | null = null;
  private guesserId: string | null = null;
  private guess: string | null = null;
  private outcome: CasusOutcome | null = null;
  private log: string[] = [];

  constructor(
    private ctx: GameContext,
    options: Record<string, unknown> = {},
  ) {
    this.ids = ctx.players.map((p) => p.id);
    this.names = new Map(ctx.players.map((p) => [p.id, p.name]));
    const index = Number(options.category);
    this.category = CASUS_CATEGORIES[Number.isInteger(index) && index > 0 && index < CASUS_CATEGORIES.length ? index : 0];
    const groups = this.category === "Tümü" ? Object.keys(CASUS_WORDS) : [this.category];
    this.pool = groups.flatMap((category) => CASUS_WORDS[category].map((word) => ({ word, category })));
    const rounds = Number(options.rounds);
    this.rounds = [1, 3, 5, 7].includes(rounds) ? rounds : 3;
    const spies = Number(options.spies);
    this.spyCount = Math.min([1, 2, 3].includes(spies) ? spies : 1, maxSpies(this.ids.length));
    const minutes = Number(options.talkMinutes);
    this.talkSeconds = [3, 5, 8].includes(minutes) ? minutes * 60 : minutes === 0 ? 0 : 5 * 60;
    for (const id of this.ids) this.scores.set(id, 0);
    this.startRound();
  }

  getView(playerId: string): CasusView {
    const over = this.phase === "result" || this.phase === "finished";
    const isSpy = this.spies.has(playerId);
    const knows = over || !isSpy;
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      category: this.category,
      spyCount: this.spyCount,
      isSpy,
      word: knows ? this.secret.word : null,
      wordCategory: knows ? this.secret.category : null,
      candidates: this.candidates.slice(),
      firstAsker: this.firstAsker,
      ready: [...this.ready],
      wantVote: [...this.wantVote],
      voted: [...this.votes.keys()],
      myVote: this.votes.get(playerId) ?? null,
      votes: this.phase === "talk" || this.phase === "reveal" || this.phase === "vote" ? null : Object.fromEntries(this.votes),
      talkMsLeft: this.phase === "talk" && this.talkEndsAt !== null ? Math.max(0, this.talkEndsAt - Date.now()) : null,
      talkSeconds: this.talkSeconds,
      accusedId: this.accusedId,
      guesserId: this.guesserId,
      guess: this.guess,
      spies: over ? [...this.spies] : isSpy ? [playerId] : [],
      outcome: this.outcome,
      winner: this.outcome === null ? null : this.outcome === "caught" || this.outcome === "missed" ? "town" : "spies",
      scores: Object.fromEntries(this.scores),
      log: this.log.slice(),
    };
  }

  handleAction(playerId: string, action: GameAction): void {
    if (!this.ids.includes(playerId)) throw new GameError("Bu oyunda değilsin.");
    switch (action.type) {
      case "ready": {
        if (this.phase !== "reveal") throw new GameError("Kartlar zaten açıldı.");
        this.ready.add(playerId);
        if (this.ready.size === this.ids.length) this.startTalk();
        return;
      }
      case "wantVote": {
        if (this.phase !== "talk") throw new GameError("Şu an soru zamanı değil.");
        if (action.on) this.wantVote.add(playerId);
        else this.wantVote.delete(playerId);
        if (this.wantVote.size * 2 > this.ids.length) this.startVote("Masanın çoğu oylamaya geçmek istedi.");
        return;
      }
      case "vote": {
        if (this.phase !== "vote") throw new GameError("Şu an oylama yok.");
        const target = String(action.targetId);
        if (!this.ids.includes(target)) throw new GameError("Geçersiz oyuncu.");
        if (target === playerId) throw new GameError("Kendine oy veremezsin.");
        this.votes.set(playerId, target);
        if (this.votes.size === this.ids.length) this.resolveVote();
        return;
      }
      case "guess": {
        const word = String(action.word);
        if (!this.candidates.includes(word)) throw new GameError("Listeden bir kelime seç.");
        if (this.phase === "talk") {
          if (!this.spies.has(playerId)) throw new GameError("Kelimeyi sadece casus tahmin eder.");
          this.guesserId = playerId;
          this.log.push(`${this.name(playerId)} casus olduğunu açıkladı ve kelimeyi tahmin etti.`);
        } else if (this.phase === "guess") {
          if (playerId !== this.guesserId) throw new GameError("Tahmin sırası yakalanan casusta.");
        } else {
          throw new GameError("Şu an tahmin yapılamaz.");
        }
        this.guess = word;
        const right = word === this.secret.word;
        this.log.push(`Tahmin: ${word}. ${right ? "Doğru!" : `Yanlış, kelime ${this.secret.word} idi.`}`);
        if (right) this.finishRound("guessed");
        else this.finishRound(this.phase === "talk" ? "missed" : "caught");
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
   * A bot only ever stands in for a player who dropped: it confirms its card,
   * agrees to vote, votes at random and, as a caught spy, guesses at random.
   */
  botAction(playerId: string): GameAction | null {
    if (this.phase === "reveal" && !this.ready.has(playerId)) return { type: "ready" };
    if (this.phase === "talk" && !this.wantVote.has(playerId)) return { type: "wantVote", on: true };
    if (this.phase === "vote" && !this.votes.has(playerId)) {
      const others = this.ids.filter((id) => id !== playerId);
      return { type: "vote", targetId: others[Math.floor(this.ctx.random() * others.length)] };
    }
    if (this.phase === "guess" && playerId === this.guesserId) {
      return { type: "guess", word: this.candidates[Math.floor(this.ctx.random() * this.candidates.length)] };
    }
    return null;
  }

  private startRound() {
    this.ctx.clearTimers();
    this.round++;
    let fresh = this.pool.filter((e) => !this.used.has(e.word));
    if (fresh.length === 0) {
      this.used.clear();
      fresh = this.pool;
    }
    this.secret = fresh[Math.floor(this.ctx.random() * fresh.length)];
    this.used.add(this.secret.word);
    const decoys = shuffle(
      this.pool.filter((e) => e.word !== this.secret.word),
      this.ctx.random,
    )
      .slice(0, CANDIDATES - 1)
      .map((e) => e.word);
    this.candidates = shuffle([this.secret.word, ...decoys], this.ctx.random).sort((a, b) => a.localeCompare(b, "tr"));
    this.spies = new Set(shuffle(this.ids, this.ctx.random).slice(0, this.spyCount));
    this.firstAsker = this.ids[Math.floor(this.ctx.random() * this.ids.length)];
    this.ready.clear();
    this.wantVote.clear();
    this.votes.clear();
    this.talkEndsAt = null;
    this.accusedId = null;
    this.guesserId = null;
    this.guess = null;
    this.outcome = null;
    this.phase = "reveal";
    this.log.push(`${this.round}. tur: kartlar dağıtıldı.`);
  }

  private startTalk() {
    this.phase = "talk";
    this.log.push(`Sorular başladı. İlk soruyu ${this.name(this.firstAsker)} soruyor.`);
    if (!this.talkSeconds) return;
    this.talkEndsAt = Date.now() + this.talkSeconds * 1000;
    const round = this.round;
    this.ctx.setTimer(() => {
      if (this.phase !== "talk" || this.round !== round) return;
      this.startVote("Süre doldu.");
      this.ctx.update();
    }, this.talkSeconds * 1000);
  }

  private startVote(reason: string) {
    this.ctx.clearTimers();
    this.phase = "vote";
    this.talkEndsAt = null;
    this.log.push(`${reason} Oylama başladı.`);
  }

  private resolveVote() {
    const counts = new Map<string, number>();
    for (const target of this.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    const max = Math.max(...counts.values());
    const top = [...counts].filter(([, c]) => c === max).map(([id]) => id);
    if (top.length > 1) {
      this.log.push("Oylar eşit çıktı, kimse suçlanamadı.");
      this.finishRound("escaped");
      return;
    }
    this.accusedId = top[0];
    if (!this.spies.has(this.accusedId)) {
      this.log.push(`Masa ${this.name(this.accusedId)} dedi ama o casus değildi.`);
      this.finishRound("escaped");
      return;
    }
    this.guesserId = this.accusedId;
    this.phase = "guess";
    this.log.push(`Masa ${this.name(this.accusedId)} dedi ve casusu yakaladı. Son şans: kelimeyi tahmin etmesi.`);
  }

  private finishRound(outcome: CasusOutcome) {
    this.ctx.clearTimers();
    this.outcome = outcome;
    this.talkEndsAt = null;
    const spiesWin = outcome === "escaped" || outcome === "guessed";
    for (const id of this.ids) {
      const gain = spiesWin ? (this.spies.has(id) ? POINTS[outcome as "escaped" | "guessed"] : 0) : this.spies.has(id) ? 0 : POINTS.town;
      this.scores.set(id, (this.scores.get(id) ?? 0) + gain);
    }
    const many = this.spies.size > 1;
    const spyNames = [...this.spies].map((id) => this.name(id)).join(", ");
    const who = many ? "Casuslar" : "Casus";
    this.log.push(`${spiesWin ? `${who} kazandı` : "Masa kazandı"}. ${who}: ${spyNames}. Kelime: ${this.secret.word}.`);
    this.phase = this.round >= this.rounds ? "finished" : "result";
  }

  private name(id: string): string {
    return this.names.get(id) ?? "Biri";
  }
}

export const casus: GameDefinition = {
  id: "casus",
  create: (ctx, options) => new CasusGame(ctx, options),
};
