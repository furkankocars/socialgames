import { useState } from "react";
import { GAMES } from "../../shared/protocol";
import { request, saveName, savedName } from "./socket";
import { useAct, useToast } from "./toast";

export function Home() {
  const initialCode = new URLSearchParams(location.search).get("oda")?.toUpperCase() ?? "";
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(initialCode);
  const act = useAct();
  const toast = useToast();

  const withName = (fn: (name: string) => void) => {
    const trimmed = name.trim();
    if (!trimmed) return toast("Önce bir isim yaz.");
    saveName(trimmed);
    fn(trimmed);
  };

  return (
    <div className="home">
      <h1>🎲 Sosyal Oyunlar</h1>
      <p className="muted">Arkadaşlarınla bir oda aç, kodu paylaş, birlikte oynayın.</p>

      <div className="card stack">
        <label>
          İsmin
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Örn. Furkan" autoFocus={!name} />
        </label>

        {initialCode ? null : (
          <button className="primary" onClick={() => withName((n) => act(request("room:create", { name: n })))}>
            Yeni oda aç
          </button>
        )}

        <div className="join-row">
          <input
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Oda kodu"
            className="code-input"
          />
          <button
            className={initialCode ? "primary" : ""}
            onClick={() =>
              withName(async (n) => {
                const res = await act(request("room:join", { code, name: n }));
                if (res.ok) history.replaceState(null, "", "/");
              })
            }
          >
            Katıl
          </button>
        </div>
      </div>

      <div className="game-list">
        {GAMES.map((g) => (
          <div key={g.id} className="game-chip">
            <strong>{g.name}</strong>
            <span className="muted small">{g.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
