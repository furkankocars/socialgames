// Chess rules shared by the server (which decides) and the client (which
// highlights legal moves). Squares are numbered 0-63: a1 = 0, h1 = 7, a8 = 56.
// A square holds a FEN letter, uppercase for white, or "" when empty.

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Promotion = "q" | "r" | "b" | "n";

export interface ChessPosition {
  board: string[];
  turn: Color;
  /** Castling still allowed, as a subset of "KQkq". */
  castling: string;
  /** The square a pawn may capture onto en passant, if the last move was a double step. */
  ep: number | null;
  /** Half-moves since the last capture or pawn move, for the fifty-move rule. */
  halfmove: number;
  fullmove: number;
}

export interface ChessMove {
  from: number;
  to: number;
  promotion?: Promotion;
}

export type ChessEnd = "checkmate" | "stalemate" | "insufficient" | "fifty" | "repetition" | "resign" | "timeout" | "agreement";

export interface ChessPlayerView {
  id: string;
  color: Color;
  /** Clock time left in ms when this view was sent; null in untimed games. */
  msLeft: number | null;
  /** Games won in this room, a draw counting a half. */
  score: number;
}

export interface ChessMoveRecord {
  from: number;
  to: number;
  san: string;
  /** The piece letter captured on this move, if any. */
  captured: string | null;
}

export interface ChessView {
  position: ChessPosition;
  players: ChessPlayerView[];
  /** Your colour, or null if you are only watching. */
  myColor: Color | null;
  moves: ChessMoveRecord[];
  /** Whose clock runs: the side to move, or null before the first move and after the end. */
  running: Color | null;
  check: boolean;
  /** The side that offered a draw and is waiting for an answer. */
  drawOffer: Color | null;
  result: { winner: Color | null; reason: ChessEnd } | null;
  game: number;
  /** Starting clock in minutes and increment in seconds; 0 minutes means untimed. */
  minutes: number;
  increment: number;
}

export type ChessAction =
  | { type: "move"; from: number; to: number; promotion?: Promotion }
  | { type: "resign" }
  | { type: "offerDraw" }
  | { type: "answerDraw"; accept: boolean }
  | { type: "rematch" };

export const PIECE_NAMES: Record<PieceType, string> = { p: "Piyon", n: "At", b: "Fil", r: "Kale", q: "Vezir", k: "Şah" };

export const colorOf = (piece: string): Color => (piece === piece.toUpperCase() ? "w" : "b");
export const typeOf = (piece: string) => piece.toLowerCase() as PieceType;
export const fileOf = (sq: number) => sq & 7;
export const rankOf = (sq: number) => sq >> 3;
export const other = (c: Color): Color => (c === "w" ? "b" : "w");

export function squareName(sq: number): string {
  return "abcdefgh"[fileOf(sq)] + (rankOf(sq) + 1);
}

export function initialPosition(): ChessPosition {
  const board = Array<string>(64).fill("");
  const back = "rnbqkbnr";
  for (let f = 0; f < 8; f++) {
    board[f] = back[f].toUpperCase();
    board[8 + f] = "P";
    board[48 + f] = "p";
    board[56 + f] = back[f];
  }
  return { board, turn: "w", castling: "KQkq", ep: null, halfmove: 0, fullmove: 1 };
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function step(sq: number, df: number, dr: number): number {
  const f = fileOf(sq) + df;
  const r = rankOf(sq) + dr;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
}

/** Whether a piece of colour `by` attacks the square. */
export function isAttacked(board: string[], sq: number, by: Color): boolean {
  const own = (p: string, t: PieceType) => p !== "" && colorOf(p) === by && typeOf(p) === t;
  const pawnDir = by === "w" ? -1 : 1;
  for (const df of [-1, 1]) {
    const s = step(sq, df, pawnDir);
    if (s >= 0 && own(board[s], "p")) return true;
  }
  for (const [df, dr] of KNIGHT) {
    const s = step(sq, df, dr);
    if (s >= 0 && own(board[s], "n")) return true;
  }
  for (const [df, dr] of KING) {
    const s = step(sq, df, dr);
    if (s >= 0 && own(board[s], "k")) return true;
  }
  for (const [dirs, slider] of [[ROOK_DIRS, "r"], [BISHOP_DIRS, "b"]] as const) {
    for (const [df, dr] of dirs) {
      let s = step(sq, df, dr);
      while (s >= 0) {
        const p = board[s];
        if (p) {
          if (colorOf(p) === by && (typeOf(p) === slider || typeOf(p) === "q")) return true;
          break;
        }
        s = step(s, df, dr);
      }
    }
  }
  return false;
}

export function kingSquare(board: string[], color: Color): number {
  return board.indexOf(color === "w" ? "K" : "k");
}

export function inCheck(pos: ChessPosition, color = pos.turn): boolean {
  const k = kingSquare(pos.board, color);
  return k >= 0 && isAttacked(pos.board, k, other(color));
}

/** Moves that follow how pieces move, before checking the own king is safe. */
function pseudoMoves(pos: ChessPosition): ChessMove[] {
  const { board, turn } = pos;
  const moves: ChessMove[] = [];
  const enemy = (s: number) => board[s] !== "" && colorOf(board[s]) !== turn;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || colorOf(p) !== turn) continue;
    const t = typeOf(p);
    if (t === "p") {
      const dir = turn === "w" ? 1 : -1;
      const startRank = turn === "w" ? 1 : 6;
      const lastRank = turn === "w" ? 7 : 0;
      const push = (to: number) => {
        if (rankOf(to) === lastRank) for (const promotion of ["q", "r", "b", "n"] as const) moves.push({ from: sq, to, promotion });
        else moves.push({ from: sq, to });
      };
      const one = step(sq, 0, dir);
      if (one >= 0 && !board[one]) {
        push(one);
        const two = step(sq, 0, 2 * dir);
        if (rankOf(sq) === startRank && !board[two]) moves.push({ from: sq, to: two });
      }
      for (const df of [-1, 1]) {
        const s = step(sq, df, dir);
        if (s < 0) continue;
        if (enemy(s)) push(s);
        else if (s === pos.ep) moves.push({ from: sq, to: s });
      }
    } else if (t === "n" || t === "k") {
      for (const [df, dr] of t === "n" ? KNIGHT : KING) {
        const s = step(sq, df, dr);
        if (s >= 0 && (!board[s] || enemy(s))) moves.push({ from: sq, to: s });
      }
    } else {
      const dirs = t === "r" ? ROOK_DIRS : t === "b" ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [df, dr] of dirs) {
        let s = step(sq, df, dr);
        while (s >= 0) {
          if (board[s]) {
            if (enemy(s)) moves.push({ from: sq, to: s });
            break;
          }
          moves.push({ from: sq, to: s });
          s = step(s, df, dr);
        }
      }
    }
  }
  // Castling: king and rook unmoved, squares between empty, king not passing through check.
  const home = turn === "w" ? 0 : 56;
  const them = other(turn);
  const rights = turn === "w" ? ["K", "Q"] : ["k", "q"];
  if (board[home + 4] === (turn === "w" ? "K" : "k") && !isAttacked(board, home + 4, them)) {
    if (pos.castling.includes(rights[0]) && !board[home + 5] && !board[home + 6]
      && !isAttacked(board, home + 5, them) && !isAttacked(board, home + 6, them)) {
      moves.push({ from: home + 4, to: home + 6 });
    }
    if (pos.castling.includes(rights[1]) && !board[home + 3] && !board[home + 2] && !board[home + 1]
      && !isAttacked(board, home + 3, them) && !isAttacked(board, home + 2, them)) {
      moves.push({ from: home + 4, to: home + 2 });
    }
  }
  return moves;
}

/** Plays a move without checking it; use legalMoves to know which moves are allowed. */
export function makeMove(pos: ChessPosition, move: ChessMove): ChessPosition {
  const board = pos.board.slice();
  const piece = board[move.from];
  const t = typeOf(piece);
  const captured = board[move.to];
  board[move.to] = move.promotion ? (pos.turn === "w" ? move.promotion.toUpperCase() : move.promotion) : piece;
  board[move.from] = "";
  let ep: number | null = null;
  if (t === "p") {
    if (move.to === pos.ep) board[move.to + (pos.turn === "w" ? -8 : 8)] = "";
    if (Math.abs(move.to - move.from) === 16) ep = (move.from + move.to) / 2;
  }
  if (t === "k" && Math.abs(move.to - move.from) === 2) {
    const kingside = move.to > move.from;
    const rookFrom = kingside ? move.from + 3 : move.from - 4;
    const rookTo = kingside ? move.from + 1 : move.from - 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = "";
  }
  let castling = pos.castling;
  // Moving the king or a rook, or losing a rook at home, ends those castling rights.
  const lose = (sq: number) => {
    if (sq === 4) castling = castling.replace(/[KQ]/g, "");
    if (sq === 60) castling = castling.replace(/[kq]/g, "");
    if (sq === 0) castling = castling.replace("Q", "");
    if (sq === 7) castling = castling.replace("K", "");
    if (sq === 56) castling = castling.replace("q", "");
    if (sq === 63) castling = castling.replace("k", "");
  };
  lose(move.from);
  lose(move.to);
  return {
    board,
    turn: other(pos.turn),
    castling,
    ep,
    halfmove: t === "p" || captured ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === "b" ? pos.fullmove + 1 : pos.fullmove,
  };
}

export function legalMoves(pos: ChessPosition): ChessMove[] {
  // Tries each move on the board in place and puts it back: much cheaper than a
  // copy per move, which matters for the bot's search.
  const { board, turn } = pos;
  const them = other(turn);
  const king = turn === "w" ? "K" : "k";
  const kingAt = board.indexOf(king);
  return pseudoMoves(pos).filter((m) => {
    const moving = board[m.from];
    const taken = board[m.to];
    const epAt = moving.toLowerCase() === "p" && m.to === pos.ep ? m.to + (turn === "w" ? -8 : 8) : -1;
    const epTaken = epAt >= 0 ? board[epAt] : "";
    board[m.to] = moving;
    board[m.from] = "";
    if (epAt >= 0) board[epAt] = "";
    const safe = !isAttacked(board, moving === king ? m.to : kingAt, them);
    board[m.from] = moving;
    board[m.to] = taken;
    if (epAt >= 0) board[epAt] = epTaken;
    return safe;
  });
}

export function findMove(pos: ChessPosition, from: number, to: number, promotion?: Promotion): ChessMove | null {
  return legalMoves(pos).find((m) => m.from === from && m.to === to && (m.promotion ?? null) === (promotion ?? (m.promotion ? "q" : null))) ?? null;
}

/** Neither side can ever mate: bare kings, a lone minor piece, or bishops all on one colour. */
export function insufficientMaterial(board: string[]): boolean {
  const minors: { type: PieceType; shade: number }[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p) continue;
    const t = typeOf(p);
    if (t === "k") continue;
    if (t !== "b" && t !== "n") return false;
    minors.push({ type: t, shade: (fileOf(sq) + rankOf(sq)) % 2 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.type === "b" && m.shade === minors[0].shade);
}

/** Identifies a position for the repetition rule. En passant counts only when it is playable. */
export function positionKey(pos: ChessPosition): string {
  const ep = pos.ep !== null && legalMoves(pos).some((m) => m.to === pos.ep && typeOf(pos.board[m.from]) === "p") ? pos.ep : "-";
  return `${pos.board.map((p) => p || ".").join("")} ${pos.turn} ${pos.castling} ${ep}`;
}

/** How the game ends in this position, if it does (repetition needs the history, so is left to the caller). */
export function positionEnd(pos: ChessPosition): ChessEnd | null {
  if (legalMoves(pos).length === 0) return inCheck(pos) ? "checkmate" : "stalemate";
  if (insufficientMaterial(pos.board)) return "insufficient";
  if (pos.halfmove >= 100) return "fifty";
  return null;
}

/** Standard algebraic notation, e.g. Nf3, exd5, O-O, e8=Q#. */
export function toSan(pos: ChessPosition, move: ChessMove): string {
  const piece = pos.board[move.from];
  const t = typeOf(piece);
  let san: string;
  if (t === "k" && Math.abs(move.to - move.from) === 2) {
    san = move.to > move.from ? "O-O" : "O-O-O";
  } else {
    const capture = pos.board[move.to] !== "" || (t === "p" && move.to === pos.ep);
    if (t === "p") {
      san = (capture ? "abcdefgh"[fileOf(move.from)] + "x" : "") + squareName(move.to);
      if (move.promotion) san += "=" + move.promotion.toUpperCase();
    } else {
      const rivals = legalMoves(pos).filter((m) => m.to === move.to && m.from !== move.from && pos.board[m.from] === piece);
      let from = "";
      if (rivals.length) {
        if (!rivals.some((m) => fileOf(m.from) === fileOf(move.from))) from = "abcdefgh"[fileOf(move.from)];
        else if (!rivals.some((m) => rankOf(m.from) === rankOf(move.from))) from = String(rankOf(move.from) + 1);
        else from = squareName(move.from);
      }
      san = t.toUpperCase() + from + (capture ? "x" : "") + squareName(move.to);
    }
  }
  const next = makeMove(pos, move);
  if (inCheck(next)) san += legalMoves(next).length === 0 ? "#" : "+";
  return san;
}
