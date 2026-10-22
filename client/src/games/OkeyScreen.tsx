import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./okey.css";
import type { RoomView } from "../../../shared/protocol";
import type { OkeyAction, OkeyView, Tile } from "../../../shared/games/okey";
import { request } from "../socket";
import { useAct, useToast } from "../toast";
import { nameOf, useCountdown } from "../hooks";
import { Avatar } from "../Avatar";
import { chime, clack, tick } from "../sound";
import { Toggle } from "../Toggle";
import { setColorblind, useColorblind } from "../prefs";
import { pointerDrag } from "../drag";
import { autoLay, isWild, meldTakes } from "../../../shared/games/okey-rules";
import { TreatIcon, TreatTray, useSeatChat } from "./TableChat";
import { GameLayout } from "../GameLayout";
import { ROW, SLOTS, rackSummary, arrangeBest, arrangePairs, moveTiles, selectedGroups, syncSlots, type Slots } from "./rack";

const COLOR_NAMES = { red: "Kırmızı", yellow: "Sarı", blue: "Mavi", black: "Siyah" } as const;

function loadSlots(key: string): Slots {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** The mark printed on the two false jokers. */
function JokerMark() {
  return (
    <svg className="joker-mark" viewBox="0 0 24 24" aria-label="Sahte okey">
      <path d="M12 2c1.8 3.6 3.3 5.1 6.9 6.9-3.6 1.8-5.1 3.3-6.9 6.9-1.8-3.6-3.3-5.1-6.9-6.9C8.7 7.1 10.2 5.6 12 2Z" />
      <circle cx="12" cy="20" r="2" />
    </svg>
  );
}

export function TileFace({ tile, okey, small, onClick, onPointerDown, onDoubleClick, selected, fresh, faceDown, must }: {
  tile: Tile;
  /** 101: taken from the side, so it has to be played this turn. */
  must?: boolean;
  /** Turned over on your own rack: only you know what it is. */
  faceDown?: boolean;
  onDoubleClick?: () => void;
  okey?: OkeyView["okey"];
  small?: boolean;
  selected?: boolean;
  fresh?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const wild = okey && tile.color === okey.color && tile.value === okey.value;
  const cls = ["tile", tile.color ?? "joker", small && "small", selected && "selected", onClick && "clickable", wild && "wild", fresh && "fresh", faceDown && "face-down", must && "must"];
  return (
    <div
      className={cls.filter(Boolean).join(" ")}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title={faceDown ? "Ters çevrili taş" : must ? "Yandan aldığın taş: bu el kullanmalısın" : wild ? "Okey" : undefined}
    >
      {faceDown ? null : tile.color === null ? (
        <JokerMark />
      ) : (
        <>
          <span className="tile-value">{tile.value}</span>
          <span className="tile-pip" />
        </>
      )}
      {wild && !faceDown && <span className="tile-okey">okey</span>}
    </div>
  );
}

/**
 * Phones (Android) can go full screen and lock to landscape, like the app
 * tables. iPhone Safari can't, so there the button stays hidden and turning
 * the phone is enough: the table has its own landscape layout.
 */
function useLandscapeMode() {
  const supported = typeof document !== "undefined" && document.fullscreenEnabled && matchMedia("(pointer: coarse)").matches;
  const [on, setOn] = useState(() => supported && document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.("landscape");
    } catch {
      // Some browsers allow full screen but not the orientation lock; that's fine.
    }
  };
  return { supported, on, toggle };
}

/** A seat's discards: the top tile with the ones below peeking out. */
function DiscardSpot({ tiles, okey, label, onTake, onDragTake, dropTarget, area }: {
  tiles: Tile[];
  okey: OkeyView["okey"];
  label: string;
  area: string;
  onTake?: () => void;
  onDragTake?: (e: ReactPointerEvent<HTMLElement>) => void;
  /** This corner accepts a tile dragged from the rack. */
  dropTarget?: string;
}) {
  const last = tiles.at(-1);
  return (
    <div className={`discard-spot ${area} ${onTake ? "takeable" : ""} ${dropTarget ? "droppable" : ""}`} data-drop={dropTarget}>
      <div className={`discard-pile ${tiles.length > 1 ? "stacked" : ""}`}>
        {last ? <TileFace key={last.id} tile={last} okey={okey} small onClick={onTake} onPointerDown={onDragTake} /> : <div className="tile-ghost" />}
      </div>
      <span className="spot-label">{label}</span>
    </div>
  );
}

export function OkeyScreen({ room }: { room: RoomView }) {
  const g = room.game as OkeyView;
  const act = useAct();
  const send = (action: OkeyAction) => act(request("game:action", action));
  const is101 = g.variant === "okey101";
  const storageKey = `socialgames.rack.${room.code}.${g.round}`;
  const [slots, setSlots] = useState<Slots>(() => loadSlots(storageKey));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const flipKey = `${storageKey}.ters`;
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set(loadSlots(flipKey).filter((id): id is number => id !== null)));
  useEffect(() => {
    setFlipped(new Set(loadSlots(flipKey).filter((id): id is number => id !== null)));
  }, [flipKey]);
  const toggleFlip = (ids: number[]) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      try {
        localStorage.setItem(flipKey, JSON.stringify([...next]));
      } catch {
        // Flips just won't survive a refresh.
      }
      return next;
    });
  const prevHand = useRef<Set<number> | null>(null);
  /** Slot a tile drawn by dragging should land in. */
  const drawTo = useRef<number | null>(null);

  const synced = useMemo(() => syncSlots(slots, g.hand), [slots, g.hand]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(synced));
    } catch {
      // Arrangement just won't survive a refresh.
    }
  }, [synced, storageKey]);
  useEffect(() => {
    setSlots(loadSlots(storageKey));
  }, [storageKey]);
  // Drop selections for tiles that left the hand.
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => g.hand.some((t) => t.id === id))));
  }, [g.hand]);
  // Mark tiles that just arrived so they slide onto the rack.
  useEffect(() => {
    const ids = new Set(g.hand.map((t) => t.id));
    const prev = prevHand.current;
    prevHand.current = ids;
    if (!prev || prev.size === 0) return;
    const added = [...ids].filter((id) => !prev.has(id));
    const slot = drawTo.current;
    drawTo.current = null;
    if (added.length === 0 || added.length > 2) return;
    if (slot !== null && added.length === 1) setSlots((prev) => moveTiles(syncSlots(prev, g.hand), added, slot));
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 700);
    return () => clearTimeout(t);
  }, [g.hand]);

  const seatChat = useSeatChat(room);
  const landscape = useLandscapeMode();
  // The table fills a sideways phone exactly, so start (and re-turn) at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
    const mq = matchMedia("(orientation: landscape) and (max-height: 520px)");
    const top = () => mq.matches && window.scrollTo(0, 0);
    mq.addEventListener("change", top);
    return () => mq.removeEventListener("change", top);
  }, []);
  const toast = useToast();
  const colorblind = useColorblind();
  // The server sends time left rather than a clock time, so device clocks don't matter.
  const turnEndsAt = useMemo(() => (g.turnMsLeft === null ? null : Date.now() + g.turnMsLeft), [g]);
  const secondsLeft = useCountdown(turnEndsAt);
  const lastNotice = useRef(g.notice);
  useEffect(() => {
    if (g.notice && g.notice !== lastNotice.current) toast(g.notice);
    lastNotice.current = g.notice;
  }, [g.notice, toast]);
  const summary = useMemo(() => rackSummary(synced, g.hand, g.okey, !is101), [synced, g.hand, g.okey, is101]);
  // Only the okey can be turned over, so others can't spot it on your rack.
  const okeyIds = g.hand.filter((t) => t.color === g.okey.color && t.value === g.okey.value).map((t) => t.id);
  const tileById = new Map(g.hand.map((t) => [t.id, t]));
  const mySeat = g.mySeat;
  const myTurn = g.turn === mySeat && g.phase !== "roundOver";
  const seatAt = (offset: number) => (mySeat + offset) % 4;
  const leftSeat = seatAt(3);
  const selectedIds = [...selected];
  const single = selectedIds.length === 1 ? selectedIds[0] : null;
  const canDraw = myTurn && g.phase === "draw";

  // Table sounds: a clack for every tile thrown, a chime when the turn comes to you.
  const discardCount = g.seats.reduce((n, s) => n + s.discards.length, 0) + g.table.length;
  const lastDiscards = useRef(discardCount);
  useEffect(() => {
    if (discardCount !== lastDiscards.current) clack();
    lastDiscards.current = discardCount;
  }, [discardCount]);
  useEffect(() => {
    if (myTurn) chime();
  }, [myTurn]);
  useEffect(() => {
    if (myTurn && turnEndsAt && secondsLeft > 0 && secondsLeft <= 5) tick();
  }, [myTurn, turnEndsAt, secondsLeft]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const moveSelectedTo = (slot: number, ids = selectedIds) => {
    if (ids.length === 0) return;
    const ordered = synced.filter((id): id is number => id !== null && ids.includes(id));
    setSlots(moveTiles(synced, ordered, slot));
    setSelected(new Set());
    clack(0.6);
  };

  /** The tile the player was just warned about; throwing it again goes through. */
  const warned = useRef<number | null>(null);
  const discard = async (finish: boolean, tileId = single) => {
    if (tileId === null) return;
    const tile = tileById.get(tileId);
    if (!finish && g.penalties && tile && g.hand.length > 1 && warned.current !== tileId) {
      const why = isWild(tile, g.okey) ? "Okeyi atarsan" : meldTakes(tile, g.table, g.okey) !== null ? "Bu taş masadaki bir gruba işlenir; atarsan" : null;
      if (why) {
        warned.current = tileId;
        toast(`${why} 101 ceza yazılır. Yine de atmak için bir daha at.`);
        return;
      }
    }
    warned.current = null;
    const res = await send(finish ? { type: "finish", tileId } : { type: "discard", tileId });
    if (res.ok) setSelected(new Set());
  };

  const canDiscard = myTurn && g.phase === "discard";
  const slotOf = (target: HTMLElement) => {
    const d = target.dataset.drop ?? "";
    if (d.startsWith("slot:")) return Number(d.slice(5));
    // Dropped on the rack but between slots: first free one.
    return d === "rack" ? synced.indexOf(null) : null;
  };

  /** Rack tile: drop on a slot to move it, on your discard corner to throw it. */
  const dragTile = (id: number) => (e: ReactPointerEvent<HTMLElement>) =>
    pointerDrag(e, "[data-drop]", (target) => {
      const drop = target.dataset.drop ?? "";
      if (drop === "discard") {
        void discard(false, id);
        return;
      }
      if (drop.startsWith("meld:")) {
        void addTo(Number(drop.slice(5)), selected.has(id) ? selectedIds : [id]);
        return;
      }
      const slot = slotOf(target);
      if (slot !== null && slot >= 0) moveSelectedTo(slot, selected.has(id) ? selectedIds : [id]);
    });

  /** Center stack or left discard: drag onto the rack to draw into that slot. */
  const dragDraw = (action: OkeyAction, ghost?: HTMLElement | null) => (e: ReactPointerEvent<HTMLElement>) =>
    pointerDrag(
      e,
      "[data-drop^=slot], [data-drop=rack]",
      (target) => {
        const slot = slotOf(target);
        drawTo.current = slot !== null && slot >= 0 ? slot : null;
        void send(action).then((res) => {
          if (!res.ok) drawTo.current = null;
        });
      },
      ghost ?? e.currentTarget,
    );

  /** With tiles selected, lay those; with none, find the best groups in the hand. */
  const lay = async (type: "open" | "layMelds") => {
    let groups = selectedGroups(synced, selected);
    if (groups.length === 0) {
      const auto = autoLay(g.hand, g.okey, g.opened[mySeat], g.mustUseTileId);
      if (!auto.groups) {
        toast(
          g.mustUseTileId !== null
            ? type === "open"
              ? "Yandan aldığın taşla açılmıyor. Geri koyabilirsin."
              : "Yandan aldığın taş yeni bir gruba girmiyor; masadaki bir gruba işle ya da geri koy."
            : type === "open"
              ? `Açmaya yetmiyor: elinde ${auto.points} sayı ve ${auto.pairs} çift var (101 sayı ya da 5 çift gerek).`
              : "Masaya koyacak geçerli grup yok.",
        );
        return;
      }
      groups = auto.groups;
    }
    const res = await send({ type, groups });
    if (res.ok) setSelected(new Set());
  };

  const addTo = async (meldId: number, tileIds = selectedIds) => {
    if (tileIds.length === 0 || !myTurn) return;
    const res = await send({ type: "addToMeld", meldId, tileIds });
    if (res.ok) setSelected(new Set());
  };

  const seat = (index: number, area: string) => {
    const s = g.seats[index];
    const player = room.players.find((p) => p.id === s.id);
    const name = player?.name ?? "Ayrılan oyuncu";
    const turn = g.turn === index && g.phase !== "roundOver";
    const treat = seatChat.treat(s.id);
    const said = seatChat.bubble(s.id);
    return (
      <div className={`seat ${area} ${turn ? "turn" : ""}`} data-treat={s.id}>
        <span className="seat-avatar">
          <Avatar id={s.id} name={name} />
          {turn && turnEndsAt && g.turnSeconds > 0 && (
            <span className={`turn-ring ${secondsLeft <= 5 ? "low" : ""}`} style={{ ["--left" as string]: secondsLeft / g.turnSeconds }} />
          )}
          {said && (
            <span key={said.id} className="seat-bubble" role="status">
              <span className="bubble-text">{said.text}</span>
            </span>
          )}
          {g.dealer === index && <span className="dealer-chip" title="Dağıtan">D</span>}
          {treat && (
            <span key={treat} className="seat-treat">
              <TreatIcon treat={treat} size={26} />
            </span>
          )}
        </span>
        <span className="seat-name">
          {name}
          {player?.bot && <span className="seat-tag">bot</span>}
          {g.esli && index === (mySeat + 2) % 4 && <span className="seat-tag partner">eşin</span>}
        </span>
        {turn && turnEndsAt && <span className={`seat-clock ${secondsLeft <= 5 ? "low" : ""}`}>{secondsLeft} sn</span>}
        <span className="seat-meta">
          {s.handCount} taş · {s.score} puan
          {is101 && g.opened[index] && ` · ${g.opened[index] === "pairs" ? "çiftten açtı" : "açtı"}`}
        </span>
      </div>
    );
  };

  const status = g.phase === "roundOver"
    ? "El bitti"
    : myTurn
      ? g.phase === "draw"
        ? "Sıra sende: ortadan ya da soldan taş çek."
        : is101
          ? "Sıra sende: aç, işle ya da bir taş at."
          : "Sıra sende: bir taş at ya da bitir."
      : `${nameOf(room, g.seats[g.turn].id)} oynuyor…`;
  const clock = myTurn && turnEndsAt ? ` (${secondsLeft} sn)` : "";

  const stage = (
    <div className="okey" data-drag-layer>
      <div className="okey-hud">
        <span className="hud-item">
          <span className="hud-label">El</span>
          <strong>{g.katlamali ? g.round : `${g.round}/${g.totalRounds}`}</strong>
          {g.katlamali && <span className="hud-tag">Katlamalı</span>}
        </span>
        <TreatTray />
        <span className="hud-item hud-okey">
          <span className="hud-label">Okey</span>
          <strong>
            {COLOR_NAMES[g.okey.color]} {g.okey.value}
          </strong>
          <TileFace tile={{ id: -1, color: g.okey.color, value: g.okey.value }} okey={g.okey} small />
        </span>
      </div>

      <div className="okey-table">
        <div className="felt" data-treat="table">
          {seat(seatAt(2), "top")}
          {seat(leftSeat, "left")}
          {seat(seatAt(1), "right")}

          <DiscardSpot area="c-tl" tiles={g.seats[seatAt(2)].discards} okey={g.okey} label="" />
          <DiscardSpot area="c-tr" tiles={g.seats[seatAt(1)].discards} okey={g.okey} label="" />
          <DiscardSpot
            area="c-bl"
            tiles={g.seats[leftSeat].discards}
            okey={g.okey}
            label="Soldan al"
            onTake={canDraw && g.seats[leftSeat].discards.length > 0 ? () => send({ type: "drawDiscard" }) : undefined}
            onDragTake={canDraw ? dragDraw({ type: "drawDiscard" }) : undefined}
          />
          <DiscardSpot
            area="c-br"
            tiles={g.seats[mySeat].discards}
            okey={g.okey}
            label={canDiscard ? "Atmak için bırak" : "Attığın"}
            dropTarget={canDiscard ? "discard" : undefined}
          />

          <div className="felt-center">
            <div className="indicator">
              <TileFace tile={g.indicator} small />
              <span className="spot-label">Gösterge</span>
            </div>
            <button className={`draw-stack ${canDraw ? "ready" : ""}`} disabled={!canDraw} onClick={() => send({ type: "drawCenter" })}
              onPointerDown={canDraw ? (e) => dragDraw({ type: "drawCenter" }, e.currentTarget.querySelector<HTMLElement>(".stack-tiles"))(e) : undefined}
              aria-label="Ortadan çek"
            >
              <span className="stack-tiles" style={{ ["--depth" as string]: Math.min(6, Math.ceil(g.centerCount / 8)) }} />
              <span className="stack-count">{g.centerCount}</span>
              <span className="spot-label">Ortadan çek</span>
            </button>
          </div>

          {is101 && g.table.length > 0 && (
            <div className="okey-melds">
              <span className="spot-label">Masada açılanlar{canDiscard && g.opened[mySeat] ? " · işlemek için taşı gruba sürükle" : ""}</span>
              <div className="meld-list">
                {g.table.map((m) => (
                  <button
                    key={m.id}
                    className="meld"
                    onClick={() => addTo(m.id)}
                    disabled={!myTurn || selected.size === 0 || m.kind === "pair"}
                    title={nameOf(room, m.owner)}
                    data-drop={canDiscard && g.opened[mySeat] && m.kind !== "pair" ? `meld:${m.id}` : undefined}
                  >
                    {m.tiles.map((t) => (
                      <TileFace key={t.id} tile={t} okey={g.okey} small />
                    ))}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`felt-status ${myTurn ? "mine" : ""}`} role="status">
            {status}
            {clock}
          </div>

          {g.phase === "roundOver" && g.lastRound && (
            <div className="round-over">
              <div className="round-sheet">
                <h3>{g.gameOver ? `Kazanan: ${winnerName(room, g)}` : "El bitti"}</h3>
                <p>{g.lastRound.note}</p>
                {g.lastRound.winningHand && g.lastRound.winningHand.length > 0 && (
                  <div className="tile-row">
                    {g.lastRound.winningHand.map((t) => (
                      <TileFace key={t.id} tile={t} okey={g.okey} small />
                    ))}
                  </div>
                )}
                <table className="scores round-scores">
                  <thead>
                    <tr>
                      <td />
                      <td>Bu el</td>
                      <td>Toplam</td>
                    </tr>
                  </thead>
                  <tbody>
                    {g.seats.map((s, i) => (
                      <tr key={s.id} className={i === mySeat ? "me" : ""}>
                        <td>{nameOf(room, s.id)}</td>
                        <td>{g.lastRound!.deltas[i] > 0 ? `+${g.lastRound!.deltas[i]}` : g.lastRound!.deltas[i]}</td>
                        <td>
                          <strong>{s.score}</strong>
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

      <div className="istaka" data-drop="rack">
        {[0, 1].map((row) => (
          <div key={row} className="istaka-row">
            {Array.from({ length: ROW }, (_, col) => {
              const i = row * ROW + col;
              const id = synced[i];
              const tile = id !== null && id !== undefined ? tileById.get(id) : undefined;
              return (
                <div
                  key={i}
                  className={`slot ${!tile && selected.size > 0 ? "target" : ""}`}
                  onClick={() => !tile && moveSelectedTo(i)}
                  data-drop={`slot:${i}`}
                >
                  {tile && (
                    <TileFace
                      tile={tile}
                      okey={g.okey}
                      selected={selected.has(tile.id)}
                      fresh={fresh.has(tile.id)}
                      onClick={() => toggle(tile.id)}
                      onPointerDown={dragTile(tile.id)}
                      onDoubleClick={okeyIds.includes(tile.id) ? () => toggleFlip([tile.id]) : undefined}
                      faceDown={flipped.has(tile.id) && okeyIds.includes(tile.id)}
                      must={tile.id === g.mustUseTileId}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rack-summary" aria-live="polite">
        {is101 && !g.opened[mySeat] ? (
          <>
            <span>
              Elinde <strong>{summary.best}</strong> sayı{" "}
              {summary.best >= 101 ? <em className="ok">açmaya yeter</em> : <span className="muted">· açmak için {101 - summary.best} daha</span>}
            </span>
            <span>
              <strong>{summary.pairs}</strong> çift{" "}
              {summary.pairs >= 5 ? <em className="ok">çiftten açmaya yeter</em> : <span className="muted">· çiftten açmak için 5</span>}
            </span>
          </>
        ) : is101 ? (
          <span>
            Elinde <strong>{g.hand.length}</strong> taş · işlenebilecek gruplar <strong>{summary.best}</strong> sayı
          </span>
        ) : (
          <>
            <span>
              Seriye giren <strong>{summary.bestTiles}</strong>/{g.hand.length} taş · <strong>{summary.best}</strong> sayı
            </span>
            <span>
              <strong>{summary.pairs}</strong> çift {summary.pairs >= 7 && <em className="ok">çiftten bitebilir</em>}
            </span>
          </>
        )}
        {summary.points < summary.best && <span className="muted small">Istakadaki diziliş {summary.points} sayı ediyor; Seri diz en iyi dizilişe getirir.</span>}
      </div>

      <div className="okey-actions">
        <button className="wood" onClick={() => setSlots(arrangeBest(g.hand, g.okey, !is101))}>
          Seri diz
        </button>
        <button className="wood" onClick={() => setSlots(arrangePairs(g.hand, g.okey))}>
          Çift diz
        </button>
        {okeyIds.length > 0 && (
          <button className="wood" onClick={() => toggleFlip(okeyIds)} title="Elindeki okeyi ters çevirir; okeye çift dokunmak da çevirir">
            {okeyIds.every((id) => flipped.has(id)) ? "Okeyi düz çevir" : "Okeyi ters çevir"}
          </button>
        )}
        {g.canShowIndicator && (
          <button className="wood" onClick={() => send({ type: "showIndicator" })} title="Göstergenin eşi elinde">
            Göstergeyi göster
          </button>
        )}
        {landscape.supported && (
          <button className="ghost full-toggle" onClick={landscape.toggle} title="Telefonu yan çevirip masayı tam ekran açar">
            {landscape.on ? "Tam ekrandan çık" : "Yatay oyna"}
          </button>
        )}
        <span className="spacer" />
        {myTurn && g.phase === "discard" && (
          <>
            {is101 && g.mustUseTileId !== null && <button onClick={() => send({ type: "returnDiscard" })}>Aldığımı geri koy</button>}
            {is101 && !g.opened[mySeat] && (
              <button className="success chunky" onClick={() => lay("open")}>
                {selected.size > 0 ? "Seçtiklerimle aç" : "Elimi aç"}
              </button>
            )}
            {is101 && g.opened[mySeat] && (
              <button className="success chunky" onClick={() => lay("layMelds")}>
                {selected.size > 0 ? "Seçtiklerimi koy" : "Yere koy"}
              </button>
            )}
            {!is101 && (
              <button className="success chunky" disabled={single === null} onClick={() => discard(true)}>
                Bitir
              </button>
            )}
            <button className="primary chunky" disabled={single === null} onClick={() => discard(false)}>
              Taşı at
            </button>
          </>
        )}
      </div>
      <p className="muted small hint">
        {is101 && myTurn && g.phase === "discard"
          ? g.opened[mySeat]
            ? "Masadaki bir gruba işlemek için taşı o gruba sürükle ya da seçip gruba dokun. Yere koy elindeki yeni grupları bulup koyar."
            : "Elimi aç en iyi dizilişi bulup kendisi açar. İstersen taşları seçip kendin aç; aralarında boşluk olan taşlar ayrı grup sayılır."
          : "Taşları sürükleyip istediğin yuvaya bırak. Çekmek için ortadaki desteyi ya da soldaki taşı ıstakaya, atmak için taşı sağ alt köşeye sürükle. Okeye çift dokununca ters döner."}
      </p>
    </div>
  );

  const scores = (
    <div className="okey-scores">
      <div className="card">
        {is101 && <p className="muted small panel-note">101'de az puan kazanır.</p>}
        {g.katlamali && <p className="muted small panel-note">Biri sıfıra düşünce oyun biter.</p>}
        {g.teamScores && (
          <table className="scores teams">
            <tbody>
              {g.teamScores.map((score, team) => (
                <tr key={team} className={team === mySeat % 2 ? "me" : ""}>
                  <td>{teamName(room, g, team)}</td>
                  <td>{score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <table className={`scores ${g.esli ? "players" : ""}`}>
          <tbody>
            {g.seats.map((s, i) => (
              <tr key={s.id} className={i === mySeat ? "me" : ""}>
                <td>{nameOf(room, s.id)}</td>
                <td>{s.score}</td>
                {g.lastRound && <td className="muted">{g.lastRound.deltas[i] > 0 ? `+${g.lastRound.deltas[i]}` : g.lastRound.deltas[i]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <Toggle on={colorblind} onChange={setColorblind} label="Renk körü modu" hint="Renkler ayrıca şekille gösterilir: kırmızı üçgen, sarı kare, mavi baklava, siyah daire." />
      </div>
    </div>
  );

  return <GameLayout room={room} stage={stage} className="okey-play" panels={[{ id: "scores", label: "Puanlar", content: scores }]} />;
}

function teamName(room: RoomView, g: OkeyView, team: number) {
  return `${nameOf(room, g.seats[team].id)} & ${nameOf(room, g.seats[team + 2].id)}`;
}

function winnerName(room: RoomView, g: OkeyView) {
  if (g.teamScores) {
    const [a, b] = g.teamScores;
    const lowWins = g.variant === "okey101";
    if (a === b) return `${teamName(room, g, 0)} ile ${teamName(room, g, 1)} berabere`;
    return teamName(room, g, (lowWins ? a < b : a > b) ? 0 : 1);
  }
  const scores = g.seats.map((s) => s.score);
  const best = g.variant === "okey101" ? Math.min(...scores) : Math.max(...scores);
  return g.seats
    .filter((s) => s.score === best)
    .map((s) => nameOf(room, s.id))
    .join(", ");
}
