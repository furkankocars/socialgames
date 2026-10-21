import { useEffect, useMemo, useState } from "react";
import type { RoomView } from "../../../shared/protocol";
import type { OkeyAction, OkeyView, Tile } from "../../../shared/games/okey";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf } from "../hooks";
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

export function TileFace({ tile, okey, small, onClick, selected }: {
  tile: Tile;
  okey?: OkeyView["okey"];
  small?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const wild = okey && tile.color === okey.color && tile.value === okey.value;
  return (
    <div
      className={`tile ${tile.color ?? "joker"} ${small ? "small" : ""} ${selected ? "selected" : ""} ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      draggable={!!onClick}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(tile.id))}
    >
      <span className="tile-value">{tile.color === null ? "☆" : tile.value}</span>
      {wild && <span className="tile-okey">okey</span>}
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

  const tileById = new Map(g.hand.map((t) => [t.id, t]));
  const mySeat = g.mySeat;
  const myTurn = g.turn === mySeat && g.phase !== "roundOver";
  const seatAt = (offset: number) => (mySeat + offset) % 4;
  const leftSeat = seatAt(3);
  const leftDiscard = g.seats[leftSeat].discards.at(-1);
  const myDiscard = g.seats[mySeat].discards.at(-1);
  const selectedIds = [...selected];
  const single = selectedIds.length === 1 ? selectedIds[0] : null;

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

  const opponent = (seat: number, position: string) => {
    const s = g.seats[seat];
    const last = s.discards.at(-1);
    return (
      <div className={`opponent ${position} ${g.turn === seat && g.phase !== "roundOver" ? "turn" : ""}`}>
        <div className="opp-name">
          {nameOf(room, s.id)}
        </div>
        <div className="small muted">
          {s.handCount} taş · {s.score} puan{g.dealer === seat && " · dağıttı"}
          {is101 && g.opened[seat] && ` · ${g.opened[seat] === "pairs" ? "çiftten" : ""} açtı`}
        </div>
        {last && <TileFace tile={last} okey={g.okey} small />}
      </div>
    );
  };

  const status = g.phase === "roundOver"
    ? "El bitti"
    : myTurn
      ? g.phase === "draw"
        ? "Sıra sende: ortadan ya da soldan taş çek."
        : is101
          ? "Sıra sende: açabilir, işleyebilir ya da bir taş atabilirsin."
          : "Sıra sende: bir taş at ya da elin bittiyse bitir."
      : `${nameOf(room, g.seats[g.turn].id)} oynuyor…`;

  return (
    <div className="okey">
      <div className="okey-top">
        <span>
          El {g.round}/{g.totalRounds}
        </span>
        <span>
          Okey: <strong>{COLOR_NAMES[g.okey.color]} {g.okey.value}</strong>
        </span>
      </div>

      <div className="okey-board">
        {opponent(seatAt(2), "top")}
        {opponent(leftSeat, "left")}
        {opponent(seatAt(1), "right")}
        <div className="okey-center">
          <div className="pile-group">
            <span className="small muted">Gösterge</span>
            <TileFace tile={g.indicator} small />
          </div>
          <button className="pile" disabled={!myTurn || g.phase !== "draw"} onClick={() => send({ type: "drawCenter" })}>
            <span className="pile-count">{g.centerCount}</span>
            <span className="small">Ortadan çek</span>
          </button>
          <div className="pile-group">
            <span className="small muted">Soldan al</span>
            {leftDiscard ? (
              <TileFace tile={leftDiscard} okey={g.okey} onClick={myTurn && g.phase === "draw" ? () => send({ type: "drawDiscard" }) : undefined} />
            ) : (
              <div className="tile empty" />
            )}
          </div>
        </div>
      </div>

      {is101 && g.table.length > 0 && (
        <div className="okey-table">
          {g.table.map((m) => (
            <button key={m.id} className="meld" onClick={() => addTo(m.id)} disabled={!myTurn || selected.size === 0 || m.kind === "pair"} title={nameOf(room, m.owner)}>
              {m.tiles.map((t) => (
                <TileFace key={t.id} tile={t} okey={g.okey} small />
              ))}
            </button>
          ))}
        </div>
      )}

      {g.phase === "roundOver" && g.lastRound && (
        <div className="round-over">
          <div className="stack">
            <h3>{g.gameOver ? "Oyun bitti" : "El bitti"}</h3>
            <p>{g.lastRound.note}</p>
            {g.lastRound.winningHand && g.lastRound.winningHand.length > 0 && (
              <div className="tile-row">
                {g.lastRound.winningHand.map((t) => (
                  <TileFace key={t.id} tile={t} okey={g.okey} small />
                ))}
              </div>
            )}
            {g.gameOver && <h3>Kazanan: {winnerName(room, g)}</h3>}
            {!g.gameOver &&
              (room.hostId === room.you ? (
                <button className="primary" onClick={() => send({ type: "nextRound" })}>
                  Sonraki el
                </button>
              ) : (
                <p className="muted">Oda sahibinin yeni eli başlatması bekleniyor…</p>
              ))}
          </div>
        </div>
      )}
      <div className={`okey-status ${myTurn ? "mine" : ""}`}>{status}</div>

      <div className="rack" onDragOver={(e) => e.preventDefault()}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const id = synced[i];
          const tile = id !== null && id !== undefined ? tileById.get(id) : undefined;
          return (
            <div
              key={i}
              className={`slot ${i % ROW === ROW - 1 ? "row-end" : ""}`}
              onClick={() => !tile && moveSelectedTo(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dragged = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isFinite(dragged)) moveSelectedTo(i, selected.has(dragged) ? selectedIds : [dragged]);
              }}
            >
              {tile && <TileFace tile={tile} okey={g.okey} selected={selected.has(tile.id)} onClick={() => toggle(tile.id)} />}
            </div>
          );
        })}
      </div>
      <p className="muted small center">Taşa dokunup seç, sonra boş bir yuvaya dokunarak taşı. Bilgisayarda sürükleyebilirsin.</p>

      <div className="okey-actions">
        <button onClick={() => setSlots(arrangeRuns(g.hand, g.okey))}>Seri diz</button>
        <button onClick={() => setSlots(arrangePairs(g.hand, g.okey))}>Çift diz</button>
        {myTurn && g.phase === "discard" && (
          <>
            {is101 && g.mustUseTileId !== null && <button onClick={() => send({ type: "returnDiscard" })}>Aldığımı geri koy</button>}
            {is101 && !g.opened[mySeat] && (
              <button className="success" disabled={selected.size === 0} onClick={() => lay("open")}>
                Elimi aç
              </button>
            )}
            {is101 && g.opened[mySeat] && (
              <button className="success" disabled={selected.size === 0} onClick={() => lay("layMelds")}>
                Yere koy
              </button>
            )}
            {!is101 && (
              <button className="success" disabled={single === null} onClick={() => discard(true)}>
                Bitir
              </button>
            )}
            <button className="primary" disabled={single === null} onClick={() => discard(false)}>
              Taşı at
            </button>
          </>
        )}
      </div>
      {is101 && myTurn && g.phase === "discard" && (
        <p className="muted small center">
          Açmak için taşları seç; ıstakada aralarında boşluk olan taşlar ayrı grup sayılır. İşlemek için taş seçip masadaki gruba dokun.
        </p>
      )}

      {myDiscard && (
        <div className="row center small muted">
          Son attığın: <TileFace tile={myDiscard} okey={g.okey} small />
        </div>
      )}

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
