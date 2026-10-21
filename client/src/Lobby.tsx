import { useState } from "react";
import { GAMES, type GameId, type GameInfo, type RoomView } from "../../shared/protocol";
import { request } from "./socket";
import { useAct, useToast } from "./toast";
import { Toggle } from "./Toggle";
import { setColorblind, useColorblind } from "./prefs";

type Values = Record<string, number>;

interface Option {
  key: string;
  label: string;
  hint?: string | ((v: Values) => string);
  choices: { value: number; label: string }[];
  initial: number;
  /** An on/off setting (1 or 0), drawn as a switch. */
  toggle?: boolean;
  /** Shown only when this holds for the current values. */
  when?: (v: Values) => boolean;
}

const nums = (values: number[], suffix = "") => values.map((value) => ({ value, label: `${value}${suffix}` }));
const ON_OFF = [
  { value: 1, label: "Açık" },
  { value: 0, label: "Kapalı" },
];

const TURN_TIME: Option = {
  key: "turnSeconds",
  label: "Hamle süresi",
  hint: (v) => (v.turnSeconds ? "Süre dolan oyuncunun hamlesini bot yapar." : "Herkes istediği kadar düşünebilir."),
  choices: [{ value: 0, label: "Süresiz" }, ...nums([15, 30, 45, 60], " sn")],
  initial: 0,
};

const OPTIONS: Record<GameId, Option[]> = {
  tabu: [
    { key: "roundSeconds", label: "Tur süresi", choices: nums([45, 60, 90, 120], " sn"), initial: 60 },
    { key: "rounds", label: "Tur sayısı (her takım)", choices: nums([1, 2, 3, 4, 5, 6]), initial: 3 },
  ],
  vampir: [],
  okey: [
    {
      key: "katlamali",
      label: "Oyun türü",
      choices: [
        { value: 0, label: "Normal" },
        { value: 1, label: "Katlamalı" },
      ],
      initial: 0,
      hint: (v) =>
        v.katlamali
          ? "Herkes puanla başlar. Biten oyuncu diğerlerine 2 puan kaybettirir; çiftten ya da okey atarak biterse katlanır (4), ikisi birden 8. Biri sıfıra düşünce oyun biter."
          : "Biten oyuncu 2 puan alır, çiftten ya da okey atarak biterse 4. Eller bitince en çok puanı olan kazanır.",
    },
    { key: "startPoints", label: "Başlangıç puanı", choices: nums([10, 20, 30]), initial: 20, when: (v) => v.katlamali === 1 },
    { key: "rounds", label: "El sayısı", choices: nums([1, 3, 5, 7, 9]), initial: 5, when: (v) => v.katlamali !== 1 },
    {
      key: "gosterge",
      label: "Gösterge puanı",
      toggle: true,
      choices: ON_OFF,
      initial: 1,
      hint: (v) => `Göstergenin eşini ilk turunda gösteren ${v.katlamali ? "diğerlerine 1 puan kaybettirir" : "1 puan alır"}.`,
    },
    TURN_TIME,
  ],
  okey101: [{ key: "rounds", label: "El sayısı", choices: nums([1, 2, 3, 4, 5]), initial: 3 }, TURN_TIME],
  pisti: [
    {
      key: "teams",
      label: "Eşli oyna",
      toggle: true,
      choices: ON_OFF,
      initial: 1,
      hint: "4 kişide karşılıklı oturanlar eş olur, puanları birlikte sayılır. 2 kişide geçerli değil.",
    },
    {
      key: "target",
      label: "Oyun kaç sayıya",
      choices: nums([51, 101, 151]),
      initial: 101,
      hint: "Pişti 10, vale pişti 20, kartların çoğu 3, karo 10 3, sinek 2 2, her as ve vale 1 sayı.",
    },
    TURN_TIME,
  ],
};

const OPTIONS_KEY = "socialgames.options";

function loadValues(): Record<string, Values> {
  try {
    const raw = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function Lobby({ room }: { room: RoomView }) {
  const act = useAct();
  const toast = useToast();
  const isHost = room.hostId === room.you;
  const selected = GAMES.find((g) => g.id === room.selectedGame)!;
  // Remembered per game, so the host's usual table setup is ready next time.
  const [saved, setSaved] = useState<Record<string, Values>>(loadValues);
  const colorblind = useColorblind();
  const options = OPTIONS[room.selectedGame];
  const values: Values = Object.fromEntries(options.map((o) => [o.key, saved[room.selectedGame]?.[o.key] ?? o.initial]));
  const setValue = (key: string, value: number) => {
    const next = { ...saved, [room.selectedGame]: { ...values, [key]: value } };
    setSaved(next);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      // Settings just won't be remembered.
    }
  };
  const isOkey = room.selectedGame === "okey" || room.selectedGame === "okey101";
  const connected = room.players.filter((p) => p.connected).length;
  const badCount = !!selected.playerCounts && !selected.playerCounts.includes(connected);

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
    act(request("room:start", { options: values }));
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
              {p.bot && <span className="tag">bot</span>}
              {p.id === room.hostId && <span className="tag">oda sahibi</span>}
              {isHost && p.id !== room.you && (
                <button
                  className="ghost small"
                  onClick={() => (p.bot || confirm(`${p.name} odadan çıkarılsın mı?`)) && act(request("room:kick", { playerId: p.id }))}
                >
                  Çıkar
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && selected.bots && connected < selected.maxPlayers && (
          <div className="bot-add">
            <button className="ghost" onClick={() => act(request("room:addBot"))}>
              Bot ekle
            </button>
            <span className="small muted">Eksik koltuklarda bot oynar.</span>
          </div>
        )}
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
                <span className="small muted">{playerCountLabel(g)}</span>
                <span className="desc">{g.description}</span>
              </button>
            </li>
          ))}
        </ul>

        {isHost && options.length > 0 && (
          <div className="options">
            <h4>Ayarlar</h4>
            {options
              .filter((o) => !o.when || o.when(values))
              .map((o) => {
                const hint = typeof o.hint === "function" ? o.hint(values) : o.hint;
                if (o.toggle) {
                  return (
                    <div key={o.key} className="setting">
                      <Toggle on={values[o.key] === 1} onChange={(on) => setValue(o.key, on ? 1 : 0)} label={o.label} hint={hint} />
                    </div>
                  );
                }
                return (
                  <div key={o.key} className="setting" role="group" aria-label={o.label}>
                    <span className="setting-label">{o.label}</span>
                    <div className="segmented">
                      {o.choices.map((c) => (
                        <button key={c.value} type="button" aria-pressed={values[o.key] === c.value} onClick={() => setValue(o.key, c.value)}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {hint && <span className="muted small">{hint}</span>}
                  </div>
                );
              })}
          </div>
        )}

        {isOkey && (
          <div className="options">
            <h4>Senin ekranın</h4>
            <div className="setting">
              <Toggle
                on={colorblind}
                onChange={setColorblind}
                label="Renk körü modu"
                hint="Her rengin taşında ayrı bir şekil olur: kırmızı üçgen, sarı kare, mavi baklava, siyah daire."
              />
            </div>
          </div>
        )}

        {isHost ? (
          <button className="primary wide" onClick={start} disabled={connected < selected.minPlayers || connected > selected.maxPlayers || badCount}>
            {connected < selected.minPlayers
              ? `${selected.minPlayers - connected} oyuncu daha gerekli`
              : connected > selected.maxPlayers
                ? `En fazla ${selected.maxPlayers} kişi`
                : badCount
                  ? `${playerCountLabel(selected)} gerekli`
                  : `${selected.name} başlat`}
          </button>
        ) : (
          <p className="muted">Oyunu oda sahibi seçip başlatacak.</p>
        )}
      </section>
    </div>
  );
}

function playerCountLabel(g: GameInfo) {
  if (g.playerCounts) return `${g.playerCounts.join(" ya da ")} kişi`;
  return g.minPlayers === g.maxPlayers ? `${g.minPlayers} kişi` : `${g.minPlayers}–${g.maxPlayers} kişi`;
}
