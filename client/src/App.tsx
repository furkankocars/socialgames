import { GAMES } from "../../shared/protocol";
import { request, useConnection } from "./socket";
import { ToastProvider, useAct } from "./toast";
import { Home } from "./Home";
import { Lobby } from "./Lobby";
import { TabuScreen } from "./games/TabuScreen";
import { VampirScreen } from "./games/VampirScreen";
import { OkeyScreen } from "./games/OkeyScreen";
import { ChessScreen } from "./games/ChessScreen";
import { PistiScreen } from "./games/PistiScreen";
import { CasusScreen } from "./games/CasusScreen";
import { BatakScreen } from "./games/BatakScreen";
import { setSound, useSoundEnabled } from "./sound";
import { BrandMark } from "./BrandMark";
import { Guide, useGuideRoute } from "./Guide";

export function App() {
  return (
    <ToastProvider>
      <Main />
    </ToastProvider>
  );
}

function Main() {
  const { room, ready } = useConnection();
  const act = useAct();
  const sound = useSoundEnabled();
  const guide = useGuideRoute();

  // The guide needs no server, so it opens even while the connection wakes up.
  if (guide !== null) return <Guide game={guide} />;
  if (!ready) {
    return (
      <div className="center-screen">
        <BrandMark size={44} />
        <div className="loader" />
        <p>Sunucuya bağlanılıyor…</p>
        <p className="muted small">Bir süredir kimse girmediyse sunucunun uyanması bir dakika kadar sürebilir.</p>
      </div>
    );
  }
  if (!room) return <Home />;

  const isHost = room.hostId === room.you;
  const game = GAMES.find((g) => g.id === room.selectedGame)!;

  const playing = room.status === "playing";
  return (
    <div className={`app ${playing ? "is-playing" : ""}`}>
      <header className="topbar">
        <div className="topbar-id">
          <BrandMark size={26} />
          <span className="brand">{playing ? game.name : "Sosyal Oyunlar"}</span>
          <span className="room-code" title="Oda kodu">
            <span className="room-code-label">Oda</span> {room.code}
          </span>
        </div>
        <div className="topbar-actions">
          {playing && (
            <button className="bar-btn" aria-pressed={sound} onClick={() => setSound(!sound)} title={sound ? "Sesi kapat" : "Sesi aç"}>
              <SoundIcon on={sound} />
              <span className="bar-text">{sound ? "Ses açık" : "Ses kapalı"}</span>
            </button>
          )}
          {playing && isHost && (
            <button className="bar-btn" onClick={() => confirm("Oyunu bitirip lobiye dönülsün mü?") && act(request("room:backToLobby"))}>
              Lobiye dön
            </button>
          )}
          <button
            className="bar-btn"
            onClick={() => confirm(playing ? "Odadan çıkılsın mı? Oyunu senin yerine bir bot bitirecek." : "Odadan çıkılsın mı?") && act(request("room:leave"))}
          >
            Çık
          </button>
        </div>
      </header>
      <main className={playing ? "content wide" : "content"}>
        {room.status === "lobby" ? (
          <Lobby room={room} />
        ) : (
          <>
            {room.selectedGame === "tabu" && <TabuScreen room={room} />}
            {room.selectedGame === "vampir" && <VampirScreen room={room} />}
            {(room.selectedGame === "okey" || room.selectedGame === "okey101") && <OkeyScreen room={room} />}
            {room.selectedGame === "chess" && <ChessScreen room={room} />}
            {room.selectedGame === "pisti" && <PistiScreen room={room} />}
            {room.selectedGame === "batak" && <BatakScreen room={room} />}
            {room.selectedGame === "casus" && <CasusScreen room={room} />}
          </>
        )}
      </main>
    </div>
  );
}

/** A speaker, with sound waves when on and a cross when off. */
function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="bar-icon" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4Z" />
      {on ? <path d="M16 9c1.3 1.6 1.3 4.4 0 6M18.5 6.5c2.7 3 2.7 8 0 11" /> : <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />}
    </svg>
  );
}
