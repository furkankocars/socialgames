import type { GameId } from "../../../shared/protocol.js";
import type { GameDefinition } from "./types.js";
import { tabu } from "./tabu/tabu.js";
import { vampir } from "./vampir/vampir.js";
import { okey, okey101 } from "./okey/okey.js";
import { chess } from "./chess/chess.js";
import { pisti } from "./pisti/pisti.js";

export const gameDefinitions: Record<GameId, GameDefinition> = { tabu, vampir, okey, okey101, chess, pisti };
