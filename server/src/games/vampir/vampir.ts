import { VAMPIR_ROLE_NAMES, type VampirRole, type VampirView } from "../../../../shared/games/vampir.js";
import { GameError, shuffle, type GameContext, type GameDefinition, type GameInstance } from "../types.js";

interface Player {
  id: string;
  name: string;
  role: VampirRole;
  alive: boolean;
}

/** Roles for a table of the given size: one vampire per four players. */
export function rolesFor(count: number): VampirRole[] {
  const roles: VampirRole[] = [];
  const vampires = Math.max(1, Math.floor(count / 4));
  for (let i = 0; i < vampires; i++) roles.push("vampir");
  roles.push("gozcu");
  if (count >= 5) roles.push("doktor");
  while (roles.length < count) roles.push("koylu");
  return roles;
}

export class VampirGame implements GameInstance {
  private players: Player[];
  private phase: VampirView["phase"] = "night";
  private day = 1;
  private nightTargets = new Map<string, string>();
  private seerResults: VampirView["seerResults"] = [];
  private votes = new Map<string, string | null>();
  private events: string[] = [];
  private winner: VampirView["winner"] = null;

  constructor(private ctx: GameContext) {
    const roles = shuffle(rolesFor(ctx.players.length), ctx.random);
    this.players = ctx.players.map((p, i) => ({ id: p.id, name: p.name, role: roles[i], alive: true }));
    this.events.push("1. gece başladı. Herkes gözlerini kapatsın.");
  }

  getView(playerId: string): VampirView {
    const me = this.players.find((p) => p.id === playerId);
    const knowsAll = this.phase === "finished" || (me !== undefined && !me.alive);
    const isVampire = me?.role === "vampir";
    return {
      phase: this.phase,
      day: this.day,
      players: this.players.map((p) => ({
        id: p.id,
        alive: p.alive,
        role: knowsAll || !p.alive || p.id === playerId || (isVampire && p.role === "vampir") ? p.role : undefined,
      })),
      myRole: me?.role ?? null,
      alive: me?.alive ?? false,
      mustAct: me !== undefined && this.phase === "night" && this.actsAtNight(me) && !this.nightTargets.has(me.id),
      vampireTargets: isVampire ? Object.fromEntries([...this.nightTargets].filter(([id]) => this.get(id).role === "vampir")) : {},
      seerResults: me?.role === "gozcu" ? this.seerResults.slice() : [],
      myTarget: this.nightTargets.get(playerId) ?? null,
      votes: Object.fromEntries(this.votes),
      waitingCount: this.waitingCount(),
      events: this.events.slice(),
      winner: this.winner,
    };
  }

  handleAction(playerId: string, action: { type: string; targetId?: unknown }): void {
    const me = this.players.find((p) => p.id === playerId);
    if (!me) throw new GameError("Bu oyunda değilsin.");
    if (!me.alive) throw new GameError("Ölüler oynayamaz.");
    switch (action.type) {
      case "nightTarget": {
        if (this.phase !== "night") throw new GameError("Şu an gece değil.");
        if (!this.actsAtNight(me)) throw new GameError("Geceleri yapacak bir şeyin yok.");
        const target = this.aliveTarget(action.targetId);
        if (me.role === "vampir" && target.role === "vampir") throw new GameError("Vampirler birbirini ısıramaz.");
        if (me.role === "gozcu") {
          if (target.id === me.id) throw new GameError("Kendine bakamazsın.");
          if (this.nightTargets.has(me.id)) throw new GameError("Bu gece zaten birine baktın.");
          this.seerResults.push({ targetId: target.id, isVampire: target.role === "vampir" });
        }
        this.nightTargets.set(me.id, target.id);
        if (this.waitingCount() === 0) this.resolveNight();
        return;
      }
      case "vote": {
        if (this.phase !== "day") throw new GameError("Oylama gündüz yapılır.");
        const targetId = action.targetId === null ? null : this.aliveTarget(action.targetId).id;
        this.votes.set(me.id, targetId);
        if (this.waitingCount() === 0) this.resolveDay();
        return;
      }
      default:
        throw new GameError("Bilinmeyen hamle.");
    }
  }

  private resolveNight() {
    const vampireVotes = [...this.nightTargets].filter(([id]) => this.get(id).role === "vampir").map(([, t]) => t);
    const victimId = this.pickMostVoted(vampireVotes, true);
    const doctor = this.players.find((p) => p.role === "doktor" && p.alive);
    const savedId = doctor ? this.nightTargets.get(doctor.id) : undefined;
    this.nightTargets.clear();

    if (victimId && victimId !== savedId) {
      const victim = this.get(victimId);
      victim.alive = false;
      this.events.push(`${this.day}. gece ${victim.name} öldürüldü. (${VAMPIR_ROLE_NAMES[victim.role]})`);
    } else {
      this.events.push(`${this.day}. gece kimse ölmedi.`);
    }
    if (this.checkWinner()) return;
    this.phase = "day";
    this.events.push(`${this.day}. gün: tartışın ve oylayın.`);
  }

  private resolveDay() {
    const votes = [...this.votes.values()];
    this.votes.clear();
    // Skipping counts as a candidate, and a tie hangs nobody.
    const lynchedId = this.pickMostVoted(
      votes.map((v) => v ?? ""),
      false,
    );
    if (lynchedId) {
      const lynched = this.get(lynchedId);
      lynched.alive = false;
      this.events.push(`${this.day}. gün köy ${lynched.name} kişisini astı. (${VAMPIR_ROLE_NAMES[lynched.role]})`);
    } else {
      this.events.push(`${this.day}. gün kimse asılmadı.`);
    }
    if (this.checkWinner()) return;
    this.day++;
    this.phase = "night";
    this.events.push(`${this.day}. gece başladı.`);
  }

  /** Plurality winner; on a tie either a random pick or nobody. Empty string means "nobody". */
  private pickMostVoted(votes: string[], breakTiesRandomly: boolean): string | null {
    const counts = new Map<string, number>();
    for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
    const max = Math.max(0, ...counts.values());
    const top = [...counts].filter(([, c]) => c === max).map(([id]) => id);
    if (top.length === 0) return null;
    if (top.length > 1 && !breakTiesRandomly) return null;
    const pick = top[Math.floor(this.ctx.random() * top.length)];
    return pick || null;
  }

  private checkWinner(): boolean {
    const alive = this.players.filter((p) => p.alive);
    const vampires = alive.filter((p) => p.role === "vampir").length;
    if (vampires === 0) this.winner = "koy";
    else if (vampires >= alive.length - vampires) this.winner = "vampir";
    if (!this.winner) return false;
    this.phase = "finished";
    this.events.push(this.winner === "koy" ? "Tüm vampirler öldü, köy kazandı!" : "Vampirler köyü ele geçirdi!");
    return true;
  }

  private waitingCount(): number {
    if (this.phase === "night") return this.players.filter((p) => p.alive && this.actsAtNight(p) && !this.nightTargets.has(p.id)).length;
    if (this.phase === "day") return this.players.filter((p) => p.alive && !this.votes.has(p.id)).length;
    return 0;
  }

  private actsAtNight(p: Player) {
    return p.alive && p.role !== "koylu";
  }

  private aliveTarget(targetId: unknown): Player {
    const target = this.players.find((p) => p.id === targetId);
    if (!target || !target.alive) throw new GameError("Geçersiz hedef.");
    return target;
  }

  private get(id: string): Player {
    return this.players.find((p) => p.id === id)!;
  }
}

export const vampir: GameDefinition = {
  id: "vampir",
  create: (ctx) => new VampirGame(ctx),
};
