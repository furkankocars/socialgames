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
      <section>
        <h4>Oda kodu</h4>
        <div className="code-display">{room.code}</div>
        <button onClick={share}>Davet linkini paylaş</button>

        <h4 style={{ marginTop: "2rem" }}>Masadakiler · {room.players.length}</h4>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <span className={`dot ${p.connected ? "on" : ""}`} title={p.connected ? "Bağlı" : "Bağlantı koptu"} />
              <span className="grow">
                {p.name}
                {p.id === room.you && <span className="muted"> (sen)</span>}
              </span>
              {p.id === room.hostId && <span className="tag">oda sahibi</span>}
              {isHost && p.id !== room.you && (
                <button className="ghost small" onClick={() => confirm(`${p.name} odadan çıkarılsın mı?`) && act(request("room:kick", { playerId: p.id }))}>
                  Çıkar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Ne oynuyoruz?</h4>
        <ul className="game-choices">
          {GAMES.map((g) => (
            <li key={g.id}>
              <button
                className={`game-choice ${g.id === room.selectedGame ? "selected" : ""}`}
                disabled={!isHost}
                aria-pressed={g.id === room.selectedGame}
                onClick={() => act(request("room:selectGame", { gameId: g.id }))}
              >
                <span className="radio" />
                <strong>{g.name}</strong>
                <span className="small muted">{g.minPlayers === g.maxPlayers ? `${g.minPlayers} kişi` : `${g.minPlayers}–${g.maxPlayers} kişi`}</span>
                <span className="desc">{g.description}</span>
              </button>
            </li>
          ))}
        </ul>

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
          <p className="muted">Oyunu oda sahibi seçip başlatacak.</p>
        )}
      </section>
    </div>
  );
}
