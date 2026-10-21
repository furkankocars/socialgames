import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import "./pisti.css";
import type { RoomView } from "../../../shared/protocol";
import { rankLabel, type Card, type PistiAction, type PistiMove, type PistiView, type Suit } from "../../../shared/games/pisti";
import { request } from "../socket";
import { useAct, useToast } from "../toast";
import { nameOf, useCountdown } from "../hooks";
import { Avatar } from "../Avatar";
import { chime, clack, success, tick } from "../sound";
import { pointerDrag } from "../drag";
import { TreatIcon, TreatTray, useSeatTreats } from "./TableChat";
import { GameLayout } from "../GameLayout";

const SUIT_NAMES: Record<Suit, string> = { spades: "maça", hearts: "kupa", diamonds: "karo", clubs: "sinek" };
const RED: Suit[] = ["hearts", "diamonds"];
/** How long a taken pile stays in view before it slides to the taker. */
const SWEEP_MS = 1300;

type Area = "me" | "top" | "left" | "right";

/** Drawn suit marks; text suit symbols turn into emoji on some phones. */
export function SuitMark({ suit, className = "" }: { suit: Suit; className?: string }) {
  return (
    <svg className={`suit ${className}`} viewBox="0 0 24 24" aria-hidden>
      {suit === "hearts" && <path d="M12 21s-7.6-4.7-9.7-9.4C.9 8.4 2.9 4.4 6.6 4.4c2.3 0 4 1.3 5.4 3.2 1.4-1.9 3.1-3.2 5.4-3.2 3.7 0 5.7 4 4.3 7.2C19.6 16.3 12 21 12 21Z" />}
      {suit === "diamonds" && <path d="M12 2 19.6 12 12 22 4.4 12Z" />}
      {suit === "spades" && (
        <path d="M12 2.2s-8.3 5.8-8.3 10.9c0 2.7 2 4.5 4.4 4.5 1.3 0 2.5-.6 3.2-1.4-.3 2.1-1.2 3.7-2.7 5.1h6.8c-1.5-1.4-2.4-3-2.7-5.1.7.8 1.9 1.4 3.2 1.4 2.4 0 4.4-1.8 4.4-4.5 0-5.1-8.3-10.9-8.3-10.9Z" />
      )}
      {suit === "clubs" && (
        <>
          <circle cx="12" cy="7" r="4.2" />
          <circle cx="6.8" cy="13.4" r="4.2" />
          <circle cx="17.2" cy="13.4" r="4.2" />
          <path d="M10.9 12.5h2.2c0 3.9.9 6.2 3 8.3H7.9c2.1-2.1 3-4.4 3-8.3Z" />
        </>
      )}
    </svg>
  );
}

export function PlayingCard({ card, size = "md", selected, fresh, style, onClick, onPointerDown }: {
  card: Card;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  fresh?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const label = rankLabel(card.rank);
  const cls = ["pcard", size, RED.includes(card.suit) ? "red" : "black", card.rank > 10 && "face", selected && "selected", onClick && "clickable", fresh && "fresh"];
  return (
    <div
      className={cls.filter(Boolean).join(" ")}
      style={style}
      onClick={onClick}
      onPointerDown={onPointerDown}
      role={onClick ? "button" : undefined}
      aria-label={`${SUIT_NAMES[card.suit]} ${label}`}
    >
      <span className="pcard-corner">
        <span>{label}</span>
        <SuitMark suit={card.suit} />
      </span>
      {card.rank > 10 ? (
        <span className="pcard-face">
          <span>{label}</span>
          <SuitMark suit={card.suit} />
        </span>
      ) : (
        <SuitMark suit={card.suit} className="pcard-pip" />
      )}
      <span className="pcard-corner end">
        <span>{label}</span>
        <SuitMark suit={card.suit} />
      </span>
    </div>
  );
}

export function CardBack({ size = "md", style }: { size?: "sm" | "md" | "lg"; style?: React.CSSProperties }) {
  return <div className={`pcard back ${size}`} style={style} aria-hidden />;
}

/** A small, fixed tilt per card, so the pile looks thrown rather than stacked. */
function tilt(id: number) {
  return ((id * 37) % 15) - 7;
}

export function PistiScreen({ room }: { room: RoomView }) {
  const g = room.game as PistiView;
  const act = useAct();
  const toast = useToast();
  const send = (action: PistiAction) => act(request("game:action", action));
  const n = g.seats.length;
  const mySeat = Math.max(0, g.mySeat);
  const playing = g.mySeat >= 0;
  const myTurn = playing && g.turn === g.mySeat && g.phase === "play";
  const [selected, setSelected] = useState<number | null>(null);
  const treatFor = useSeatTreats(room);

  const areaOf = (seat: number): Area => {
    const offset = (seat - mySeat + n) % n;
    if (offset === 0) return "me";
    if (n === 2) return "top";
    return (["me", "right", "top", "left"] as const)[offset];
  };

  // A taken pile stays up for a moment, then slides toward whoever took it.
  const [sweep, setSweep] = useState<PistiMove | null>(null);
  const lastMoveId = useRef(g.lastMove?.id ?? 0);
  useEffect(() => {
    const move = g.lastMove;
    if (!move || move.id === lastMoveId.current) return;
    lastMoveId.current = move.id;
    clack();
    if (move.pisti) success();
    if (!move.took) return;
    setSweep(move);
    const t = setTimeout(() => setSweep(null), SWEEP_MS);
    return () => clearTimeout(t);
  }, [g.lastMove]);
  // While a taken pile is shown, draw the cards that were on it plus the card that took them.
  const before = useRef({ pile: g.pile, hidden: g.pileHidden });
  if (g.pile.length > 0) before.current = { pile: g.pile, hidden: g.pileHidden };
  const sweeping = sweep !== null && g.pile.length === 0;
  const shownPile = sweeping ? [...before.current.pile, sweep.card] : g.pile;
  const shownHidden = sweeping ? before.current.hidden : g.pileHidden;

  // Cards that just arrived in the hand rise into place.
  const [fresh, setFresh] = useState(false);
  const handKey = g.hand.map((c) => c.id).join(",");
  const prevCount = useRef(g.hand.length);
  useEffect(() => {
    const grew = g.hand.length > prevCount.current;
    prevCount.current = g.hand.length;
    if (!grew) return;
    setFresh(true);
    const t = setTimeout(() => setFresh(false), 600);
    return () => clearTimeout(t);
  }, [handKey, g.hand.length]);
  useEffect(() => {
    if (selected !== null && !g.hand.some((c) => c.id === selected)) setSelected(null);
  }, [handKey, selected, g.hand]);

  useEffect(() => {
    if (myTurn) chime();
  }, [myTurn]);
  const turnEndsAt = useMemo(() => (g.turnMsLeft === null ? null : Date.now() + g.turnMsLeft), [g]);
  const secondsLeft = useCountdown(turnEndsAt);
  useEffect(() => {
    if (myTurn && turnEndsAt && secondsLeft > 0 && secondsLeft <= 5) tick();
  }, [myTurn, turnEndsAt, secondsLeft]);
  const lastNotice = useRef(g.notice);
  useEffect(() => {
    if (g.notice && g.notice !== lastNotice.current) toast(g.notice);
    lastNotice.current = g.notice;
  }, [g.notice, toast]);

  const play = async (cardId: number) => {
    if (!myTurn) return;
    const res = await send({ type: "play", cardId });
    if (res.ok) setSelected(null);
  };
  const tap = (id: number) => {
    if (selected === id && myTurn) void play(id);
    else setSelected(id);
  };
  const drag = (id: number) => (e: ReactPointerEvent<HTMLElement>) => pointerDrag(e, "[data-drop=pile]", () => void play(id));

  const sideName = (side: number) => g.sides[side].seats.map((s) => nameOf(room, g.seats[s].id)).join(" ve ");
  const plainName = (seat: number) => room.players.find((p) => p.id === g.seats[seat].id)?.name ?? "Ayrılan oyuncu";
  const sideFor = (seat: number) => g.sides[g.seats[seat].side];

  const seat = (index: number) => {
    const s = g.seats[index];
    const player = room.players.find((p) => p.id === s.id);
    const name = player?.name ?? "Ayrılan oyuncu";
    const turn = g.turn === index && g.phase === "play";
    const side = sideFor(index);
    const treat = treatFor(s.id);
    const area = areaOf(index);
    return (
      <div key={s.id} className={`pseat ${area} ${turn ? "turn" : ""}`} data-treat={s.id}>
        <span className="pseat-avatar">
          <Avatar id={s.id} name={name} size={area === "me" ? 36 : 44} />
          {turn && turnEndsAt && g.turnSeconds > 0 && (
            <span className={`turn-ring ${secondsLeft <= 5 ? "low" : ""}`} style={{ ["--left" as string]: secondsLeft / g.turnSeconds }} />
          )}
          {g.dealer === index && <span className="pdealer" title="Dağıtan">D</span>}
          {treat && (
            <span key={treat} className="seat-treat">
              <TreatIcon treat={treat} size={26} />
            </span>
          )}
        </span>
        <span className="pseat-name">
          {g.teams && <span className={`team-dot t${s.side}`} />}
          {area === "me" ? "Sen" : name}
          {player?.bot && <span className="pseat-tag">bot</span>}
        </span>
        {turn && turnEndsAt && <span className={`pseat-clock ${secondsLeft <= 5 ? "low" : ""}`}>{secondsLeft} sn</span>}
        <span className="pseat-meta">
          {side.captured} kart{side.pistis > 0 && ` · ${side.pistis} pişti`}
        </span>
        {area !== "me" && (
          <span className="pseat-hand">
            {Array.from({ length: s.handCount }, (_, i) => (
              <CardBack key={i} size="sm" />
            ))}
          </span>
        )}
      </div>
    );
  };

  const sweepTo = sweeping ? areaOf(sweep.seat) : null;
  const pileCards = shownPile.slice(-6);
  const status = g.phase === "roundOver"
    ? "El bitti"
    : myTurn
      ? g.pile.length === 0
        ? "Sıra sende: yere bir kart aç."
        : "Sıra sende: kartını yere sürükle."
      : `${nameOf(room, g.seats[g.turn].id)} oynuyor…`;

  const stage = (
    <div className="pisti" data-drag-layer>
      <div className="pisti-hud">
        <span className="hud-item">
          <span className="hud-label">El</span>
          <strong>{g.round}</strong>
          <span className="hud-label">· {g.target} sayıya</span>
          {g.teams && <span className="hud-tag">Eşli</span>}
        </span>
        <TreatTray />
      </div>

      <div className="pisti-table">
        <div className={`pisti-felt n${n}`} data-treat="table">
          {g.seats.map((_, i) => (i === mySeat ? null : seat(i)))}

          <div className="pisti-center">
            <div className="pisti-deck" aria-label={`Destede ${g.deckCount} kart`}>
              {g.deckCount > 0 ? (
                <>
                  <span className="deck-stack" style={{ ["--depth" as string]: Math.min(6, Math.ceil(g.deckCount / 8)) }}>
                    <CardBack />
                  </span>
                  <span className="deck-count">{g.deckCount}</span>
                </>
              ) : (
                <span className="pcard-ghost" />
              )}
              <span className="plabel">Deste</span>
            </div>

            <div className={`pisti-pile ${myTurn ? "droppable" : ""}`} data-drop={myTurn ? "pile" : undefined}>
              <div key={sweeping ? `s${sweep.id}` : "pile"} className={`pile-cards ${sweeping ? `sweep to-${sweepTo}` : ""}`}>
                {shownHidden > 0 &&
                  Array.from({ length: shownHidden }, (_, i) => <CardBack key={`h${i}`} style={{ rotate: `${i * 7 - 9}deg` }} />)}
                {pileCards.map((c, i) => (
                  <PlayingCard key={c.id} card={c} fresh={i === pileCards.length - 1} style={{ rotate: `${tilt(c.id)}deg` }} />
                ))}
                {pileCards.length === 0 && shownHidden === 0 && <span className="pcard-ghost" />}
              </div>
              <span className="plabel">
                {g.pile.length + g.pileHidden > 0 ? `Yerde ${g.pile.length + g.pileHidden} kart` : myTurn ? "Buraya bırak" : "Yer boş"}
              </span>
              {sweeping && (
                <span key={sweep.id} className={`pisti-call ${sweep.pisti ? "big" : ""}`}>
                  {sweep.pisti === 20 ? "Vale pişti! +20" : sweep.pisti ? "Pişti! +10" : `${sweep.seat === g.mySeat ? "Sen" : plainName(sweep.seat)} aldı`}
                </span>
              )}
            </div>
          </div>

          <div className={`pstatus ${myTurn ? "mine" : ""}`} role="status">
            {status}
          </div>

          {g.phase === "roundOver" && g.lastRound && (
            <div className="pround">
              <div className="psheet">
                <h3>{g.gameOver ? `Kazanan: ${sideName(winnerSide(g))}` : `${g.round}. el bitti`}</h3>
                <p>{g.lastRound.note}</p>
                <table className="scores breakdown">
                  <thead>
                    <tr>
                      <td />
                      <td>Kart</td>
                      <td title="Kartların çoğunu alan">Çoğ.</td>
                      <td title="As, vale, karo 10, sinek 2">Sayı</td>
                      <td>Pişti</td>
                      <td>Top.</td>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lastRound.sides.map((r, i) => (
                      <tr key={i} className={g.sides[i].seats.includes(g.mySeat) ? "me" : ""}>
                        <td>{g.sides[i].seats.map(plainName).join(", ")}</td>
                        <td>{r.cards}</td>
                        <td>{r.majority}</td>
                        <td>{r.cardPoints}</td>
                        <td>{r.pistiPoints}</td>
                        <td>
                          <strong>+{r.total}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.gameOver ? (
                  <p className="muted small">Oda sahibi lobiye dönüp yeni oyun açabilir.</p>
                ) : room.hostId === room.you ? (
                  <button className="primary chunky" onClick={() => send({ type: "nextRound" })}>
                    Sonraki el
                  </button>
                ) : (
                  <p className="muted small">Oda sahibinin yeni eli başlatması bekleniyor…</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {playing && (
        <div className="pisti-me">
          {seat(mySeat)}
          <div className={`pisti-hand ${myTurn ? "live" : ""}`}>
            {g.hand.map((c) => (
              <PlayingCard key={c.id} card={c} size="lg" selected={selected === c.id} fresh={fresh} onClick={() => tap(c.id)} onPointerDown={drag(c.id)} />
            ))}
            {g.hand.length === 0 && <span className="muted small">Elinde kart kalmadı.</span>}
          </div>
        </div>
      )}

      {playing && (
        <div className="pisti-actions">
          <span className="muted small">
            {myTurn ? "Kartı yere sürükle ya da seçip at." : "Sıranı beklerken kartını seçebilirsin."}
          </span>
          <button className="primary chunky" disabled={!myTurn || selected === null} onClick={() => selected !== null && play(selected)}>
            Kartı at
          </button>
        </div>
      )}

    </div>
  );

  const scores = (
    <div className="card">
      <p className="muted small panel-note">Oyun {g.target} sayıya; o sayıya ulaşılan elin sonunda biter.</p>
      <table className="scores">
        <tbody>
          {g.sides.map((side, i) => (
            <tr key={i} className={side.seats.includes(g.mySeat) ? "me" : ""}>
              <td>
                {g.teams && <span className={`team-dot t${i}`} />}
                {sideName(i)}
              </td>
              <td className="muted">
                {side.captured} kart · {side.pistis} pişti
              </td>
              <td>{side.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return <GameLayout room={room} stage={stage} panels={[{ id: "scores", label: "Puanlar", content: scores }]} />;
}

function winnerSide(g: PistiView) {
  return g.sides.reduce((best, s, i) => (s.score > g.sides[best].score ? i : best), 0);
}
