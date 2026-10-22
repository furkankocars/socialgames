import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./pisti.css";
import "./batak.css";
import type { RoomView } from "../../../shared/protocol";
import { SUIT_NAMES, type BatakAction, type BatakTrick, type BatakView, type Suit, type TrickCard } from "../../../shared/games/batak";
import { request } from "../socket";
import { useAct, useToast } from "../toast";
import { nameOf, useCountdown } from "../hooks";
import { Avatar } from "../Avatar";
import { chime, clack, success, tick } from "../sound";
import { pointerDrag } from "../drag";
import { TreatIcon, TreatTray, useSeatChat } from "./TableChat";
import { GameLayout } from "../GameLayout";
import { PlayingCard, SuitMark } from "./PistiScreen";

type Area = "me" | "right" | "top" | "left";
const AREAS: Area[] = ["me", "right", "top", "left"];
/** How long a finished trick stays on the felt before it slides to its taker. */
const TRICK_SHOW_MS = 1100;
const SUITS: Suit[] = ["spades", "hearts", "clubs", "diamonds"];

export function BatakScreen({ room }: { room: RoomView }) {
  const g = room.game as BatakView;
  const act = useAct();
  const toast = useToast();
  const send = (action: BatakAction) => act(request("game:action", action));
  const mySeat = Math.max(0, g.mySeat);
  const playing = g.mySeat >= 0;
  const myTurn = playing && g.turn === g.mySeat && g.phase !== "roundOver";
  const myPlay = myTurn && g.phase === "play";
  const kozmaca = g.mode === "kozmaca";
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => window.scrollTo({ top: 0 }), []);
  const seatChat = useSeatChat(room);
  const areaOf = (seat: number): Area => AREAS[(seat - mySeat + 4) % 4];
  const plainName = (seat: number) => room.players.find((p) => p.id === g.seats[seat].id)?.name ?? "Ayrılan oyuncu";
  const shortName = (seat: number) => (seat === g.mySeat ? "Sen" : plainName(seat));
  const sideName = (side: number) => g.sides[side].seats.map((s) => (s === g.mySeat ? "Sen" : plainName(s))).join(" ve ");

  // A finished trick stays up for a moment, then slides to whoever took it.
  const [shownTrick, setShownTrick] = useState<BatakTrick | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const lastTrickId = useRef(g.lastTrick?.id ?? 0);
  useEffect(() => {
    const t = g.lastTrick;
    if (!t || t.id === lastTrickId.current) return;
    lastTrickId.current = t.id;
    setShownTrick(t);
    setSweeping(false);
    if (t.winner === g.mySeat || (g.teams && g.seats[t.winner].side === g.seats[mySeat].side)) success();
    const a = setTimeout(() => setSweeping(true), TRICK_SHOW_MS);
    const b = setTimeout(() => setShownTrick(null), TRICK_SHOW_MS + 450);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [g.lastTrick, g.mySeat, g.teams, g.seats, mySeat]);
  // A new trick on the felt replaces the finished one at once.
  const trickCards: TrickCard[] = g.trick.length > 0 || !shownTrick ? g.trick : shownTrick.cards;
  const showingDone = g.trick.length === 0 && shownTrick !== null;

  const playedCount = g.trick.length + (g.lastTrick?.id ?? 0) * 4;
  const prevPlayed = useRef(playedCount);
  useEffect(() => {
    if (playedCount !== prevPlayed.current) clack();
    prevPlayed.current = playedCount;
  }, [playedCount]);

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

  const handKey = g.hand.map((c) => c.id).join(",");
  useEffect(() => {
    if (selected !== null && !g.hand.some((c) => c.id === selected)) setSelected(null);
  }, [handKey, selected, g.hand]);

  const legal = new Set(g.legal);
  const play = async (cardId: number) => {
    if (!myPlay) return;
    const res = await send({ type: "play", cardId });
    if (res.ok) setSelected(null);
  };
  const tap = (id: number) => {
    if (selected === id && myPlay) void play(id);
    else setSelected(id);
  };
  const drag = (id: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (myPlay && legal.has(id)) pointerDrag(e, "[data-drop=trick]", () => void play(id));
  };

  // Overlap the hand so all thirteen cards fit the width of the felt.
  const handRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const fit = () => {
      const card = el.querySelector<HTMLElement>(".pcard");
      const n = g.hand.length;
      if (!card || n < 2) return setStep(null);
      const w = card.offsetWidth;
      // The fan spreads the outer cards a little past their slots.
      const space = el.clientWidth - 8 - w * 0.6;
      setStep(Math.min(w + 4, (space - w) / (n - 1)) - w);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [g.hand.length]);

  const bidLabel = (seat: number) => {
    const s = g.seats[seat];
    if (s.bid === null) return null;
    if (kozmaca) return `Söz ${s.bid}`;
    if (s.passed) return "Pas";
    return g.bidder === seat ? `İhale ${s.bid}` : `${s.bid} dedi`;
  };

  const seat = (index: number) => {
    const s = g.seats[index];
    const player = room.players.find((p) => p.id === s.id);
    const name = player?.name ?? "Ayrılan oyuncu";
    const area = areaOf(index);
    const turn = g.turn === index && g.phase !== "roundOver";
    const treat = seatChat.treat(s.id);
    const said = seatChat.bubble(s.id);
    const label = bidLabel(index);
    const isBidder = !kozmaca && g.bidder === index && g.phase !== "bid";
    return (
      <div key={s.id} className={`bseat ${area} ${turn ? "turn" : ""}`} data-treat={s.id}>
        <span className="bseat-avatar">
          <Avatar id={s.id} name={name} size={area === "me" ? 34 : 40} />
          {turn && turnEndsAt && g.turnSeconds > 0 && (
            <span className={`turn-ring ${secondsLeft <= 5 ? "low" : ""}`} style={{ ["--left" as string]: secondsLeft / g.turnSeconds }} />
          )}
          {said && (
            <span key={said.id} className="seat-bubble" role="status">
              <span className="bubble-text">{said.text}</span>
            </span>
          )}
          {g.dealer === index && <span className="pdealer" title="Dağıtan">D</span>}
          {treat && (
            <span key={treat} className="seat-treat">
              <TreatIcon treat={treat} size={24} />
            </span>
          )}
        </span>
        <span className="bseat-text">
          <span className="bseat-name">
            {g.teams && <span className={`team-dot t${s.side}`} />}
            {area === "me" ? "Sen" : name}
            {player?.bot && <span className="pseat-tag">bot</span>}
          </span>
          <span className="bseat-meta">
            {label && <span className={`bchip ${isBidder ? "lead" : ""} ${s.passed ? "pass" : ""}`}>{label}</span>}
            {g.phase !== "bid" && <span className="btricks">{s.tricks} el</span>}
            {turn && turnEndsAt && <span className={`pseat-clock ${secondsLeft <= 5 ? "low" : ""}`}>{secondsLeft}</span>}
          </span>
        </span>
      </div>
    );
  };

  const bidderSide = g.bidder !== null ? g.seats[g.bidder].side : null;
  const status =
    g.phase === "roundOver"
      ? "El bitti"
      : g.phase === "bid"
        ? myTurn
          ? kozmaca
            ? "Sıra sende: kaç el alacağını söyle."
            : "Sıra sende: ihale ver ya da pas geç."
          : `${nameOf(room, g.seats[g.turn].id)} ${kozmaca ? "sözünü düşünüyor" : "ihaleyi düşünüyor"}…`
        : g.phase === "trump"
          ? myTurn
            ? "İhale sende: kozu seç."
            : `${nameOf(room, g.seats[g.turn].id)} kozu seçiyor…`
          : myTurn
            ? g.trick.length === 0
              ? "Sıra sende: ilk kartı at."
              : "Sıra sende: kartını ortaya sürükle."
            : `${nameOf(room, g.seats[g.turn].id)} oynuyor…`;

  const bidPanel = myTurn && g.phase === "bid" && (
    <div className="bpanel" role="group" aria-label={kozmaca ? "Söz ver" : "İhale ver"}>
      <span className="bpanel-title">{kozmaca ? "Kaç el alırsın?" : g.bidder === null ? "İhale ver" : `${shortName(g.bidder)} ${g.bid} dedi`}</span>
      <div className="bpanel-nums">
        {Array.from({ length: 13 }, (_, i) => i + 1)
          .filter((v) => (kozmaca ? true : v >= Math.max(g.minBid, g.bid + 1)))
          .map((v) => (
            <button key={v} className="bnum" onClick={() => send({ type: "bid", amount: v })}>
              {v}
            </button>
          ))}
      </div>
      {!kozmaca && (
        <button className="bpass" onClick={() => send({ type: "bid", amount: 0 })}>
          Pas
        </button>
      )}
    </div>
  );

  const trumpPanel = myTurn && g.phase === "trump" && (
    <div className="bpanel" role="group" aria-label="Koz seç">
      <span className="bpanel-title">İhale {g.bid} sende. Koz ne olsun?</span>
      <div className="bpanel-suits">
        {SUITS.map((suit) => (
          <button key={suit} className={`bsuit ${suit === "hearts" || suit === "diamonds" ? "red" : ""}`} onClick={() => send({ type: "trump", suit })}>
            <SuitMark suit={suit} />
            <span>{SUIT_NAMES[suit]}</span>
            <small>{g.hand.filter((c) => c.suit === suit).length} kart</small>
          </button>
        ))}
      </div>
    </div>
  );

  const winnerArea = shownTrick ? areaOf(shownTrick.winner) : null;
  const stage = (
    <div className="batak" data-drag-layer>
      <div className="batak-table">
        <div className="batak-felt" data-treat="table">
          <div className="batak-hud">
            <span className="bhud-round">
              El <strong>{g.round}</strong>/{g.rounds}
              {g.teams && <span className="hud-tag">Eşli</span>}
            </span>
            <span className="bhud-contract">
              {g.trump ? (
                <span className={`btrump ${g.trump === "hearts" || g.trump === "diamonds" ? "red" : ""}`} title={`Koz ${SUIT_NAMES[g.trump]}`}>
                  <SuitMark suit={g.trump} />
                </span>
              ) : (
                <span className="btrump empty" aria-hidden />
              )}
              <span className="bhud-text">
                <span className="bhud-label">Koz</span>
                <strong>{g.trump ? SUIT_NAMES[g.trump] : "seçilmedi"}</strong>
              </span>
              {!kozmaca && g.bidder !== null && g.phase !== "bid" && (
                <span className="bhud-text">
                  <span className="bhud-label">İhale</span>
                  <strong>
                    {shortName(g.bidder)} {g.bid}
                  </strong>
                </span>
              )}
            </span>
            <span className="bhud-tray">
              <TreatTray />
            </span>
          </div>

          {g.seats.map((_, i) => (i === mySeat && playing ? null : seat(i)))}

          <div className={`batak-center ${myPlay ? "droppable" : ""}`} data-drop={myPlay ? "trick" : undefined}>
            <div key={showingDone ? `done${shownTrick!.id}` : "trick"} className={`btrick ${showingDone && sweeping ? `sweep to-${winnerArea}` : ""}`}>
              {trickCards.map((t) => (
                <PlayingCard key={t.card.id} card={t.card} fresh className={`at-${areaOf(t.seat)}`} />
              ))}
            </div>
            {showingDone && !sweeping && (
              <span key={shownTrick!.id} className="btaker">
                {shortName(shownTrick!.winner)} aldı
              </span>
            )}
            {bidPanel}
            {trumpPanel}
          </div>

          <div className={`pstatus bstatus ${myTurn ? "mine" : ""}`} role="status">
            {status}
          </div>

          {playing && (
            <div className="batak-me">
              {seat(mySeat)}
              <div
                ref={handRef}
                className={`bhand ${myPlay ? "live" : ""}`}
                style={step !== null ? { ["--step" as string]: `${step}px` } : undefined}
              >
                {g.hand.map((c, i) => {
                  const ok = !myPlay || legal.has(c.id);
                  const mid = (g.hand.length - 1) / 2;
                  return (
                    <PlayingCard
                      key={c.id}
                      card={c}
                      size="lg"
                      selected={selected === c.id}
                      className={ok ? "" : "dim"}
                      style={{ ["--fan" as string]: i - mid }}
                      onClick={ok ? () => tap(c.id) : undefined}
                      onPointerDown={ok ? drag(c.id) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {g.phase === "roundOver" && g.lastRound && (
            <div className="pround">
              <div className="psheet">
                <h3>{g.gameOver ? winnerLine(g, sideName) : `${g.round}. el bitti`}</h3>
                <p>{g.lastRound.note}</p>
                <table className="scores breakdown">
                  <thead>
                    <tr>
                      <td />
                      <td>{kozmaca ? "Söz" : "İhale"}</td>
                      <td>Aldığı</td>
                      <td>Bu el</td>
                      <td>Toplam</td>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lastRound.sides.map((r, i) => (
                      <tr key={i} className={g.sides[i].seats.includes(g.mySeat) ? "me" : ""}>
                        <td>{sideName(i)}</td>
                        <td>{r.bid || "–"}</td>
                        <td>{r.tricks}</td>
                        <td className={r.delta < 0 ? "neg" : ""}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                        <td>
                          <strong>{g.sides[i].score}</strong>
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
        <div className="batak-actions">
          <span className="muted small">
            {myPlay
              ? "Atabileceğin kartlar parlak. Ortaya sürükle ya da iki kez dokun."
              : bidderSide !== null && g.phase === "play"
                ? `${sideName(bidderSide)} en az ${g.bid} el almalı.`
                : "Sıranı beklerken elini incele."}
          </span>
          <button className="primary chunky" disabled={!myPlay || selected === null || !legal.has(selected)} onClick={() => selected !== null && play(selected)}>
            Kartı at
          </button>
        </div>
      )}
    </div>
  );

  const scores = (
    <div className="card">
      <p className="muted small panel-note">
        {g.rounds} el oynanır. {kozmaca ? "Sözünü tutan aldığı el kadar, tutamayan sözü kadar eksi yazar." : "İhaleyi çıkaran aldığı el kadar, batan ihalesi kadar eksi yazar; diğerleri aldığı el kadar."}
      </p>
      <table className="scores bhistory">
        <thead>
          <tr>
            <td>El</td>
            {g.sides.map((_, i) => (
              <td key={i}>
                {g.teams && <span className={`team-dot t${i}`} />}
                {sideName(i)}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {g.history.map((row, r) => (
            <tr key={r}>
              <td>{r + 1}</td>
              {row.map((d, i) => (
                <td key={i} className={d < 0 ? "neg" : ""}>
                  {d > 0 ? `+${d}` : d}
                </td>
              ))}
            </tr>
          ))}
          <tr className="total">
            <td>Toplam</td>
            {g.sides.map((s, i) => (
              <td key={i}>{s.score}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );

  return <GameLayout room={room} stage={stage} panels={[{ id: "scores", label: "Puanlar", content: scores }]} className="batak-play" />;
}

function winnerLine(g: BatakView, sideName: (side: number) => string) {
  const top = Math.max(...g.sides.map((s) => s.score));
  const winners = g.sides.map((s, i) => (s.score === top ? i : -1)).filter((i) => i >= 0);
  return winners.length > 1 ? `Berabere: ${winners.map(sideName).join(", ")}` : `Kazanan: ${sideName(winners[0])}`;
}
