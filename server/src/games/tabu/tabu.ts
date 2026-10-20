import type { TabuCard, TabuTeam, TabuView } from "../../../../shared/games/tabu.js";
import { GameError, shuffle, type GameContext, type GameDefinition, type GameInstance } from "../types.js";
import { TABU_CARDS } from "./words.js";

const PASS_LIMIT = 3;

export class TabuGame implements GameInstance {
  private phase: TabuView["phase"] = "setup";
  private teams: [string[], string[]] = [[], []];
  private scores: [number, number] = [0, 0];
  private round = 1;
  private activeTeam: TabuTeam = 0;
  /** Index of the next narrator inside each team. */
  private narratorIndex: [number, number] = [0, 0];
  private turnEndsAt: number | null = null;
  private passesLeft = PASS_LIMIT;
  private deck: TabuCard[] = [];
  private card: TabuCard | null = null;
  private log: TabuView["log"] = [];
  private roundSeconds: number;
  private totalRounds: number;

  constructor(
    private ctx: GameContext,
    options: Record<string, unknown>,
    private cards: TabuCard[] = TABU_CARDS,
  ) {
    this.roundSeconds = clampInt(options.roundSeconds, 30, 180, 60);
    this.totalRounds = clampInt(options.rounds, 1, 10, 3);
    this.shuffleTeams();
  }

  getView(playerId: string): TabuView {
    const narratorId = this.narratorId();
    const myTeam = this.teamOf(playerId);
    const seesCard = playerId === narratorId || (myTeam !== null && myTeam !== this.activeTeam);
    return {
      phase: this.phase,
      teams: [this.teams[0].slice(), this.teams[1].slice()],
      scores: [this.scores[0], this.scores[1]],
      totalRounds: this.totalRounds,
      round: this.round,
      activeTeam: this.activeTeam,
      narratorId: this.phase === "setup" || this.phase === "finished" ? null : narratorId,
      turnEndsAt: this.turnEndsAt,
      passesLeft: this.passesLeft,
      card: this.phase === "turn" && seesCard ? this.card : null,
      log: this.log.slice(),
      roundSeconds: this.roundSeconds,
    };
  }

  handleAction(playerId: string, action: { type: string }): void {
    switch (action.type) {
      case "switchTeam": {
        this.requirePhase("setup");
        const team = this.teamOf(playerId);
        if (team === null) throw new GameError("Takımın yok.");
        const other = (1 - team) as TabuTeam;
        this.teams[team] = this.teams[team].filter((id) => id !== playerId);
        this.teams[other].push(playerId);
        return;
      }
      case "shuffleTeams":
        this.requirePhase("setup");
        this.requireHost(playerId);
        this.shuffleTeams();
        return;
      case "begin":
        this.requirePhase("setup");
        this.requireHost(playerId);
        if (this.teams[0].length < 2 || this.teams[1].length < 2) throw new GameError("Her takımda en az 2 kişi olmalı.");
        this.phase = "ready";
        return;
      case "startTurn":
        this.requirePhase("ready");
        if (playerId !== this.narratorId()) throw new GameError("Sıra anlatıcıda.");
        this.startTurn();
        return;
      case "correct":
      case "pass":
        this.requirePhase("turn");
        if (playerId !== this.narratorId()) throw new GameError("Bunu sadece anlatıcı yapabilir.");
        if (action.type === "pass") {
          if (this.passesLeft <= 0) throw new GameError("Pas hakkın kalmadı.");
          this.passesLeft--;
        } else {
          this.scores[this.activeTeam]++;
        }
        this.log.push({ word: this.card!.word, result: action.type });
        this.nextCard();
        return;
      case "taboo": {
        this.requirePhase("turn");
        const team = this.teamOf(playerId);
        if (playerId !== this.narratorId() && (team === null || team === this.activeTeam)) {
          throw new GameError("Tabu'yu anlatıcı ya da rakip takım söyler.");
        }
        this.scores[this.activeTeam]--;
        this.log.push({ word: this.card!.word, result: "taboo" });
        this.nextCard();
        return;
      }
      default:
        throw new GameError("Bilinmeyen hamle.");
    }
  }

  private startTurn() {
    this.phase = "turn";
    this.passesLeft = PASS_LIMIT;
    this.log = [];
    this.turnEndsAt = Date.now() + this.roundSeconds * 1000;
    this.nextCard();
    this.ctx.setTimer(() => {
      this.endTurn();
      this.ctx.update();
    }, this.roundSeconds * 1000);
  }

  private endTurn() {
    this.turnEndsAt = null;
    this.card = null;
    this.narratorIndex[this.activeTeam]++;
    if (this.activeTeam === 1) {
      if (this.round >= this.totalRounds) {
        this.phase = "finished";
        return;
      }
      this.round++;
    }
    this.activeTeam = (1 - this.activeTeam) as TabuTeam;
    this.phase = "ready";
  }

  private nextCard() {
    if (this.deck.length === 0) this.deck = shuffle(this.cards, this.ctx.random);
    this.card = this.deck.pop()!;
  }

  private narratorId(): string | null {
    const team = this.teams[this.activeTeam];
    if (team.length === 0) return null;
    return team[this.narratorIndex[this.activeTeam] % team.length];
  }

  private teamOf(playerId: string): TabuTeam | null {
    if (this.teams[0].includes(playerId)) return 0;
    if (this.teams[1].includes(playerId)) return 1;
    return null;
  }

  private shuffleTeams() {
    const ids = shuffle(
      this.ctx.players.map((p) => p.id),
      this.ctx.random,
    );
    const half = Math.ceil(ids.length / 2);
    this.teams = [ids.slice(0, half), ids.slice(half)];
  }

  private requirePhase(phase: TabuView["phase"]) {
    if (this.phase !== phase) throw new GameError("Şu an bunu yapamazsın.");
  }

  private requireHost(playerId: string) {
    if (playerId !== this.ctx.hostId()) throw new GameError("Bunu sadece oda sahibi yapabilir.");
  }
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const tabu: GameDefinition = {
  id: "tabu",
  create: (ctx, options) => new TabuGame(ctx, options),
};
