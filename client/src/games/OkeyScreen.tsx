import { useEffect, useMemo, useRef, useState } from "react";
import "./okey.css";
import type { RoomView } from "../../../shared/protocol";
import type { OkeyAction, OkeyView, Tile } from "../../../shared/games/okey";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf } from "../hooks";
import { Avatar } from "../Avatar";
import { chime, clack } from "../sound";
import { ROW, SLOTS, arrangePairs, arrangeRuns, moveTiles, selectedGroups, syncSlots, type Slots } from "./rack";

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

export function TileFace({ tile, okey, small, onClick, selected, fresh }: {
  tile: Tile;
  okey?: OkeyView["okey"];
  small?: boolean;
  selected?: boolean;
  fresh?: boolean;
  onClick?: () => void;
}) {
  const wild = okey && tile.color === okey.color && tile.value === okey.value;
  const cls = ["tile", tile.color ?? "joker", small && "small", selected && "selected", onClick && "clickable", wild && "wild", fresh && "fresh"];
  return (
    <div
      className={cls.filter(Boolean).join(" ")}
      onClick={onClick}
      draggable={!!onClick}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(tile.id))}
      title={wild ? "Okey" : undefined}
    >
      {tile.color === null ? (
        <JokerMark />
      ) : (
        <>
          <span className="tile-value">{tile.value}</span>
          <span className="tile-pip" />
        </>
      )}
      {wild && <span className="tile-okey">okey</span>}
    </div>
  );
}

/** A seat's discards: the top tile with the ones below peeking out. */
function DiscardSpot({ tiles, okey, label, onTake, area }: {
  tiles: Tile[];
  okey: OkeyView["okey"];
  label: string;
  area: string;
  onTake?: () => void;
}) {
  const last = tiles.at(-1);
  return (
    <div className={`discard-spot ${area} ${onTake ? "takeable" : ""}`}>
      <div className={`discard-pile ${tiles.length > 1 ? "stacked" : ""}`}>
        {last ? <TileFace key={last.id} tile={last} okey={okey} small onClick={onTake} /> : <div className="tile-ghost" />}
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
  const prevHand = useRef<Set<number> | null>(null);

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
    if (added.length === 0 || added.length > 2) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 700);
    return () => clearTimeout(t);
  }, [g.hand]);

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

  const discard = async (finish: boolean) => {
    if (single === null) return;
    const res = await send(finish ? { type: "finish", tileId: single } : { type: "discard", tileId: single });
    if (res.ok) setSelected(new Set());
  };

  const lay = async (type: "open" | "layMelds") => {
    const groups = selectedGroups(synced, selected);
    if (groups.length === 0) return;
    const res = await send({ type, groups });
    if (res.ok) setSelected(new Set());
  };

  const addTo = async (meldId: number) => {
    if (selectedIds.length === 0 || !myTurn) return;
    const res = await send({ type: "addToMeld", meldId, tileIds: selectedIds });
    if (res.ok) setSelected(new Set());
  };

  const seat = (index: number, area: string) => {
    const s = g.seats[index];
    const player = room.players.find((p) => p.id === s.id);
    const name = player?.name ?? "Ayrılan oyuncu";
    const turn = g.turn === index && g.phase !== "roundOver";
    return (
      <div className={`seat ${area} ${turn ? "turn" : ""}`}>
        <span className="seat-avatar">
          <Avatar id={s.id} name={name} />
          {g.dealer === index && <span className="dealer-chip" title="Dağıtan">D</span>}
        </span>
        <span className="seat-name">
          {name}
          {player?.bot && <span className="seat-tag">bot</span>}
        </span>
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

  return (
    <div className="okey">
      <div className="okey-hud">
        <span className="hud-item">
          <span className="hud-label">El</span>
          <strong>
            {g.round}/{g.totalRounds}
          </strong>
        </span>
        <span className="hud-item">
          <span className="hud-label">Okey</span>
          <strong>
            {COLOR_NAMES[g.okey.color]} {g.okey.value}
          </strong>
          <TileFace tile={{ id: -1, color: g.okey.color, value: g.okey.value }} okey={g.okey} small />
        </span>
      </div>

      <div className="okey-table">
        <div className="felt">
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
          />
          <DiscardSpot area="c-br" tiles={g.seats[mySeat].discards} okey={g.okey} label="Attığın" />

          <div className="felt-center">
            <div className="indicator">
              <TileFace tile={g.indicator} small />
              <span className="spot-label">Gösterge</span>
            </div>
            <button className={`draw-stack ${canDraw ? "ready" : ""}`} disabled={!canDraw} onClick={() => send({ type: "drawCenter" })} aria-label="Ortadan çek">
              <span className="stack-tiles" style={{ ["--depth" as string]: Math.min(6, Math.ceil(g.centerCount / 8)) }} />
              <span className="stack-count">{g.centerCount}</span>
              <span className="spot-label">Ortadan çek</span>
            </button>
          </div>

          <div className={`felt-status ${myTurn ? "mine" : ""}`} role="status">
            {status}
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

      {is101 && g.table.length > 0 && (
        <div className="okey-melds">
          <span className="spot-label">Masada açılanlar{myTurn && selected.size > 0 ? " · işlemek için gruba dokun" : ""}</span>
          <div className="meld-list">
            {g.table.map((m) => (
              <button key={m.id} className="meld" onClick={() => addTo(m.id)} disabled={!myTurn || selected.size === 0 || m.kind === "pair"} title={nameOf(room, m.owner)}>
                {m.tiles.map((t) => (
                  <TileFace key={t.id} tile={t} okey={g.okey} small />
                ))}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="istaka" onDragOver={(e) => e.preventDefault()}>
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
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragged = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isFinite(dragged)) moveSelectedTo(i, selected.has(dragged) ? selectedIds : [dragged]);
                  }}
                >
                  {tile && <TileFace tile={tile} okey={g.okey} selected={selected.has(tile.id)} fresh={fresh.has(tile.id)} onClick={() => toggle(tile.id)} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="okey-actions">
        <button className="wood" onClick={() => setSlots(arrangeRuns(g.hand, g.okey))}>
          Seri diz
        </button>
        <button className="wood" onClick={() => setSlots(arrangePairs(g.hand, g.okey))}>
          Çift diz
        </button>
        <span className="spacer" />
        {myTurn && g.phase === "discard" && (
          <>
            {is101 && g.mustUseTileId !== null && <button onClick={() => send({ type: "returnDiscard" })}>Aldığımı geri koy</button>}
            {is101 && !g.opened[mySeat] && (
              <button className="success chunky" disabled={selected.size === 0} onClick={() => lay("open")}>
                Elimi aç
              </button>
            )}
            {is101 && g.opened[mySeat] && (
              <button className="success chunky" disabled={selected.size === 0} onClick={() => lay("layMelds")}>
                Yere koy
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
          ? "Açmak için taşları seç; ıstakada aralarında boşluk olan taşlar ayrı grup sayılır."
          : "Taşa dokunup seç, sonra boş bir yuvaya dokunarak taşı. Bilgisayarda sürükleyebilirsin."}
      </p>

      <div className="card">
        <h4>Puanlar {is101 && <span className="muted small">(az olan kazanır)</span>}</h4>
        <table className="scores">
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
    </div>
  );
}

function winnerName(room: RoomView, g: OkeyView) {
  const scores = g.seats.map((s) => s.score);
  const best = g.variant === "okey101" ? Math.min(...scores) : Math.max(...scores);
  return g.seats
    .filter((s) => s.score === best)
    .map((s) => nameOf(room, s.id))
    .join(", ");
}
