export type TabuTeam = 0 | 1;

export interface TabuCard {
  word: string;
  taboo: string[];
}

export interface TabuView {
  phase: "setup" | "ready" | "turn" | "finished";
  teams: [string[], string[]];
  scores: [number, number];
  /** Rounds each team plays; the game ends after both teams finish them. */
  totalRounds: number;
  round: number;
  activeTeam: TabuTeam;
  narratorId: string | null;
  turnEndsAt: number | null;
  /** null when passes are unlimited. */
  passesLeft: number | null;
  /** Visible to the narrator and the opposing team only. */
  card: TabuCard | null;
  /** What happened in the current or last turn. */
  log: { word: string; result: "correct" | "pass" | "taboo" }[];
  roundSeconds: number;
}

export type TabuAction =
  | { type: "switchTeam" }
  | { type: "shuffleTeams" }
  | { type: "begin" }
  | { type: "startTurn" }
  | { type: "correct" }
  | { type: "pass" }
  | { type: "taboo" };
