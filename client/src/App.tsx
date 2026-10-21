import { GAMES } from "../../shared/protocol";
import { request, useConnection } from "./socket";
import { ToastProvider, useAct } from "./toast";
import { Home } from "./Home";
import { Lobby } from "./Lobby";
import { TabuScreen } from "./games/TabuScreen";
import { VampirScreen } from "./games/VampirScreen";
import { OkeyScreen } from "./games/OkeyScreen";

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

  if (!ready) {
    return (
      <div className="center-screen">
        <div className="loader" />
        <p>Sunucuya bağlanılıyor…</p>
        <p className="muted small">Bir süredir kimse girmediyse sunucunun uyanması bir dakika kadar sürebilir.</p>
      </div>
    );
  }
  if (!room) return <Home />;

  const isHost = room.hostId === room.you;
  const game = GAMES.find((g) => g.id === room.selectedGame)!;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <span className="brand">Sosyal Oyunlar</span>
          <span className="room-code" title="Oda kodu">
            {room.code}
          </span>
        </div>
        <div className="topbar-actions">
          {room.status === "playing" && isHost && (
            <button className="ghost" onClick={() => confirm("Oyunu bitirip lobiye dönülsün mü?") && act(request("room:backToLobby"))}>
              Lobiye dön
            </button>
          )}
          <button className="ghost" onClick={() =>
              confirm(room.status === "playing" ? "Odadan çıkılsın mı? Oyunu senin yerine bir bot bitirecek." : "Odadan çıkılsın mı?") &&
              act(request("room:leave"))
            }>
            Çık
          </button>
        </div>
      </header>
      <main className="content">
        {room.status === "lobby" ? (
          <Lobby room={room} />
        ) : (
          <>
            <h2 className="game-title">{game.name}</h2>
            {room.selectedGame === "tabu" && <TabuScreen room={room} />}
            {room.selectedGame === "vampir" && <VampirScreen room={room} />}
            {(room.selectedGame === "okey" || room.selectedGame === "okey101") && <OkeyScreen room={room} />}
          </>
        )}
      </main>
    </div>
  );
}
