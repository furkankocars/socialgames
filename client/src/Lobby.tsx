import { useState } from "react";
import { GAMES, type GameId, type RoomView } from "../../shared/protocol";
import { request } from "./socket";
import { useAct, useToast } from "./toast";

interface Option {
  key: string;
  label: string;
  choices: number[];
  initial: number;
  suffix?: string;
}

const OPTIONS: Record<GameId, Option[]> = {
  tabu: [
    { key: "roundSeconds", label: "Tur süresi", choices: [45, 60, 90, 120], initial: 60, suffix: " sn" },
    { key: "rounds", label: "Tur sayısı (her takım)", choices: [1, 2, 3, 4, 5, 6], initial: 3 },
  ],
  vampir: [],
  okey: [{ key: "rounds", label: "El sayısı", choices: [1, 3, 5, 7, 9], initial: 5 }],
  okey101: [{ key: "rounds", label: "El sayısı", choices: [1, 2, 3, 4, 5], initial: 3 }],
};

export function Lobby({ room }: { room: RoomView }) {
  const act = useAct();
  const toast = useToast();
  const isHost = room.hostId === room.you;
  const selected = GAMES.find((g) => g.id === room.selectedGame)!;
  const [values, setValues] = useState<Record<string, number>>({});
  const connected = room.players.filter((p) => p.connected).length;

  const share = async () => {
    const url = `${location.origin}/?oda=${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Sosyal Oyunlar", text: `Odaya katıl: ${room.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Davet linki kopyalandı.");
      }
    } catch {
      // The user closed the share sheet.
    }
  };

  const start = () => {
    const options: Record<string, number> = {};
    for (const o of OPTIONS[room.selectedGame]) options[o.key] = values[o.key] ?? o.initial;
    act(request("room:start", { options }));
  };

  return (
    <div className="lobby">
      <section className="card">
        <div className="row spread">
          <h3>Oyuncular ({room.players.length})</h3>
          <button onClick={share}>Davet et</button>
        </div>
        <p className="muted small">
          Oda kodu: <strong className="mono">{room.code}</strong>
        </p>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <span className={`dot ${p.connected ? "on" : ""}`} />
              <span className="grow">
                {p.name}
                {p.id === room.you && <span className="muted"> (sen)</span>}
              </span>
              {p.id === room.hostId && <span title="Oda sahibi">👑</span>}
              {isHost && p.id !== room.you && (
                <button className="ghost small" onClick={() => confirm(`${p.name} odadan çıkarılsın mı?`) && act(request("room:kick", { playerId: p.id }))}>
                  Çıkar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Oyun</h3>
        <div className="game-grid">
          {GAMES.map((g) => (
            <button
              key={g.id}
              className={`game-option ${g.id === room.selectedGame ? "selected" : ""}`}
              disabled={!isHost}
              onClick={() => act(request("room:selectGame", { gameId: g.id }))}
            >
              <strong>{g.name}</strong>
              <span className="small">{g.description}</span>
              <span className="small muted">
                {g.minPlayers === g.maxPlayers ? `${g.minPlayers} kişi` : `${g.minPlayers}-${g.maxPlayers} kişi`}
              </span>
            </button>
          ))}
        </div>

        {isHost && OPTIONS[room.selectedGame].length > 0 && (
          <div className="options">
            {OPTIONS[room.selectedGame].map((o) => (
              <label key={o.key} className="row">
                <span className="grow">{o.label}</span>
                <select value={values[o.key] ?? o.initial} onChange={(e) => setValues({ ...values, [o.key]: Number(e.target.value) })}>
                  {o.choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                      {o.suffix}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {isHost ? (
          <button className="primary wide" onClick={start} disabled={connected < selected.minPlayers || connected > selected.maxPlayers}>
            {connected < selected.minPlayers
              ? `${selected.minPlayers - connected} oyuncu daha gerekli`
              : connected > selected.maxPlayers
                ? `En fazla ${selected.maxPlayers} kişi`
                : `${selected.name} başlat`}
          </button>
        ) : (
          <p className="muted center">Oda sahibinin oyunu başlatması bekleniyor…</p>
        )}
      </section>
    </div>
  );
}
