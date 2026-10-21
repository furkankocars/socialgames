import { useEffect, useState } from "react";
import "./vampir.css";
import type { RoomView } from "../../../shared/protocol";
import { VAMPIR_ROLE_NAMES, type VampirAction, type VampirRole, type VampirView } from "../../../shared/games/vampir";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf } from "../hooks";
import { Avatar } from "../Avatar";
import { chime, dusk } from "../sound";

const ROLE_HELP: Record<VampirRole, string> = {
  vampir: "Her gece diğer vampirlerle bir kurban seç. Gündüz köylü gibi davran.",
  koylu: "Gündüz tartış ve vampirleri bulup as.",
  doktor: "Her gece bir kişiyi koru. Vampirler onu seçerse kurtulur. Kendini de koruyabilirsin.",
  gozcu: "Her gece bir kişinin vampir olup olmadığını öğren.",
};

/** Line drawings for the role cards. */
function RoleEmblem({ role }: { role: VampirRole }) {
  return (
    <svg className="role-emblem" viewBox="0 0 48 48" aria-hidden>
      {role === "vampir" && (
        <>
          <path d="M6 16c6 6 12 9 18 9s12-3 18-9" />
          <path d="M14 21.5 16.5 33 19.5 23.5M28.5 23.5 31.5 33 34 21.5" />
          <path d="M24 34c1.6 2.6 2.4 4.2 2.4 5.4a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.8 2.4-5.4Z" className="fill" />
        </>
      )}
      {role === "koylu" && (
        <>
          <path d="M24 44V12" />
          <path d="M24 14c-4-1-6-4-6-8 4 1 6 4 6 8Zm0 0c4-1 6-4 6-8-4 1-6 4-6 8ZM24 23c-4-1-6-4-6-8 4 1 6 4 6 8Zm0 0c4-1 6-4 6-8-4 1-6 4-6 8ZM24 32c-4-1-6-4-6-8 4 1 6 4 6 8Zm0 0c4-1 6-4 6-8-4 1-6 4-6 8Z" />
        </>
      )}
      {role === "doktor" && (
        <>
          <circle cx="24" cy="24" r="18" />
          <path d="M20 13h8v7h7v8h-7v7h-8v-7h-7v-8h7Z" />
        </>
      )}
      {role === "gozcu" && (
        <>
          <path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24Z" />
          <circle cx="24" cy="24" r="6" />
          <circle cx="24" cy="24" r="2" className="fill" />
          <path d="M24 4v4M10 8l3 3M38 8l-3 3" />
        </>
      )}
    </svg>
  );
}

/** Sky with the moon or sun over the village rooftops. */
function Scene({ night, children }: { night: boolean; children: React.ReactNode }) {
  return (
    <div className={`scene ${night ? "night" : "day"}`}>
      <span className="sky-body" />
      {night && <span className="stars" />}
      <svg className="village" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden>
        <path d="M0 60V42l14-10 14 10v-6h10V24l16-12 16 12v18h12V30l10-8 10 8v12h8V8h4l8 10v24h14V34l14-10 14 10v8h10V28l18-14 18 14v14h14V36l12-8 12 8v6h16V22l12-10 12 10v20h10V32l14-10 14 10v10h14V24l16-12 16 12v18h12V34l10-8 10 8v26Z" />
      </svg>
      <div className="scene-text">{children}</div>
    </div>
  );
}

export function VampirScreen({ room }: { room: RoomView }) {
  const g = room.game as VampirView;
  const act = useAct();
  const send = (action: VampirAction) => act(request("game:action", action));
  const [revealed, setRevealed] = useState(false);
  const role = g.myRole;
  const alivePlayers = g.players.filter((p) => p.alive);
  const night = g.phase === "night";

  useEffect(() => {
    if (g.phase === "finished") return;
    if (g.phase === "day") chime();
    else dusk();
  }, [g.phase, g.day]);

  const roleCard = role && (
    <button className={`role-flip ${revealed ? "open" : ""} role-${role}`} onClick={() => setRevealed(!revealed)} aria-pressed={revealed}>
      <span className="role-face role-back">
        <strong>Rolünü görmek için dokun</strong>
        <span className="small">Ekranına kimsenin bakmadığından emin ol.</span>
      </span>
      <span className="role-face role-front">
        <RoleEmblem role={role} />
        <span className="role-text">
          <span className="role-kicker">Rolün</span>
          <span className="role-name">{VAMPIR_ROLE_NAMES[role]}</span>
          <span className="role-help">{ROLE_HELP[role]}</span>
        </span>
      </span>
    </button>
  );

  const playerGrid = (onPick: ((id: string) => void) | null, selectedId: string | null, exclude?: (id: string) => boolean) => (
    <div className="village-grid">
      {g.players.map((p) => {
        const disabled = !onPick || !p.alive || exclude?.(p.id);
        const voteCount = g.phase === "day" ? Object.values(g.votes).filter((v) => v === p.id).length : 0;
        const vampireMarks = Object.entries(g.vampireTargets).filter(([, t]) => t === p.id).length;
        const name = nameOf(room, p.id);
        return (
          <button
            key={p.id}
            className={`villager ${p.alive ? "" : "dead"} ${selectedId === p.id ? "selected" : ""} ${p.id === room.you ? "me" : ""}`}
            disabled={disabled}
            onClick={() => onPick?.(p.id)}
          >
            <span className="villager-avatar">
              <Avatar id={p.id} name={name} size={46} />
              {vampireMarks > 0 && (
                <span className="bite" title={`${vampireMarks} vampir seçti`}>
                  {vampireMarks}
                </span>
              )}
            </span>
            <span className="villager-name">
              {name}
              {p.id === room.you && " (sen)"}
            </span>
            {p.role && p.id !== room.you && <span className={`villager-role r-${p.role}`}>{VAMPIR_ROLE_NAMES[p.role]}</span>}
            {!p.alive && <span className="villager-role">öldü</span>}
            {voteCount > 0 && (
              <span className="votes" aria-label={`${voteCount} oy`}>
                {Array.from({ length: voteCount }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  let scene: React.ReactNode;
  let body: React.ReactNode = null;
  if (g.phase === "finished") {
    scene = (
      <Scene night={g.winner === "vampir"}>
        <span className="scene-kicker">Oyun bitti</span>
        <h2>{g.winner === "koy" ? "Köy kazandı" : "Vampirler kazandı"}</h2>
        <p>Herkesin rolü açıldı.</p>
      </Scene>
    );
    body = playerGrid(null, null);
  } else if (!g.alive) {
    scene = (
      <Scene night={night}>
        <span className="scene-kicker">
          {g.day}. {night ? "gece" : "gün"}
        </span>
        <h2>Öldün</h2>
        <p>Artık izleyicisin. Rolleri görebilirsin ama kimseye söyleme.</p>
      </Scene>
    );
    body = playerGrid(null, null);
  } else if (night) {
    const canAct = role !== "koylu";
    const exclude = role === "vampir" ? (id: string) => g.players.find((p) => p.id === id)?.role === "vampir" : role === "gozcu" ? (id: string) => id === room.you : undefined;
    const seerDone = role === "gozcu" && !g.mustAct;
    scene = (
      <Scene night>
        <span className="scene-kicker">{g.day}. gece</span>
        <h2>
          {!canAct && "Gözlerini kapat"}
          {role === "vampir" && "Kimi ısıracaksınız?"}
          {role === "doktor" && "Kimi koruyacaksın?"}
          {role === "gozcu" && (seerDone ? "Bakışını yaptın" : "Kime bakacaksın?")}
        </h2>
        <p>{!canAct ? "Sabahı bekle…" : role === "vampir" ? "Diğer vampirlerle anlaşın." : `${g.waitingCount} kişinin seçimi bekleniyor.`}</p>
      </Scene>
    );
    body = canAct ? playerGrid(seerDone ? null : (id) => send({ type: "nightTarget", targetId: id }), g.myTarget, exclude) : playerGrid(null, null);
  } else {
    const myVote = g.votes[room.you];
    scene = (
      <Scene night={false}>
        <span className="scene-kicker">{g.day}. gün</span>
        <h2>Köy meydanında oylama</h2>
        <p>Tartışın ve kimin asılacağını oylayın. Oylar herkes oy verince sayılır.</p>
      </Scene>
    );
    body = (
      <>
        {playerGrid((id) => send({ type: "vote", targetId: id }), myVote ?? null)}
        <button className={`chunky plain wide ${myVote === null ? "selected" : ""}`} onClick={() => send({ type: "vote", targetId: null })}>
          Kimseyi asma
        </button>
      </>
    );
  }

  return (
    <div className={`vampir ${night ? "is-night" : "is-day"}`}>
      {roleCard}
      <div className="village-board">
        {scene}
        <div className="village-body">
          {body}
          {g.phase !== "finished" && (
            <p className="village-foot">
              {g.waitingCount} kişi bekleniyor · {alivePlayers.length} kişi hayatta
            </p>
          )}
        </div>
      </div>
      {role === "gozcu" && g.seerResults.length > 0 && (
        <div className="card">
          <h4>Gözcü notların</h4>
          <ul className="seer-notes">
            {g.seerResults.map((r, i) => (
              <li key={i} className={r.isVampire ? "bad" : ""}>
                {nameOf(room, r.targetId)}
                <strong>{r.isVampire ? "Vampir" : "vampir değil"}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card">
        <h4>Köy defteri</h4>
        <ol className="events">
          {g.events
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={g.events.length - i}>{e}</li>
            ))}
        </ol>
      </div>
    </div>
  );
}
