import "./table-chat.css";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TREATS, type ChatEntry, type RoomView, type Treat } from "../../../shared/protocol";
import { request } from "../socket";
import { useAct } from "../toast";
import { clink, tick } from "../sound";
import { pointerDrag } from "../drag";

/** How long a sent drink stays on the receiver's seat. */
export const TREAT_SHOW_MS = 9000;

/** How a drink reads inside a sentence. */
const IN_SENTENCE: Record<Treat, string> = { cay: "çay", kahve: "Türk kahvesi", oralet: "oralet", soda: "soda" };

type Act = ReturnType<typeof useAct>;

/** Press-and-drag a drink onto a seat (that player) or the felt (whole table). */
function dragTreat(act: Act, treat: Treat) {
  return (e: ReactPointerEvent<HTMLElement>) =>
    pointerDrag(
      e,
      "[data-treat]",
      (target) => {
        const dest = target.dataset.treat!;
        void act(request("room:chat", { treat, to: dest === "table" ? null : dest }));
      },
      e.currentTarget.querySelector<HTMLElement>(".treat-icon") ?? e.currentTarget,
    );
}

/** A tray of drinks next to the table, close enough to drag onto a seat. */
export function TreatTray() {
  const act = useAct();
  return (
    <span className="treat-tray" aria-label="İkram">
      <span className="hud-label">İkram</span>
      {TREATS.map((t) => (
        <button
          key={t.id}
          className="tray-btn"
          onClick={() => act(request("room:chat", { treat: t.id, to: null }))}
          onPointerDown={dragTreat(act, t.id)}
          title={`${t.name}: bir oyuncunun üstüne sürükle, dokunursan bütün masaya`}
          aria-label={`${t.name} ısmarla`}
        >
          <TreatIcon treat={t.id} size={24} />
        </button>
      ))}
    </span>
  );
}

const TULIP_GLASS = "M7 4h10c-.5 4-2.5 5.5-2.5 7.5S16.5 15 16 18c-.2 1-1 1.5-4 1.5S8.2 19 8 18c-.5-3 1.5-4.5 1.5-6.5S7.5 8 7 4Z";
const TULIP_FILL = "M7.6 6.8h8.8c-.7 2.4-1.9 3.4-1.9 4.7 0 2 2 3.5 1.5 6.5-.2 1-1 1.5-4 1.5S8.2 19 8 18c-.5-3 1.5-4.5 1.5-6.5 0-1.3-1.2-2.3-1.9-4.7Z";

/** Small drawn drinks; no emoji, so they match the table on every phone. */
export function TreatIcon({ treat, size = 22 }: { treat: Treat; size?: number }) {
  return (
    <svg className={`treat-icon ${treat}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {(treat === "cay" || treat === "oralet") && (
        <>
          <ellipse cx="12" cy="20.6" rx="8" ry="1.6" className="saucer" />
          <path d={TULIP_FILL} className="drink" />
          <path d={TULIP_GLASS} className="glass" />
        </>
      )}
      {treat === "kahve" && (
        <>
          <path d="M9 6c-.8-.9.8-1.6 0-2.8M13 6c-.8-.9.8-1.6 0-2.8" className="steam" />
          <ellipse cx="12" cy="20" rx="8" ry="1.6" className="saucer" />
          <path d="M16 10.5c2.8 0 2.8 4 0 4" className="handle" />
          <path d="M6 9h10v4c0 3-2 5-5 5s-5-2-5-5V9Z" className="cup" />
          <ellipse cx="11" cy="9" rx="5" ry="1.1" className="drink" />
        </>
      )}
      {treat === "soda" && (
        <>
          <path d="M10 2.5h4V6c0 1 2 2 2 4v9c0 1-1 2-2 2h-4c-1 0-2-1-2-2v-9c0-2 2-3 2-4V2.5Z" className="bottle" />
          <rect x="8" y="12" width="8" height="4" className="label" />
          <circle cx="11" cy="9.5" r=".8" className="bubble" />
          <circle cx="13" cy="18" r=".7" className="bubble" />
        </>
      )}
    </svg>
  );
}

function Line({ entry, room }: { entry: ChatEntry; room: RoomView }) {
  if (entry.treat) {
    const to = entry.to ? (room.players.find((p) => p.id === entry.to)?.name ?? "ayrılan oyuncu") : null;
    const drink = IN_SENTENCE[entry.treat];
    return (
      <li className="chat-line treat">
        <TreatIcon treat={entry.treat} />
        <span>
          <strong>{entry.name}</strong>
          {entry.to && entry.to !== room.you ? ", " : " "}
          {entry.to === room.you ? (
            <>sana bir {drink} ısmarladı.</>
          ) : to ? (
            <>
              <strong>{to}</strong> için bir {drink} ısmarladı.
            </>
          ) : (
            <>bütün masaya {drink} ısmarladı.</>
          )}
        </span>
      </li>
    );
  }
  return (
    <li className={`chat-line ${entry.from === room.you ? "mine" : ""}`}>
      <strong>{entry.name}</strong> <span>{entry.text}</span>
    </li>
  );
}

/** Table chat with a quick row for sending tea and friends around the table. */
export function TableChat({ room }: { room: RoomView }) {
  const act = useAct();
  const [text, setText] = useState("");
  const [to, setTo] = useState<string>("");
  const log = useRef<HTMLOListElement>(null);
  const lastId = useRef(room.chat.at(-1)?.id ?? 0);
  const others = room.players.filter((p) => p.id !== room.you);

  useEffect(() => {
    const fresh = room.chat.filter((c) => c.id > lastId.current);
    lastId.current = room.chat.at(-1)?.id ?? lastId.current;
    if (fresh.some((c) => c.treat)) clink();
    else if (fresh.some((c) => c.from !== room.you)) tick();
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [room.chat, room.you]);

  // The picked person may have left the room.
  useEffect(() => {
    if (to && !others.some((p) => p.id === to)) setTo("");
  }, [others, to]);

  const sendText = async () => {
    if (!text.trim()) return;
    const res = await act(request("room:chat", { text }));
    if (res.ok) setText("");
  };

  return (
    <div className="table-chat">
      <ol className="chat-log" ref={log}>
        {room.chat.length === 0 && <li className="chat-line muted">Henüz kimse bir şey yazmadı. Bir çay ısmarlayarak başla.</li>}
        {room.chat.map((c) => (
          <Line key={c.id} entry={c} room={room} />
        ))}
      </ol>
      <div className="treat-row">
        <select className="treat-to" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Kime ısmarlansın">
          <option value="">Bütün masaya</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {TREATS.map((t) => (
          <button
            key={t.id}
            className="treat-btn"
            onClick={() => act(request("room:chat", { treat: t.id, to: to || null }))}
            onPointerDown={dragTreat(act, t.id)}
            title={`${t.name} ısmarla. Bir oyuncunun üstüne sürüklersen ona gider.`}
            aria-label={`${t.name} ısmarla`}
          >
            <TreatIcon treat={t.id} size={24} />
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void sendText();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={160} placeholder="Masaya yaz…" aria-label="Mesaj" />
        <button type="submit" className="primary" disabled={!text.trim()}>
          Gönder
        </button>
      </form>
    </div>
  );
}

/** How long a chat line stays in a bubble over the writer's seat. */
export const BUBBLE_SHOW_MS = 6000;

/**
 * What to show on each seat: a drink sent to that player (or the whole table)
 * and the line they last wrote, each for a few seconds. Timed by arrival on
 * this device, not the server clock.
 */
export function useSeatChat(room: RoomView): { treat: (playerId: string) => Treat | null; bubble: (playerId: string) => ChatEntry | null } {
  const [now, setNow] = useState(Date.now());
  const arrived = useRef<Map<number, number> | null>(null);
  if (!arrived.current) arrived.current = new Map(room.chat.map((c) => [c.id, 0]));
  const seen = arrived.current;
  for (const c of room.chat) if (!seen.has(c.id)) seen.set(c.id, Date.now());

  const latest = room.chat.at(-1)?.id;
  useEffect(() => {
    if (latest === undefined) return;
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), Math.max(TREAT_SHOW_MS, BUBBLE_SHOW_MS) + 50);
    const b = setTimeout(() => setNow(Date.now()), BUBBLE_SHOW_MS + 50);
    return () => {
      clearTimeout(t);
      clearTimeout(b);
    };
  }, [latest]);

  const recent = (c: ChatEntry, ms: number) => now - (seen.get(c.id) ?? 0) < ms;
  const newestFirst = [...room.chat].reverse();
  return {
    treat: (playerId) =>
      newestFirst.find((c) => c.treat && recent(c, TREAT_SHOW_MS) && (c.to === playerId || (c.to === null && c.from !== playerId)))?.treat ?? null,
    bubble: (playerId) => newestFirst.find((c) => c.text && c.from === playerId && recent(c, BUBBLE_SHOW_MS)) ?? null,
  };
}

/** The drink currently shown on each seat; for screens without chat bubbles. */
export function useSeatTreats(room: RoomView): (playerId: string) => Treat | null {
  return useSeatChat(room).treat;
}
