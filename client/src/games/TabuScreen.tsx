import type { RoomView } from "../../../shared/protocol";
import type { TabuAction, TabuView } from "../../../shared/games/tabu";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf, useCountdown } from "../hooks";

const TEAM_NAMES = ["Kırmızı Takım", "Mavi Takım"];

export function TabuScreen({ room }: { room: RoomView }) {
  const g = room.game as TabuView;
  const act = useAct();
  const send = (action: TabuAction) => act(request("game:action", action));
  const secondsLeft = useCountdown(g.turnEndsAt);
  const me = room.you;
  const myTeam = g.teams[0].includes(me) ? 0 : g.teams[1].includes(me) ? 1 : null;
  const isNarrator = g.narratorId === me;
  const isHost = room.hostId === me;

  const scoreboard = (
    <div className="tabu-scores">
      {[0, 1].map((t) => (
        <div key={t} className={`team team-${t} ${g.activeTeam === t && g.phase !== "setup" ? "active" : ""}`}>
          <div className="team-name">{TEAM_NAMES[t]}</div>
          <div className="team-score">{g.scores[t]}</div>
          <div className="small">{g.teams[t].map((id) => nameOf(room, id)).join(", ")}</div>
        </div>
      ))}
    </div>
  );

  if (g.phase === "setup") {
    return (
      <div className="stack">
        {scoreboard}
        <div className="card stack">
          <p>Takımları ayarlayın. Herkes kendi takımını değiştirebilir.</p>
          <button onClick={() => send({ type: "switchTeam" })}>Takımımı değiştir</button>
          {isHost && (
            <div className="row">
              <button className="grow" onClick={() => send({ type: "shuffleTeams" })}>
                Karıştır
              </button>
              <button className="primary grow" onClick={() => send({ type: "begin" })}>
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
    return (
      <div className="stack">
        {scoreboard}
        <div className="card center">
          <h2>{a === b ? "Berabere!" : `${TEAM_NAMES[a > b ? 0 : 1]} kazandı! 🎉`}</h2>
          <p className="muted">Oda sahibi lobiye dönüp yeni oyun açabilir.</p>
        </div>
      </div>
    );
  }

  const log = g.log.length > 0 && (
    <div className="card">
      <h4>{g.phase === "turn" ? "Bu tur" : "Son tur"}</h4>
      <ul className="tabu-log">
        {g.log.map((l, i) => (
          <li key={i} className={l.result}>
            {l.word} <span>{l.result === "correct" ? "✓" : l.result === "pass" ? "pas" : "tabu"}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (g.phase === "ready") {
    return (
      <div className="stack">
        {scoreboard}
        <div className="card center stack">
          <p className="muted">
            Tur {g.round}/{g.totalRounds} · {TEAM_NAMES[g.activeTeam]}
          </p>
          <h3>Anlatıcı: {nameOf(room, g.narratorId)}</h3>
          {isNarrator ? (
            <button className="primary big" onClick={() => send({ type: "startTurn" })}>
              Hazırım, başlat ({g.roundSeconds} sn)
            </button>
          ) : (
            <p className="muted">Anlatıcının başlatması bekleniyor…</p>
          )}
        </div>
        {log}
      </div>
    );
  }

  const opposing = myTeam !== null && myTeam !== g.activeTeam;
  return (
    <div className="stack">
      {scoreboard}
      <div className={`timer ${secondsLeft <= 10 ? "low" : ""}`}>{secondsLeft}</div>
      {g.card ? (
        <div className="tabu-card">
          <div className="tabu-word">{g.card.word}</div>
          <ul>
            {g.card.taboo.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="card center">
          <h3>Tahmin et!</h3>
          <p>{nameOf(room, g.narratorId)} anlatıyor.</p>
        </div>
      )}
      {isNarrator && (
        <div className="row">
          <button className="danger grow" onClick={() => send({ type: "taboo" })}>
            Tabu
          </button>
          <button className="grow" disabled={g.passesLeft === 0} onClick={() => send({ type: "pass" })}>
            Pas ({g.passesLeft})
          </button>
          <button className="success grow big" onClick={() => send({ type: "correct" })}>
            Doğru
          </button>
        </div>
      )}
      {opposing && (
        <button className="danger big" onClick={() => send({ type: "taboo" })}>
          Tabu! Yasaklı kelime söylendi
        </button>
      )}
      {log}
    </div>
  );
}
