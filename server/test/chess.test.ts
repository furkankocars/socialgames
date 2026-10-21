import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "../../shared/protocol.js";
import { BOT_DELAY_MS, RoomManager } from "../src/rooms.js";
import {
  initialPosition,
  legalMoves,
  makeMove,
  positionEnd,
  toSan,
  type ChessPosition,
  type ChessView,
} from "../../shared/games/chess.js";
import { ChessGame } from "../src/games/chess/chess.js";
import { chessBotMove } from "../src/games/chess/bot.js";
import { fakeContext, seeded } from "./helpers.js";

function fromFen(fen: string): ChessPosition {
  const [rows, turn, castling, ep, half = "0", full = "1"] = fen.split(" ");
  const board = Array<string>(64).fill("");
  rows.split("/").forEach((row, i) => {
    let f = 0;
    for (const c of row) {
      if (/\d/.test(c)) f += Number(c);
      else board[(7 - i) * 8 + f++] = c;
    }
  });
  const sq = (s: string) => (s.charCodeAt(0) - 97) + (Number(s[1]) - 1) * 8;
  return { board, turn: turn as "w" | "b", castling: castling === "-" ? "" : castling, ep: ep === "-" ? null : sq(ep), halfmove: +half, fullmove: +full };
}

const sq = (s: string) => (s.charCodeAt(0) - 97) + (Number(s[1]) - 1) * 8;

function perft(pos: ChessPosition, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + perft(makeMove(pos, m), depth - 1), 0);
}

/** Plays moves given as "e2e4" or "e7e8q" for whoever is to move. */
function play(game: ChessGame, ...moves: string[]) {
  for (const m of moves) {
    const view = game.getView("p0") as ChessView;
    const id = view.players.find((p) => p.color === view.position.turn)!.id;
    game.handleAction(id, { type: "move", from: sq(m.slice(0, 2)), to: sq(m.slice(2, 4)), ...(m[4] ? { promotion: m[4] } : {}) });
  }
}

function newGame(options: Record<string, unknown> = {}, seed = 1) {
  const fake = fakeContext(2, seed);
  return { ...fake, game: new ChessGame(fake.ctx, options) };
}

describe("Chess rules", () => {
  // Node counts from the standard perft suite; they catch any move generation slip.
  it("generates every legal move from the start", () => {
    expect(perft(initialPosition(), 3)).toBe(8902);
  });

  it("handles castling, en passant and promotion in a busy position", () => {
    const kiwipete = fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    expect(perft(kiwipete, 1)).toBe(48);
    expect(perft(kiwipete, 2)).toBe(2039);
    expect(perft(kiwipete, 3)).toBe(97862);
  });

  it("gets pins and en passant discovered checks right", () => {
    expect(perft(fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"), 4)).toBe(43238);
    expect(perft(fromFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1"), 3)).toBe(9467);
  });

  it("writes moves in algebraic notation", () => {
    const pos = initialPosition();
    expect(toSan(pos, { from: sq("g1"), to: sq("f3") })).toBe("Nf3");
    const castle = fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(toSan(castle, { from: sq("e1"), to: sq("g1") })).toBe("O-O");
    expect(toSan(castle, { from: sq("e1"), to: sq("c1") })).toBe("O-O-O");
    const rooks = fromFen("4k3/8/8/8/8/8/4K3/R6R w - - 0 1");
    expect(toSan(rooks, { from: sq("a1"), to: sq("d1") })).toBe("Rad1");
    const promote = fromFen("k7/4P3/8/8/8/8/8/4K3 w - - 0 1");
    expect(toSan(promote, { from: sq("e7"), to: sq("e8"), promotion: "q" })).toBe("e8=Q+");
  });

  it("spots stalemate and dead positions", () => {
    expect(positionEnd(fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toBe("stalemate");
    expect(positionEnd(fromFen("8/8/4k3/8/8/2B5/4K3/8 b - - 0 1"))).toBe("insufficient");
    expect(positionEnd(fromFen("8/8/4k3/8/8/2B5/4K3/7r b - - 99 80"))).toBeNull();
    expect(positionEnd(fromFen("8/8/4k3/8/8/2B5/4K3/7r b - - 100 80"))).toBe("fifty");
  });
});

describe("Chess game", () => {
  it("ends in checkmate and scores the winner", () => {
    const { game } = newGame();
    play(game, "f2f3", "e7e5", "g2g4", "d8h4");
    const view = game.getView("p0") as ChessView;
    expect(view.result).toEqual({ winner: "b", reason: "checkmate" });
    expect(view.check).toBe(true);
    expect(view.moves.at(-1)!.san).toBe("Qh4#");
    const black = view.players.find((p) => p.color === "b")!;
    expect(black.score).toBe(1);
    expect(() => play(game, "a2a3")).toThrow();
  });

  it("refuses moves out of turn and illegal moves", () => {
    const { game } = newGame();
    const view = game.getView("p0") as ChessView;
    const black = view.players.find((p) => p.color === "b")!.id;
    expect(() => game.handleAction(black, { type: "move", from: sq("e7"), to: sq("e5") })).toThrow("Sıra");
    expect(() => play(game, "e2e5")).toThrow("kurallara");
  });

  it("captures en passant, castles and promotes", () => {
    const { game } = newGame();
    play(game, "e2e4", "a7a6", "e4e5", "d7d5", "e5d6");
    let view = game.getView("p0") as ChessView;
    expect(view.position.board[sq("d5")]).toBe("");
    expect(view.moves.at(-1)).toMatchObject({ san: "exd6", captured: "p" });

    play(game, "a6a5", "g1f3", "a5a4", "f1e2", "a4a3", "e1g1");
    view = game.getView("p0") as ChessView;
    expect(view.position.board[sq("g1")]).toBe("K");
    expect(view.position.board[sq("f1")]).toBe("R");

    play(game, "a3b2", "d6c7", "b2a1n", "c7d8r");
    view = game.getView("p0") as ChessView;
    expect(view.position.board[sq("a1")]).toBe("n");
    expect(view.position.board[sq("d8")]).toBe("R");
    expect(view.moves.at(-1)!.san).toBe("cxd8=R+");
  });

  it("calls threefold repetition a draw", () => {
    const { game } = newGame();
    play(game, "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8");
    expect((game.getView("p0") as ChessView).result).toEqual({ winner: null, reason: "repetition" });
  });

  it("handles resigning, draw offers and rematches with colours swapped", () => {
    const { game } = newGame();
    const first = game.getView("p0") as ChessView;
    const white = first.players.find((p) => p.color === "w")!.id;
    const black = first.players.find((p) => p.color === "b")!.id;
    expect(() => game.handleAction(white, { type: "offerDraw" })).toThrow();
    play(game, "e2e4", "e7e5");
    game.handleAction(white, { type: "offerDraw" });
    expect((game.getView("p0") as ChessView).drawOffer).toBe("w");
    game.handleAction(black, { type: "answerDraw", accept: false });
    expect((game.getView("p0") as ChessView).drawOffer).toBeNull();
    game.handleAction(black, { type: "offerDraw" });
    play(game, "d2d4");
    expect((game.getView("p0") as ChessView).drawOffer).toBeNull();
    game.handleAction(white, { type: "offerDraw" });
    game.handleAction(black, { type: "answerDraw", accept: true });
    expect((game.getView("p0") as ChessView).result).toEqual({ winner: null, reason: "agreement" });

    expect(() => game.handleAction("p1", { type: "rematch" })).toThrow("oda sahibi");
    game.handleAction("p0", { type: "rematch" });
    let view = game.getView("p0") as ChessView;
    expect(view.game).toBe(2);
    expect(view.players.find((p) => p.id === white)!.color).toBe("b");
    expect(view.players.every((p) => p.score === 0.5)).toBe(true);

    game.handleAction(white, { type: "resign" });
    view = game.getView("p0") as ChessView;
    expect(view.result).toEqual({ winner: "w", reason: "resign" });
    expect(view.players.find((p) => p.id === black)!.score).toBe(1.5);
  });

  it("runs the clock and flags a player who runs out", () => {
    const { game, runTimers } = newGame({ minutes: 1, increment: 2 });
    let view = game.getView("p0") as ChessView;
    expect(view.running).toBeNull();
    expect(view.players[0].msLeft).toBe(60000);
    play(game, "e2e4");
    view = game.getView("p0") as ChessView;
    expect(view.running).toBe("b");
    const black = view.players.find((p) => p.color === "b")!;
    // The timer fires early in tests; the game must not flag a player with time left.
    runTimers();
    expect((game.getView("p0") as ChessView).result).toBeNull();
    (game as unknown as { clock: Record<string, number> }).clock.b = 0;
    runTimers();
    view = game.getView("p0") as ChessView;
    expect(view.result).toEqual({ winner: "w", reason: "timeout" });
    expect(view.players.find((p) => p.id === black.id)!.msLeft).toBe(0);
  });
});

describe("Chess bot", () => {
  it("takes a free queen and finds mate in one", () => {
    const hanging = fromFen("4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1");
    expect(chessBotMove(hanging, 2, seeded(3))).toMatchObject({ from: sq("d1"), to: sq("d5") });
    const mate = fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    for (const level of [1, 2, 3] as const) expect(chessBotMove(mate, level, seeded(level))).toMatchObject({ from: sq("a1"), to: sq("a8") });
  });

  it("plays a whole game against itself with legal moves", () => {
    const { game, ctx } = newGame({ botLevel: 1 }, 4);
    const ids = ctx.players.map((p) => p.id);
    for (let i = 0; i < 300; i++) {
      const view = game.getView("p0") as ChessView;
      if (view.result) break;
      const id = view.players.find((p) => p.color === view.position.turn)!.id;
      expect(game.botAction(ids.find((p) => p !== id)!)).toBeNull();
      game.handleAction(id, game.botAction(id)!);
    }
    expect((game.getView("p0") as ChessView).moves.length).toBeGreaterThan(20);
  }, 60000);

  it("thinks for well under a second at the hardest level", () => {
    const middlegame = fromFen("r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R2QKB1R w KQ - 0 8");
    const start = performance.now();
    chessBotMove(middlegame, 3, seeded(2));
    expect(performance.now() - start).toBeLessThan(900);
  });

  it("declines draw offers and waits for its turn", () => {
    const { game, bots } = newGame({}, 1);
    const view = game.getView("p0") as ChessView;
    const white = view.players.find((p) => p.color === "w")!.id;
    const black = view.players.find((p) => p.color === "b")!.id;
    bots.add(black);
    expect(game.botAction(black)).toBeNull();
    play(game, "e2e4", "e7e5");
    game.handleAction(white, { type: "offerDraw" });
    expect(game.botAction(black)).toEqual({ type: "answerDraw", accept: false });
  });
});

describe("Chess in a room", () => {
  afterEach(() => vi.useRealTimers());

  it("lets one player take on a bot added by the host", () => {
    vi.useFakeTimers();
    const views = new Map<string, RoomView | null>();
    const rooms = new RoomManager((id, view) => views.set(id, view), seeded(9));
    rooms.createRoom("a", "Ali");
    rooms.selectGame("a", "chess");
    rooms.addBot("a");
    rooms.startGame("a", { botLevel: 1 });
    let game = views.get("a")!.game as ChessView;
    if (game.myColor === "w") rooms.gameAction("a", { type: "move", from: sq("e2"), to: sq("e4") });
    vi.advanceTimersByTime(BOT_DELAY_MS + 10);
    game = views.get("a")!.game as ChessView;
    expect(game.position.turn).toBe(game.myColor);
    expect(game.moves.length).toBeGreaterThan(0);
  });
});
