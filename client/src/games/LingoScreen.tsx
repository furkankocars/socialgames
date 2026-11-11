import { useEffect, useMemo, useRef, useState } from "react";
import "./lingo.css";
import type { RoomView } from "../../../shared/protocol";
import type { LingoAction, LingoMark, LingoView } from "../../../shared/games/lingo";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf, useCountdown } from "../hooks";
import { GameLayout } from "../GameLayout";
import { Avatar } from "../Avatar";
import { buzz, chime, clack, success } from "../sound";

/** A Turkish Q keyboard without the letters Turkish words never use. */
const KEYS = ["ertyuıopğü", "asdfghjklşi", "zcvbnmöç"].map((row) => [...row]);
const LETTER = /^[abcçdefgğhıijklmnoöprsştuüvyz]$/;
const RANK: Record<LingoMark, number> = { miss: 1, near: 2, hit: 3 };

const up = (s: string) => s.toLocaleUpperCase("tr");

const MARK_NAME: Record<LingoMark, string> = { hit: "yerinde", near: "var, yeri yanlış", miss: "yok" };

export function LingoScreen({ room }: { room: RoomView }) {
  const g = room.game as LingoView;
  const act = useAct();
  const send = (action: LingoAction) => act(request("game:action", action));
  const isHost = room.hostId === room.you;
  const myTurn = g.phase === "play" && g.turn === room.you;
  // The letters typed after the given first one.
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const nudge = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };
  const turnKey = `${g.round}-${g.phase}-${g.rows.length}-${g.turn}`;
  const turnEndsAt = useMemo(() => (g.turnMsLeft === null ? null : Date.now() + g.turnMsLeft), [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextAt = useMemo(() => (g.nextMsLeft === null ? null : Date.now() + g.nextMsLeft), [g.round, g.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = useCountdown(turnEndsAt);
  const nextLeft = useCountdown(nextAt);
  const ids = g.order.filter((id) => room.players.some((p) => p.id === id));

  // Players often type the whole word, given letter included: the first press of that letter is taken as it.
  const firstTaken = useRef(false);
  useEffect(() => {
    setDraft("");
    firstTaken.current = false;
  }, [turnKey]);
  useEffect(() => {
    if (g.phase === "play") chime();
    else if (g.solver === room.you) success();
    else buzz();
  }, [g.phase, g.round]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (myTurn) chime();
  }, [myTurn, g.rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // The table watches the letters as they are typed.
  useEffect(() => {
    if (myTurn) void request("game:action", { type: "draft", word: draft });
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Letters the board has shown so far, for the keyboard.
  const keyMarks = useMemo(() => {
    const best = new Map<string, LingoMark>();
    for (const row of g.rows)
      [...(row.word ?? "")].forEach((c, i) => {
        const m = row.marks[i];
        if (!best.has(c) || RANK[m] > RANK[best.get(c)!]) best.set(c, m);
      });
    return best;
  }, [g.rows]);

  // Letters found in place so far, shown faintly in the row being typed, as on the show.
  const known = useMemo(() => {
    const k: (string | null)[] = Array.from({ length: g.length }, (_, i) => (i === 0 ? g.first : null));
    for (const row of g.rows) [...(row.word ?? "")].forEach((c, i) => row.marks[i] === "hit" && (k[i] = c));
    return k;
  }, [g.rows, g.length, g.first]);

  const submit = async () => {
    if (!myTurn || busy) return;
    if ([...draft].length < g.length - 1) {
      nudge();
      return;
    }
    setBusy(true);
    const res = await send({ type: "guess", word: g.first + draft });
    setBusy(false);
    if (res.ok) {
      setDraft("");
      firstTaken.current = false;
    }
    else nudge();
  };

  const press = (key: string) => {
    if (!myTurn) return;
    if (key === "enter") void submit();
    else if (key === "back") setDraft((d) => [...d].slice(0, -1).join(""));
    else if (!draft && key === g.first && !firstTaken.current) {
      firstTaken.current = true;
      clack(0.4);
    } else if ([...draft].length < g.length - 1) {
      clack(0.4);
      setDraft((d) => d + key);
    }
  };

  // Typing on a real keyboard, unless the player is writing in the chat.
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || target?.closest("input, textarea, [contenteditable]")) return;
      const key = e.key === "Enter" ? "enter" : e.key === "Backspace" ? "back" : e.key.toLocaleLowerCase("tr");
      if (key !== "enter" && key !== "back" && !LETTER.test(key)) return;
      e.preventDefault();
      pressRef.current(key);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const playing = g.phase === "play" && g.turn !== null;
  const rows = Array.from({ length: g.tries }, (_, r) => {
    const row = g.rows[r];
    if (row) return <Row key={r} who={row.by} name={nameOf(room, row.by)} letters={[...(row.word ?? "")]} marks={row.marks} lost={row.word === null} length={g.length} />;
    if (playing && r === g.rows.length) {
      const typed = [g.first, ...(myTurn ? draft : g.draft)];
      return <Row key={r} who={g.turn!} name={nameOf(room, g.turn)} letters={typed} ghosts={known} length={g.length} current shake={shake && myTurn} />;
    }
    return <Row key={r} letters={[]} length={g.length} />;
  });

  const over = g.phase !== "play";
  let title: string;
  let hint: string;
  if (!over) {
    title = `${up(g.first)} ile başlayan ${g.length} harfli kelime`;
    const rowsLeft = g.tries - g.rows.length;
    if (myTurn) hint = `Sıra sende. Yazdıkların herkese görünüyor. Tahtada ${rowsLeft} satır kaldı.`;
    else hint = `Sıra ${nameOf(room, g.turn)} oyuncusunda; yazdıklarını canlı izliyorsun. Tahtada ${rowsLeft} satır kaldı.`;
  } else {
    title = up(g.word ?? "");
    hint = g.solver ? `${g.solver === room.you ? "Sen" : nameOf(room, g.solver)} ${g.rows.length}. satırda buldu, +${g.points} puan.` : "Bu kelimeyi kimse bulamadı.";
  }

  const stage = (
    <div className="lingo">
      <div className={`lingo-table phase-${g.phase}`}>
        <header className="lingo-head">
          <div>
            <span className="lingo-kicker">
              {g.phase === "finished" ? "Oyun bitti" : `${g.round}. tur / ${g.rounds}`} · {g.length} harf
            </span>
            <h2>{title}</h2>
            <p>{hint}</p>
          </div>
          {turnEndsAt && <span className={`lingo-clock ${left <= 5 ? "low" : ""}`}>{left}</span>}
        </header>
        <ol className="turns" aria-label="Sıra">
          {ids.map((id) => (
            <li key={id} className={`turn-seat ${id === g.turn ? "on" : ""} ${id === g.solver ? "solved" : ""}`} aria-current={id === g.turn ? "true" : undefined}>
              <Avatar id={id} name={nameOf(room, id)} size={30} />
              <span className="turn-text">
                <span className="turn-name">{id === room.you ? "Sen" : nameOf(room, id)}</span>
                <span className="turn-state">{id === g.turn ? (id === room.you ? "sıra sende" : "yazıyor") : `${g.scores[id]} puan`}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="lingo-board">
          <div className="lingo-grid" style={{ "--len": g.length } as React.CSSProperties} aria-label="Ortak tahta" aria-live="polite">
            {rows}
          </div>
          {over ? (
            <div className="lingo-after">
              {g.phase === "result" &&
                (isHost ? (
                  <button className="chunky success wide" onClick={() => send({ type: "next" })}>
                    Sonraki tur ({nextLeft})
                  </button>
                ) : (
                  <p className="lingo-foot">Sonraki tur {nextLeft} saniye içinde başlıyor.</p>
                ))}
              {g.phase === "finished" && <p className="lingo-foot">{standings(g, room)}</p>}
            </div>
          ) : (
            <div className={`keyboard ${myTurn ? "" : "waiting"}`}>
              {KEYS.map((row, i) => (
                <div className="kb-row" key={i}>
                  {i === 2 && (
                    <button className="kb-key kb-wide" onClick={() => press("back")} disabled={!myTurn} aria-label="Sil">
                      Sil
                    </button>
                  )}
                  {row.map((k) => (
                    <button key={k} className={`kb-key ${keyMarks.get(k) ?? ""}`} onClick={() => press(k)} disabled={!myTurn}>
                      {up(k)}
                    </button>
                  ))}
                  {i === 2 && (
                    <button className="kb-key kb-wide kb-enter" onClick={() => press("enter")} disabled={!myTurn || busy}>
                      Dene
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const ranked = [...ids].sort((a, b) => g.scores[b] - g.scores[a]);
  const scores = (
    <div className="lingo-scores">
      <table className="score-table">
        <tbody>
          {ranked.map((id) => (
            <tr key={id} className={id === room.you ? "me" : ""}>
              <td>{nameOf(room, id)}</td>
              <td className="num">{g.scores[id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Kelimeyi bulan, bulduğu satıra göre 6, 5, 4, 3, 2 ya da 1 puan alır.</p>
      <ol className="lingo-log">
        {g.log
          .slice()
          .reverse()
          .map((e, i) => (
            <li key={g.log.length - i}>{e}</li>
          ))}
      </ol>
    </div>
  );

  return <GameLayout room={room} stage={stage} panels={[{ id: "scores", label: "Puanlar", content: scores }]} className="lingo-play" />;
}

/** One row of letter squares, with who played it; marks turn them green, yellow or dark. */
function Row({
  who,
  name,
  letters,
  marks,
  ghosts,
  length,
  lost = false,
  current = false,
  shake = false,
}: {
  who?: string;
  name?: string;
  letters: string[];
  marks?: LingoMark[];
  ghosts?: (string | null)[];
  length: number;
  lost?: boolean;
  current?: boolean;
  shake?: boolean;
}) {
  return (
    <div className={`lingo-row ${current ? "current" : ""} ${lost ? "lost" : ""} ${shake ? "shake" : ""}`} aria-label={lost ? `${name}: süre doldu` : undefined}>
      <span className="row-who" title={name}>
        {who && name && <Avatar id={who} name={name} size={22} />}
      </span>
      {Array.from({ length }, (_, i) => {
        const m = marks?.[i];
        const c = letters[i];
        const ghost = !c && ghosts?.[i];
        return (
          <span
            key={i}
            className={`cell ${m ?? ""} ${c ? "filled" : ""} ${ghost ? "ghost" : ""}`}
            style={m ? ({ "--i": i } as React.CSSProperties) : undefined}
            aria-label={c ? `${up(c)}${m ? `, ${MARK_NAME[m]}` : ""}` : undefined}
          >
            <span className="cell-letter">{c ? up(c) : ghost ? up(ghost) : ""}</span>
          </span>
        );
      })}
      {lost && <span className="row-lost">süre doldu</span>}
    </div>
  );
}

function standings(g: LingoView, room: RoomView): string {
  const best = Math.max(...Object.values(g.scores));
  const leaders = Object.keys(g.scores).filter((id) => g.scores[id] === best);
  return `${leaders.map((id) => nameOf(room, id)).join(", ")} ${best} puanla ${leaders.length > 1 ? "birinci oldular" : "birinci oldu"}.`;
}
