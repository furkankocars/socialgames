import {
  colorOf,
  inCheck,
  legalMoves,
  makeMove,
  positionKey,
  typeOf,
  type ChessMove,
  type ChessPosition,
  type PieceType,
} from "../../../../shared/games/chess.js";

// A small alpha-beta search over material and piece-square tables. Strong
// enough to punish blunders at "zor", loose enough at "kolay" to be beaten.

const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Tables from white's side, a8 first, so they read like a board diagram.
const PST: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const MATE = 100000;

/** Score from the side to move's point of view. */
function evaluate(pos: ChessPosition): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    const t = typeOf(p);
    const white = colorOf(p) === "w";
    // Tables are written a8-first from white's side; mirror for black.
    const idx = white ? (7 - (sq >> 3)) * 8 + (sq & 7) : sq;
    const v = VALUE[t] + PST[t][idx];
    score += white ? v : -v;
  }
  return pos.turn === "w" ? score : -score;
}

/** Captures first, biggest victim with the smallest attacker. */
function ordered(pos: ChessPosition, moves: ChessMove[]): ChessMove[] {
  const gain = (m: ChessMove) => {
    const victim = pos.board[m.to];
    return (victim ? 10 * VALUE[typeOf(victim)] - VALUE[typeOf(pos.board[m.from])] : 0) + (m.promotion === "q" ? 800 : 0);
  };
  return moves.map((m) => [gain(m), m] as const).sort((a, b) => b[0] - a[0]).map(([, m]) => m);
}

interface Search {
  nodes: number;
  deadline: number;
  /** Set once time runs out; the unfinished depth is thrown away. */
  out: boolean;
}

function timeUp(s: Search): boolean {
  if (!s.out && ++s.nodes % 128 === 0 && Date.now() > s.deadline) s.out = true;
  return s.out;
}

/** Follows captures past the horizon so the bot doesn't stop mid-exchange. */
function quiesce(pos: ChessPosition, alpha: number, beta: number, s: Search, depth: number): number {
  const stand = evaluate(pos);
  if (stand >= beta || depth === 0 || timeUp(s)) return stand;
  if (stand > alpha) alpha = stand;
  const captures = legalMoves(pos).filter((m) => pos.board[m.to] || m.promotion);
  for (const m of ordered(pos, captures)) {
    const score = -quiesce(makeMove(pos, m), -beta, -alpha, s, depth - 1);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(pos: ChessPosition, depth: number, alpha: number, beta: number, s: Search, ply: number): number {
  if (timeUp(s)) return 0;
  const moves = legalMoves(pos);
  if (moves.length === 0) return inCheck(pos) ? -MATE + ply : 0;
  if (pos.halfmove >= 100) return 0;
  if (depth === 0) return quiesce(pos, alpha, beta, s, 4);
  let best = -Infinity;
  for (const m of ordered(pos, moves)) {
    const score = -negamax(makeMove(pos, m), depth - 1, -beta, -alpha, s, ply + 1);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export type BotLevel = 1 | 2 | 3;

const LEVELS: Record<BotLevel, { depth: number; ms: number; noise: number }> = {
  // Easy bots see a blurred evaluation; harder ones only break ties at random.
  1: { depth: 1, ms: 150, noise: 140 },
  2: { depth: 2, ms: 250, noise: 25 },
  3: { depth: 4, ms: 450, noise: 6 },
};

/**
 * Picks a move for the side to move, searching one ply deeper at a time until
 * the level's depth or time runs out, so the server never stalls for long.
 */
export function chessBotMove(
  pos: ChessPosition,
  level: BotLevel,
  random: () => number,
  /** Keys of recent positions to avoid repeating. */
  avoid: Set<string> = new Set(),
): ChessMove {
  const { depth: maxDepth, ms, noise } = LEVELS[level];
  const s: Search = { nodes: 0, deadline: Date.now() + ms, out: false };
  const legal = legalMoves(pos);
  const repeats = new Set(legal.filter((m) => avoid.has(positionKey(makeMove(pos, m)))));
  let moves = ordered(pos, legal);
  let chosen = moves[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    let best = -Infinity;
    const scored: { m: ChessMove; score: number }[] = [];
    for (const m of moves) {
      // Moves more than the noise below the best so far can't win, so a bound is enough for them.
      let score = -negamax(makeMove(pos, m), depth - 1, -Infinity, -(best - noise - 60), s, 1);
      if (s.out) break;
      // Steer away from repeating a position when not losing, so games move on.
      if (score > -50 && repeats.has(m)) score -= 60;
      best = Math.max(best, score);
      scored.push({ m, score: score + (random() - 0.5) * noise });
    }
    if (s.out && depth > 1) break;
    scored.sort((a, b) => b.score - a.score);
    chosen = scored[0]?.m ?? chosen;
    // Search the best moves first next time round.
    moves = [...scored.map((x) => x.m), ...moves.filter((m) => !scored.some((x) => x.m === m))];
    if (s.out || Math.abs(best) > MATE / 2) break;
  }
  return chosen;
}
