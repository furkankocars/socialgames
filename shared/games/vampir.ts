export type VampirRole = "vampir" | "koylu" | "doktor" | "gozcu";

export const VAMPIR_ROLE_NAMES: Record<VampirRole, string> = {
  vampir: "Vampir",
  koylu: "Köylü",
  doktor: "Doktor",
  gozcu: "Gözcü",
};

export interface VampirPlayerView {
  id: string;
  alive: boolean;
  /** Only present when the viewer is allowed to know it. */
  role?: VampirRole;
}

export interface VampirView {
  phase: "night" | "day" | "finished";
  day: number;
  players: VampirPlayerView[];
  myRole: VampirRole | null;
  alive: boolean;
  /** Night: whether the viewer still has to choose a target. */
  mustAct: boolean;
  /** Night, vampires only: who each vampire is targeting. */
  vampireTargets: Record<string, string>;
  /** Seer only: everything learned so far. */
  seerResults: { targetId: string; isVampire: boolean }[];
  /** Night: my current choice. */
  myTarget: string | null;
  /** Day: public votes, null means "kimseyi asma". */
  votes: Record<string, string | null>;
  waitingCount: number;
  events: string[];
  winner: "vampir" | "koy" | null;
}

export type VampirAction = { type: "nightTarget"; targetId: string } | { type: "vote"; targetId: string | null };
