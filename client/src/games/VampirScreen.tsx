import { useState } from "react";
import type { RoomView } from "../../../shared/protocol";
import { VAMPIR_ROLE_NAMES, type VampirAction, type VampirRole, type VampirView } from "../../../shared/games/vampir";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf } from "../hooks";

const ROLE_HELP: Record<VampirRole, string> = {
  vampir: "Her gece diğer vampirlerle bir kurban seç. Gündüz köylü gibi davran.",
  koylu: "Gündüz tartış ve vampirleri bulup as.",
  doktor: "Her gece bir kişiyi koru. Vampirler onu seçerse kurtulur. Kendini de koruyabilirsin.",
  gozcu: "Her gece bir kişinin vampir olup olmadığını öğren.",
};

export function VampirScreen({ room }: { room: RoomView }) {
  const g = room.game as VampirView;
  const act = useAct();
  const send = (action: VampirAction) => act(request("game:action", action));
  const [revealed, setRevealed] = useState(false);
  const role = g.myRole;
  const alivePlayers = g.players.filter((p) => p.alive);

  const roleCard = role && (
    <button className={`role-card ${revealed ? "open" : ""} role-${role}`} onClick={() => setRevealed(!revealed)}>
      {revealed ? (
        <>
          <span className="small">Rolün</span>
          <span className="role-name">{VAMPIR_ROLE_NAMES[role]}</span>
          <span>{ROLE_HELP[role]}</span>
          <span className="small">Gizlemek için dokun.</span>
        </>
      ) : (
        <>
          <strong>Rolünü görmek için dokun</strong>
          <span className="small muted">Ekranına kimsenin bakmadığından emin ol.</span>
        </>
      )}
    </button>
  );

  const playerGrid = (onPick: ((id: string) => void) | null, selectedId: string | null, exclude?: (id: string) => boolean) => (
    <div className="pick-grid">
      {g.players.map((p) => {
        const disabled = !onPick || !p.alive || exclude?.(p.id);
        const voteCount = g.phase === "day" ? Object.values(g.votes).filter((v) => v === p.id).length : 0;
        const vampireMarks = Object.entries(g.vampireTargets).filter(([, t]) => t === p.id).length;
        return (
          <button
            key={p.id}
            className={`pick ${p.alive ? "" : "dead"} ${selectedId === p.id ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => onPick?.(p.id)}
          >
            <span>
              {nameOf(room, p.id)}
              {p.id === room.you && " (sen)"}
            </span>
            {p.role && p.id !== room.you && <span className="small">{VAMPIR_ROLE_NAMES[p.role]}</span>}
            {voteCount > 0 && <span className="badge">{voteCount} oy</span>}
            {vampireMarks > 0 && <span className="badge">{vampireMarks} vampir seçti</span>}
          </button>
        );
      })}
    </div>
  );

  let action: React.ReactNode = null;
  if (g.phase === "finished") {
    action = (
      <div className="phase-panel">
        <h2>{g.winner === "koy" ? "Köy kazandı." : "Vampirler kazandı."}</h2>
        <p className="muted">Herkesin rolü açıldı.</p>
        {playerGrid(null, null)}
      </div>
    );
  } else if (!g.alive) {
    action = (
      <div className="phase-panel">
        <h3>Öldün</h3>
        <p className="muted">Artık izleyicisin. Rolleri görebilirsin ama kimseye söyleme.</p>
        {playerGrid(null, null)}
      </div>
    );
  } else if (g.phase === "night") {
    const canAct = role !== "koylu";
    const exclude = role === "vampir" ? (id: string) => g.players.find((p) => p.id === id)?.role === "vampir" : role === "gozcu" ? (id: string) => id === room.you : undefined;
    const seerDone = role === "gozcu" && !g.mustAct;
    action = (
      <div className="phase-panel night">
        <h3>{g.day}. gece</h3>
        {!canAct && <p>Gözlerini kapat. Sabahı bekle…</p>}
        {role === "vampir" && <p>Kimi ısıracaksınız? Diğer vampirlerle anlaşın.</p>}
        {role === "doktor" && <p>Bu gece kimi koruyacaksın?</p>}
        {role === "gozcu" && <p>{seerDone ? "Bu geceki bakışını yaptın." : "Kimin kim olduğuna bakacaksın?"}</p>}
        {canAct && playerGrid(seerDone ? null : (id) => send({ type: "nightTarget", targetId: id }), g.myTarget, exclude)}
        <p className="muted small">{g.waitingCount} kişinin seçimi bekleniyor.</p>
      </div>
    );
  } else {
    const myVote = g.votes[room.you];
    action = (
      <div className="phase-panel">
        <h3>{g.day}. gün</h3>
        <p>Tartışın ve kimin asılacağını oylayın. Oylar herkes oy verince sayılır.</p>
        {playerGrid((id) => send({ type: "vote", targetId: id }), myVote ?? null)}
        <button className={`wide ${myVote === null ? "selected" : ""}`} onClick={() => send({ type: "vote", targetId: null })}>
          Kimseyi asma
        </button>
        <p className="muted small">
          {g.waitingCount} kişinin oyu bekleniyor · {alivePlayers.length} kişi hayatta
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      {roleCard}
      {role === "gozcu" && g.seerResults.length > 0 && (
        <div className="card">
          <h4>Gözcü notların</h4>
          <ul>
            {g.seerResults.map((r, i) => (
              <li key={i}>
                {nameOf(room, r.targetId)}: <strong>{r.isVampire ? "Vampir" : "vampir değil"}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {action}
      <div className="card">
        <h4>Olaylar</h4>
        <ul className="events">
          {g.events
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={i}>{e}</li>
            ))}
        </ul>
      </div>
    </div>
  );
}
