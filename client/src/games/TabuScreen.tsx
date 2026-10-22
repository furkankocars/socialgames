import { useEffect, useRef } from "react";
import "./tabu.css";
import type { RoomView } from "../../../shared/protocol";
import type { TabuAction, TabuView } from "../../../shared/games/tabu";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf, useCountdown } from "../hooks";
import { Avatar } from "../Avatar";
import { buzz, chime, success, tick } from "../sound";
import { GameLayout } from "../GameLayout";

const TEAM_NAMES = ["Kırmızı Takım", "Mavi Takım"];

/** Seconds left drawn as a draining ring. */
function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const low = seconds <= 10;
  return (
    <div className={`timer-ring ${low ? "low" : ""}`} role="timer" aria-label={`${seconds} saniye`}>
      <svg viewBox="0 0 64 64">
        <circle className="ring-track" cx="32" cy="32" r={r} />
        <circle className="ring-fill" cx="32" cy="32" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - seconds / total)} />
      </svg>
      <span key={low ? seconds : "n"}>{seconds}</span>
    </div>
  );
}

export function TabuScreen({ room }: { room: RoomView }) {
  const g = room.game as TabuView;
  const panels = [
    {
      id: "turn",
      label: g.phase === "turn" ? "Bu tur" : "Son tur",
      content: <TurnLog g={g} />,
    },
  ];
  return <GameLayout room={room} stage={<TabuStage room={room} />} panels={panels} />;
}

/** Words of the current or last turn and how each went. */
function TurnLog({ g }: { g: TabuView }) {
  if (g.log.length === 0) return <p className="muted small">Tur başlayınca anlatılan kelimeler burada sırayla görünür.</p>;
  const count = (r: string) => g.log.filter((l) => l.result === r).length;
  return (
    <div className="turn-log">
      <p className="small muted">
        {count("correct")} doğru · {count("taboo")} tabu · {count("pass")} pas
      </p>
      <ul className="tabu-log">
        {g.log.map((l, i) => (
          <li key={i} className={l.result}>
            {l.word}
            <span>{l.result === "correct" ? "doğru" : l.result === "pass" ? "pas" : "tabu"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabuStage({ room }: { room: RoomView }) {
  const g = room.game as TabuView;
  const act = useAct();
  const send = (action: TabuAction) => act(request("game:action", action));
  const secondsLeft = useCountdown(g.turnEndsAt);
  const me = room.you;
  const myTeam = g.teams[0].includes(me) ? 0 : g.teams[1].includes(me) ? 1 : null;
  const isNarrator = g.narratorId === me;
  const isHost = room.hostId === me;
  const narratorName = nameOf(room, g.narratorId);

  // Sounds for what just happened on the card, and a tick for the last seconds.
  const logLength = useRef(g.log.length);
  useEffect(() => {
    if (g.log.length > logLength.current) {
      const last = g.log[g.log.length - 1];
      if (last.result === "correct") success();
      else if (last.result === "taboo") buzz();
    }
    logLength.current = g.log.length;
  }, [g.log]);
  useEffect(() => {
    if (g.phase === "turn" && secondsLeft > 0 && secondsLeft <= 5) tick();
  }, [secondsLeft, g.phase]);
  useEffect(() => {
    if (g.phase === "ready" && isNarrator) chime();
  }, [g.phase, isNarrator]);

  const scoreboard = (
    <div className="tabu-scores">
      {[0, 1].map((t) => {
        const active = g.activeTeam === t && (g.phase === "turn" || g.phase === "ready");
        return (
          <div key={t} className={`team-plate team-${t} ${active ? "active" : ""} ${myTeam === t ? "mine" : ""}`}>
            <div className="plate-head">
              <span className="team-name">{TEAM_NAMES[t]}</span>
              {active && <span className="plate-tag">anlatıyor</span>}
            </div>
            <span key={g.scores[t]} className="team-score">
              {g.scores[t]}
              <span className="score-unit">puan</span>
            </span>
            <div className="plate-members">
              {g.teams[t].map((id) => (
                <span key={id} className="member" title={nameOf(room, id)}>
                  <Avatar id={id} name={nameOf(room, id)} size={24} className={id === g.narratorId && active ? "speaking" : ""} />
                  <span className="member-name">{nameOf(room, id)}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (g.phase === "setup") {
    return (
      <div className="tabu">
        {scoreboard}
        <div className="tabu-stage">
          <p className="stage-lead">Takımlar rastgele dağıtıldı. İsteyen kendi takımını değiştirebilir.</p>
          <button className="chunky plain" onClick={() => send({ type: "switchTeam" })}>
            Takımımı değiştir
          </button>
          {isHost && (
            <div className="row stage-actions">
              <button className="chunky plain grow" onClick={() => send({ type: "shuffleTeams" })}>
                Karıştır
              </button>
              <button className="chunky primary grow" onClick={() => send({ type: "begin" })}>
                Oyunu başlat
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (g.phase === "finished") {
    const [a, b] = g.scores;
    const winner = a === b ? null : a > b ? 0 : 1;
    return (
      <div className="tabu">
        <div className={`tabu-result ${winner === null ? "" : `team-${winner}`}`}>
          <span className="result-label">Oyun bitti</span>
          <h2>{winner === null ? "Berabere" : `${TEAM_NAMES[winner]} kazandı`}</h2>
          <span className="result-score">
            {a} – {b}
          </span>
        </div>
        {scoreboard}
        <p className="muted">Oda sahibi lobiye dönüp yeni oyun açabilir.</p>
      </div>
    );
  }

  if (g.phase === "ready") {
    return (
      <div className="tabu">
        {scoreboard}
        <div className={`tabu-stage team-${g.activeTeam}`}>
          <span className="stage-round">
            Tur {g.round}/{g.totalRounds} · {TEAM_NAMES[g.activeTeam]}
          </span>
          {g.narratorId && <Avatar id={g.narratorId} name={narratorName} size={72} className="stage-avatar" />}
          <h3>{isNarrator ? "Sıra sende" : `Anlatıcı: ${narratorName}`}</h3>
          <p className="muted">{isNarrator ? "Kartı sadece sen ve rakip takım göreceksiniz." : "Anlatıcının başlatması bekleniyor…"}</p>
          {isNarrator && (
            <button className="chunky success big" onClick={() => send({ type: "startTurn" })}>
              Hazırım, başlat ({g.roundSeconds} sn)
            </button>
          )}
        </div>
      </div>
    );
  }

  const opposing = myTeam !== null && myTeam !== g.activeTeam;
  const correctCount = g.log.filter((l) => l.result === "correct").length;
  return (
    <div className="tabu playing">
      {scoreboard}
      <div className="turn-bar">
        <span className="turn-meta">
          Tur {g.round}/{g.totalRounds}
          <br />
          <strong>{narratorName}</strong> anlatıyor
        </span>
        <TimerRing seconds={secondsLeft} total={g.roundSeconds} />
        <span className="turn-meta right">
          Bu tur
          <br />
          <strong>{correctCount} doğru</strong>
        </span>
      </div>
      <div className="card-table">
        {g.card ? (
          <div key={g.card.word} className={`tabu-card team-${g.activeTeam}`}>
            <div className="tabu-word">{g.card.word}</div>
            <span className="taboo-label">Yasaklı kelimeler</span>
            <ul>
              {g.card.taboo.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div key={g.log.length} className="tabu-card back">
            <span className="back-mark">TABU</span>
            <strong>Tahmin et</strong>
            <span>{narratorName} anlatıyor, kart sana görünmez.</span>
          </div>
        )}
      </div>
      {isNarrator && (
        <div className="tabu-actions">
          <button className="chunky danger" onClick={() => send({ type: "taboo" })}>
            Tabu
          </button>
          <button className="chunky plain" disabled={g.passesLeft === 0} onClick={() => send({ type: "pass" })}>
            {g.passesLeft === null ? "Pas" : `Pas (${g.passesLeft})`}
          </button>
          <button className="chunky success big" onClick={() => send({ type: "correct" })}>
            Doğru
          </button>
        </div>
      )}
      {opposing && (
        <button className="chunky danger big wide tabu-buzz" onClick={() => send({ type: "taboo" })}>
          Tabu: yasaklı kelime söylendi
        </button>
      )}
    </div>
  );
}
