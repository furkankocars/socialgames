import "./chess.css";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RoomView } from "../../../shared/protocol";
import {
  colorOf,
  legalMoves,
  PIECE_NAMES,
  squareName,
  typeOf,
  type ChessAction,
  type ChessEnd,
  type ChessPlayerView,
  type ChessView,
  type Color,
  type Promotion,
} from "../../../shared/games/chess";
import { request } from "../socket";
import { useAct } from "../toast";
import { Avatar } from "../Avatar";
import { nameOf } from "../hooks";
import { pointerDrag } from "../drag";
import { chime, clack, success, tick } from "../sound";
import { ChessPiece } from "./ChessPiece";
import { TableChat, TreatIcon, TreatTray, useSeatTreats } from "./TableChat";

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

const END_TEXT: Record<ChessEnd, string> = {
  checkmate: "Şah mat",
  stalemate: "Pat: sırası gelen oynayacak hamle bulamadı",
  insufficient: "Mat edecek taş kalmadı",
  fifty: "50 hamledir taş alınmadı, piyon oynanmadı",
  repetition: "Aynı konum üç kez tekrarlandı",
  resign: "Pes etti",
  timeout: "Süresi bitti",
  agreement: "Anlaşmalı beraberlik",
};

function formatClock(ms: number): string {
  if (ms < 10000) return (Math.max(0, ms) / 1000).toFixed(1);
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Pieces each side has lost, worked out from what is left on the board. */
function capturedBy(board: string[]): Record<Color, string[]> {
  const left: Record<string, number> = {};
  for (const p of board) if (p) left[p] = (left[p] ?? 0) + 1;
  const lost = (color: Color) =>
    Object.entries(START_COUNT).flatMap(([t, n]) => {
      const letter = color === "w" ? t.toUpperCase() : t;
      return Array<string>(Math.max(0, n - (left[letter] ?? 0))).fill(letter);
    });
  // White captured black's pieces and the other way round.
  return { w: lost("b"), b: lost("w") };
}

export function ChessScreen({ room }: { room: RoomView }) {
  const g = room.game as ChessView;
  const act = useAct();
  const send = (action: ChessAction) => act(request("game:action", action));
  const me = g.myColor;
  const flipped = me === "b";
  const myTurn = !g.result && me === g.position.turn;
  const [selected, setSelected] = useState<number | null>(null);
  const [promoting, setPromoting] = useState<{ from: number; to: number } | null>(null);
  /** The press that picked a piece up, so the click that follows doesn't put it back down. */
  const pickedUp = useRef(false);
  const treatFor = useSeatTreats(room);

  const moves = useMemo(() => (myTurn ? legalMoves(g.position) : []), [g.position, myTurn]);
  const targets = useMemo(() => new Set(moves.filter((m) => m.from === selected).map((m) => m.to)), [moves, selected]);
  const movable = useMemo(() => new Set(moves.map((m) => m.from)), [moves]);
  const last = g.moves.at(-1) ?? null;
  const kingInCheck = g.check ? g.position.board.indexOf(g.position.turn === "w" ? "K" : "k") : -1;

  // A new position clears any half-made move.
  useEffect(() => {
    setSelected(null);
    setPromoting(null);
  }, [g.position]);

  // Clocks count down here between server updates; the server stays the judge.
  const receivedAt = useMemo(() => Date.now(), [g]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!g.running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [g.running]);
  const clockOf = (p: ChessPlayerView) => (p.msLeft === null ? null : p.msLeft - (g.running === p.color ? Math.max(0, now - receivedAt) : 0));
  const mine = g.players.find((p) => p.color === me);
  const myClock = mine ? clockOf(mine) : null;

  const moveCount = g.moves.length;
  const lastCount = useRef(moveCount);
  useEffect(() => {
    if (moveCount > lastCount.current) clack(last?.captured ? 1.2 : 0.8);
    lastCount.current = moveCount;
  }, [moveCount, last]);
  useEffect(() => {
    if (myTurn && moveCount > 0) chime();
  }, [myTurn, moveCount]);
  useEffect(() => {
    if (g.result) success();
  }, [g.result]);
  const lowSecond = myClock !== null && g.running === me && myClock < 10000 ? Math.ceil(myClock / 1000) : null;
  useEffect(() => {
    if (lowSecond !== null) tick();
  }, [lowSecond]);

  const tryMove = (from: number, to: number) => {
    const options = moves.filter((m) => m.from === from && m.to === to);
    if (options.length === 0) {
      setSelected(movable.has(to) ? to : null);
      return;
    }
    if (options[0].promotion) {
      setPromoting({ from, to });
      return;
    }
    setSelected(null);
    void send({ type: "move", from, to });
  };

  const promote = (piece: Promotion) => {
    if (!promoting) return;
    void send({ type: "move", ...promoting, promotion: piece });
    setPromoting(null);
    setSelected(null);
  };

  const clickSquare = (sq: number) => {
    if (!myTurn || promoting) return;
    if (pickedUp.current) {
      pickedUp.current = false;
      return;
    }
    if (selected !== null && selected !== sq) tryMove(selected, sq);
    else setSelected(selected === sq || !movable.has(sq) ? null : sq);
  };

  /** Press a piece to pick it up; drag it onto a square to move it there. */
  const dragPiece = (sq: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!myTurn || !movable.has(sq) || promoting || e.button !== 0) return;
    pickedUp.current = selected !== sq;
    setSelected(sq);
    pointerDrag(
      e,
      "[data-sq]",
      (target) => tryMove(sq, Number(target.dataset.sq)),
      e.currentTarget.querySelector<HTMLElement>(".piece") ?? e.currentTarget,
    );
  };

  const order = Array.from({ length: 64 }, (_, i) => {
    const row = Math.floor(i / 8);
    const col = i % 8;
    return flipped ? row * 8 + (7 - col) : (7 - row) * 8 + col;
  });

  const captured = capturedBy(g.position.board);
  const material = (c: Color) => captured[c].reduce((n, p) => n + VALUE[typeOf(p)], 0);
  const top = g.players.find((p) => p.color === (flipped ? "w" : "b"))!;
  const bottom = g.players.find((p) => p.color === (flipped ? "b" : "w"))!;

  const plate = (p: ChessPlayerView, where: "top" | "bottom") => {
    const player = room.players.find((x) => x.id === p.id);
    const name = player?.name ?? "Ayrılan oyuncu";
    const ms = clockOf(p);
    const turn = !g.result && g.position.turn === p.color;
    const lead = material(p.color) - material(p.color === "w" ? "b" : "w");
    const treat = treatFor(p.id);
    return (
      <div className={`chess-plate ${where} ${turn ? "turn" : ""}`} data-treat={p.id}>
        <span className="plate-avatar">
          <Avatar id={p.id} name={name} size={38} />
          {treat && (
            <span key={treat} className="seat-treat">
              <TreatIcon treat={treat} size={24} />
            </span>
          )}
        </span>
        <span className="plate-who">
          <span className="plate-name">
            {name}
            {p.id === room.you && <span className="muted"> (sen)</span>}
            {player?.bot && <span className="plate-tag">bot</span>}
          </span>
          <span className="plate-captured" aria-label="Aldığı taşlar">
            {captured[p.color].map((c, i) => (
              <ChessPiece key={i} piece={c} className="mini" />
            ))}
            {lead > 0 && <span className="plate-lead">+{lead}</span>}
          </span>
        </span>
        <span className="plate-score" title="Bu odadaki galibiyetler">
          {p.score}
        </span>
        {ms !== null && (
          <span className={`plate-clock ${g.running === p.color ? "running" : ""} ${ms < 20000 ? "low" : ""}`} role="timer">
            {formatClock(ms)}
          </span>
        )}
      </div>
    );
  };

  const opponentOffered = g.drawOffer !== null && g.drawOffer !== me && me !== null;
  const status = g.result
    ? g.result.winner
      ? `${nameOf(room, g.players.find((p) => p.color === g.result!.winner)!.id)} kazandı`
      : "Berabere"
    : myTurn
      ? g.check
        ? "Şah! Sıra sende, şahını kurtar."
        : "Sıra sende."
      : `${nameOf(room, g.players.find((p) => p.color === g.position.turn)!.id)} düşünüyor…`;

  const pairs: { n: number; w?: string; b?: string }[] = [];
  g.moves.forEach((m, i) => {
    if (i % 2 === 0) pairs.push({ n: i / 2 + 1, w: m.san });
    else pairs[pairs.length - 1].b = m.san;
  });
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [moveCount]);

  return (
    <div className="chess" data-drag-layer>
      <div className="chess-hud">
        <span className="hud-item">
          <span className="chess-label">Oyun</span>
          <strong>{g.game}</strong>
          <span className="chess-label">· {g.minutes ? `${g.minutes} dk${g.increment ? ` + ${g.increment} sn` : ""}` : "Süresiz"}</span>
        </span>
        <TreatTray />
      </div>

      <div className="chess-layout">
        <div className="chess-main">
          {plate(top, "top")}
          <div className="chess-table" data-treat="table">
            <div className={`chess-board ${myTurn ? "live" : ""}`} role="grid" aria-label="Satranç tahtası">
              {order.map((sq, i) => {
                const piece = g.position.board[sq];
                const light = (Math.floor(sq / 8) + (sq % 8)) % 2 === 1;
                const classes = [
                  "sq",
                  light ? "light" : "dark",
                  selected === sq ? "selected" : "",
                  last && (last.from === sq || last.to === sq) ? "last" : "",
                  sq === kingInCheck ? "check" : "",
                  targets.has(sq) ? (piece || (typeOf(g.position.board[selected!] ?? "") === "p" && sq === g.position.ep) ? "capture" : "target") : "",
                  movable.has(sq) ? "movable" : "",
                ].filter(Boolean);
                return (
                  <div
                    key={sq}
                    className={classes.join(" ")}
                    data-sq={sq}
                    onClick={() => clickSquare(sq)}
                    onPointerDown={piece ? dragPiece(sq) : undefined}
                    aria-label={`${squareName(sq)}${piece ? ` ${colorOf(piece) === "w" ? "beyaz" : "siyah"} ${PIECE_NAMES[typeOf(piece)].toLocaleLowerCase("tr")}` : ""}`}
                  >
                    {i % 8 === 0 && <span className="coord rank">{Math.floor(sq / 8) + 1}</span>}
                    {i >= 56 && <span className="coord file">{"abcdefgh"[sq % 8]}</span>}
                    {piece && <ChessPiece piece={piece} />}
                  </div>
                );
              })}

              {promoting && (
                <div className="promotion" role="group" aria-label="Piyon neye dönüşsün?">
                  <span className="chess-label">Piyon neye dönüşsün?</span>
                  <div className="promotion-choices">
                    {(["q", "r", "b", "n"] as const).map((t) => (
                      <button key={t} onClick={() => promote(t)} aria-label={{ q: "Vezir", r: "Kale", b: "Fil", n: "At" }[t]}>
                        <ChessPiece piece={me === "w" ? t.toUpperCase() : t} />
                      </button>
                    ))}
                  </div>
                  <button className="ghost small" onClick={() => setPromoting(null)}>
                    Vazgeç
                  </button>
                </div>
              )}

              {g.result && (
                <div className="chess-over">
                  <div className="over-sheet">
                    <h3>{status}</h3>
                    <p>{END_TEXT[g.result.reason]}.</p>
                    {room.hostId === room.you || room.players.find((p) => p.id === room.hostId)?.bot ? (
                      <button className="primary chunky" onClick={() => send({ type: "rematch" })}>
                        Rövanş, renkler değişsin
                      </button>
                    ) : (
                      <p className="muted small">Oda sahibinin rövanşı başlatması bekleniyor…</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {plate(bottom, "bottom")}
        </div>

        <aside className="chess-side">
          <div className={`chess-status ${myTurn ? "mine" : ""} ${g.check && !g.result ? "check" : ""}`} role="status">
            {status}
          </div>

          {opponentOffered && !g.result && (
            <div className="draw-offer">
              <span>Rakip beraberlik teklif ediyor.</span>
              <span className="draw-buttons">
                <button className="success small" onClick={() => send({ type: "answerDraw", accept: true })}>
                  Kabul et
                </button>
                <button className="ghost small" onClick={() => send({ type: "answerDraw", accept: false })}>
                  Reddet
                </button>
              </span>
            </div>
          )}

          <div className="move-sheet">
            <h4>Hamleler</h4>
            <ol className="move-list" ref={list}>
              {pairs.length === 0 && <li className="muted small empty">Henüz hamle yok. İlk hamle beyazın.</li>}
              {pairs.map((p) => (
                <li key={p.n}>
                  <span className="move-n">{p.n}.</span>
                  <span className={`move-san ${p.n * 2 - 1 === moveCount ? "latest" : ""}`}>{p.w}</span>
                  <span className={`move-san ${p.n * 2 === moveCount ? "latest" : ""}`}>{p.b ?? ""}</span>
                </li>
              ))}
            </ol>
          </div>

          {me && !g.result && (
            <div className="chess-actions">
              <button
                className="ghost"
                disabled={g.drawOffer === me || moveCount < 2}
                onClick={() => send({ type: "offerDraw" })}
                title={moveCount < 2 ? "Önce birkaç hamle oynanmalı" : undefined}
              >
                {g.drawOffer === me ? "Teklif gönderildi" : "Beraberlik teklif et"}
              </button>
              <button className="danger" onClick={() => confirm("Pes etmek istediğine emin misin?") && send({ type: "resign" })}>
                Pes et
              </button>
            </div>
          )}
          <p className="muted small hint">Taşı tutup gideceği kareye sürükle ya da önce taşa, sonra kareye dokun.</p>
        </aside>
      </div>

      <TableChat room={room} />
    </div>
  );
}
