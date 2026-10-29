import { useEffect, useMemo, useRef, useState } from "react";
import "./lingo.css";
import type { RoomView } from "../../../shared/protocol";
import type { LingoAction, LingoBoard, LingoMark, LingoView } from "../../../shared/games/lingo";
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
  const mine = g.boards[room.you];
  const playing = g.phase === "play" && !!mine && !mine.done;
  // The letters typed after the given first one.
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const nudge = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };
  const roundEndsAt = useMemo(() => (g.roundMsLeft === null ? null : Date.now() + g.roundMsLeft), [g.round, g.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextAt = useMemo(() => (g.nextMsLeft === null ? null : Date.now() + g.nextMsLeft), [g.round, g.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = useCountdown(roundEndsAt);
  const nextLeft = useCountdown(nextAt);
  const ids = room.players.filter((p) => g.boards[p.id]).map((p) => p.id);
  const rivals = ids.filter((id) => id !== room.you);

  useEffect(() => setDraft(""), [g.round]);
  useEffect(() => {
    if (g.phase === "play") chime();
    else if (mine?.solved) success();
    else buzz();
  }, [g.phase, g.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Letters this player has learned about, for the keyboard.
  const keyMarks = useMemo(() => {
    const best = new Map<string, LingoMark>();
    for (const row of mine?.rows ?? [])
      [...(row.word ?? "")].forEach((c, i) => {
        const m = row.marks[i];
        if (!best.has(c) || RANK[m] > RANK[best.get(c)!]) best.set(c, m);
      });
    return best;
  }, [mine]);

  // Letters found in place so far, shown faintly in the row being typed, as on the show.
  const known = useMemo(() => {
    const k: (string | null)[] = Array.from({ length: g.length }, (_, i) => (i === 0 ? g.first : null));
    for (const row of mine?.rows ?? []) [...(row.word ?? "")].forEach((c, i) => row.marks[i] === "hit" && (k[i] = c));
    return k;
  }, [mine, g.length, g.first]);

  const submit = async () => {
    if (!playing || busy) return;
    if (draft.length < g.length - 1) {
      nudge();
      return;
    }
    setBusy(true);
    const res = await send({ type: "guess", word: g.first + draft });
    setBusy(false);
    if (res.ok) setDraft("");
    else nudge();
  };

  const press = (key: string) => {
    if (!playing) return;
    if (key === "enter") void submit();
    else if (key === "back") setDraft((d) => [...d].slice(0, -1).join(""));
    else if ([...draft].length < g.length - 1) {
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

  const rows = Array.from({ length: g.tries }, (_, r) => {
    const row = mine?.rows[r];
    if (row) return <Row key={r} letters={[...(row.word ?? "")]} marks={row.marks} length={g.length} />;
    if (playing && r === mine.rows.length) {
      const typed = [g.first, ...draft];
      return <Row key={r} letters={typed} ghosts={known} length={g.length} current shake={shake} />;
    }
    return <Row key={r} letters={[]} length={g.length} />;
  });

  const over = g.phase !== "play";
  let title: string;
  let hint: string;
  if (!over) {
    title = `${up(g.first)} ile başlayan ${g.length} harfli kelime`;
    if (mine?.solved) hint = `Buldun, +${mine.points} puan. Diğerleri bekleniyor.`;
    else if (mine?.done) hint = "Denemelerin bitti. Diğerleri bekleniyor.";
    else if (mine?.rows.length) hint = `${g.tries - mine.rows.length} deneme hakkın kaldı.`;
    else hint = `${g.tries} deneme hakkın var. Yeşil kare yerinde, sarı kare kelimede var ama yeri yanlış.`;
  } else {
    const winners = ids.filter((id) => g.boards[id].place === 1);
    title = up(g.word ?? "");
    hint = winners.length ? `İlk ${nameOf(room, winners[0])} buldu.` : "Bu kelimeyi kimse bulamadı.";
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
          {roundEndsAt && <span className={`lingo-clock ${left <= 15 ? "low" : ""}`}>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>}
        </header>
        {rivals.length > 0 && (
          <ul className="rivals">
            {rivals.map((id) => (
              <li key={id}>
                <Rival name={nameOf(room, id)} id={id} board={g.boards[id]} tries={g.tries} length={g.length} />
              </li>
            ))}
          </ul>
        )}
        <div className="lingo-board">
          <div className="lingo-grid" style={{ "--len": g.length } as React.CSSProperties} aria-label="Tahminlerin">
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
            <div className="keyboard">
              {KEYS.map((row, i) => (
                <div className="kb-row" key={i}>
                  {i === 2 && (
                    <button className="kb-key kb-wide" onClick={() => press("back")} disabled={!playing} aria-label="Sil">
                      Sil
                    </button>
                  )}
                  {row.map((k) => (
                    <button key={k} className={`kb-key ${keyMarks.get(k) ?? ""}`} onClick={() => press(k)} disabled={!playing}>
                      {up(k)}
                    </button>
                  ))}
                  {i === 2 && (
                    <button className="kb-key kb-wide kb-enter" onClick={() => press("enter")} disabled={!playing || busy}>
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
      <p className="small muted">Bulduğun denemeye göre 5, 4, 3, 2 ya da 1 puan. Turda ilk bulan 2, ikinci bulan 1 puan daha alır.</p>
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

  const boards = (
    <div className="lingo-boards">
      <p className="small muted">{over ? "Herkesin bu turdaki tahminleri." : "Tur bitince herkesin tahmin ettiği kelimeler de görünür."}</p>
      {ids.map((id) => (
        <section key={id} className="board-card">
          <h4>
            {nameOf(room, id)}
            {id === room.you && " (sen)"}
            <span className="board-state">{boardState(g.boards[id])}</span>
          </h4>
          <div className="lingo-grid mini" style={{ "--len": g.length } as React.CSSProperties}>
            {g.boards[id].rows.map((row, r) => (
              <Row key={r} letters={[...(row.word ?? "")]} marks={row.marks} length={g.length} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <GameLayout
      room={room}
      stage={stage}
      panels={[
        { id: "scores", label: "Puanlar", content: scores },
        { id: "boards", label: "Tahminler", content: boards },
      ]}
      className="lingo-play"
    />
  );
}

/** One row of letter squares; marks turn them red, yellow or dark. */
function Row({
  letters,
  marks,
  ghosts,
  length,
  current = false,
  shake = false,
}: {
  letters: string[];
  marks?: LingoMark[];
  ghosts?: (string | null)[];
  length: number;
  current?: boolean;
  shake?: boolean;
}) {
  return (
    <div className={`lingo-row ${current ? "current" : ""} ${shake ? "shake" : ""}`}>
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
    </div>
  );
}

/** Another player's board as the show's scoreboard: just the colours, never the letters. */
function Rival({ id, name, board, tries, length }: { id: string; name: string; board: LingoBoard; tries: number; length: number }) {
  return (
    <div className={`rival ${board.solved ? "solved" : ""}`}>
      <Avatar id={id} name={name} size={30} />
      <span className="rival-text">
        <span className="rival-name">{name}</span>
        <span className="rival-state">{boardState(board)}</span>
      </span>
      <span className="rival-dots" style={{ "--len": length } as React.CSSProperties} aria-hidden>
        {Array.from({ length: tries }, (_, r) =>
          Array.from({ length }, (_, i) => <i key={`${r}-${i}`} className={board.rows[r]?.marks[i] ?? ""} />),
        )}
      </span>
    </div>
  );
}

function boardState(b: LingoBoard): string {
  if (b.solved) return b.place === 1 ? `ilk buldu, +${b.points}` : `buldu, +${b.points}`;
  if (b.done) return "bulamadı";
  return b.rows.length ? `${b.rows.length}. deneme` : "düşünüyor";
}

function standings(g: LingoView, room: RoomView): string {
  const best = Math.max(...Object.values(g.scores));
  const leaders = Object.keys(g.scores).filter((id) => g.scores[id] === best);
  return `${leaders.map((id) => nameOf(room, id)).join(", ")} ${best} puanla ${leaders.length > 1 ? "birinci oldular" : "birinci oldu"}.`;
}
