import { useState } from "react";
import { GAMES } from "../../shared/protocol";
import { request, saveName, savedName } from "./socket";
import { useAct, useToast } from "./toast";
import { GameEmblem } from "./GameEmblem";
import { BrandMark } from "./BrandMark";
import { guideHref } from "./Guide";
import { Credit } from "./Credit";

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
      <header className="home-bar">
        <BrandMark />
        <span className="brand">Sosyal Oyunlar</span>
      </header>

      <div className="home-grid">
        <div className="home-door">
          <h1>{initialCode ? "Masada yerin hazır." : "Arkadaş masası kuruldu."}</h1>
          <p className="home-intro">
            {initialCode
              ? `${initialCode} odasına çağrıldın. İsmini yaz, otur.`
              : "Biri oda açar, dört harfli kodu gruba atar, herkes kendi telefonundan oturur. Üye olmak yok, indirmek yok."}
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

            {!initialCode && (
              <button type="button" className="primary big" onClick={() => withName((n) => act(request("room:create", { name: n })))}>
                Yeni oda aç
              </button>
            )}

            <div className="or">{initialCode ? "oda kodu" : "ya da koda katıl"}</div>

            <div className="join-row">
              <input
                value={code}
                maxLength={4}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                className="code-input"
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="Oda kodu"
              />
              <button type="submit" className={initialCode ? "primary" : ""}>
                Katıl
              </button>
            </div>
          </form>
        </div>

        <section className="menu-board" aria-labelledby="menu-title">
          <h2 id="menu-title">Bu masada oynananlar</h2>
          <ul className="menu">
            {GAMES.map((g) => (
              <li key={g.id}>
                <GameEmblem game={g.id} size={52} />
                <span className="menu-text">
                  <a className="menu-name" href={guideHref(g.id)}>
                    {g.name}
                  </a>
                  <span className="desc">{g.description}</span>
                </span>
                <span className="count">
                  {g.playerCounts ? g.playerCounts.join(" / ") : g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`} kişi
                </span>
              </li>
            ))}
          </ul>
          <p className="menu-foot">
            Oyunun adına dokunursan nasıl oynandığı ekran görüntüleriyle anlatılır. Eksik koltuğa bot oturtulabilir; Tabu ve Casus hariç.{" "}
            <a className="text-link" href={guideHref()}>
              Masaya nasıl oturulur
            </a>
          </p>
        </section>
      </div>
      <Credit />
    </div>
  );
}
