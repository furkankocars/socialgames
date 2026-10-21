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

  const join = () =>
    withName(async (n) => {
      if (code.trim().length !== 4) return toast("Oda kodu 4 karakter.");
      const res = await act(request("room:join", { code, name: n }));
      if (res.ok) history.replaceState(null, "", "/");
    });

  return (
    <div className="home">
      <h1>Sosyal Oyunlar</h1>
      <p className="home-intro">
        {initialCode ? `${initialCode} odasına davet edildin. İsmini yaz ve katıl.` : "Biri oda açar, kodu paylaşır, herkes kendi telefonundan katılır."}
      </p>

      <form
        className="home-form"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <label>
          İsmin
          <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Masada görünecek isim" autoFocus={!name} />
        </label>

        <label>
          Oda kodu
          <div className="join-row">
            <input
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              className="code-input"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <button type="submit" className={initialCode ? "primary" : ""}>
              Katıl
            </button>
          </div>
        </label>

        {!initialCode && (
          <>
            <div className="or">ya da</div>
            <button type="button" className="primary big" onClick={() => withName((n) => act(request("room:create", { name: n })))}>
              Yeni oda aç
            </button>
          </>
        )}
      </form>

      <h4>Masadaki oyunlar</h4>
      <ul className="menu">
        {GAMES.map((g) => (
          <li key={g.id}>
            <strong>{g.name}</strong>
            <span className="count">{g.minPlayers === g.maxPlayers ? `${g.minPlayers} kişi` : `${g.minPlayers}–${g.maxPlayers} kişi`}</span>
            <span className="desc">{g.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
