import { useState } from "react";
import { GAMES, type GameId, type GameInfo, type RoomView } from "../../shared/protocol";
import { request } from "./socket";
import { useAct, useToast } from "./toast";
import { Toggle } from "./Toggle";
import { setColorblind, useColorblind } from "./prefs";
import { Avatar } from "./Avatar";
import { GameEmblem } from "./GameEmblem";
import { guideHref } from "./Guide";
import { CASUS_CATEGORIES } from "../../shared/games/casus";

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

const ESLI: Option = {
  key: "esli",
  label: "Eşli",
  toggle: true,
  choices: ON_OFF,
  initial: 0,
  hint: (v) => (v.esli ? "Karşılıklı oturanlar eş olur: listede 1. ile 3., 2. ile 4. sıradakiler. Puan takım olarak sayılır." : "Herkes kendi adına oynar."),
};

const OPTIONS: Record<GameId, Option[]> = {
  tabu: [
    { key: "roundSeconds", label: "Tur süresi", choices: nums([45, 60, 90, 120], " sn"), initial: 60 },
    { key: "rounds", label: "Tur sayısı (her takım)", choices: nums([1, 2, 3, 4, 5, 6]), initial: 3 },
    {
      key: "passes",
      label: "Pas hakkı (her tur)",
      choices: [...nums([0, 3, 5]), { value: -1, label: "Sınırsız" }],
      initial: 3,
      hint: "Pas puan kaybettirmez; kart değişir.",
    },
  ],
  vampir: [
    {
      key: "dayMinutes",
      label: "Gündüz süresi",
      choices: [{ value: 0, label: "Süresiz" }, ...nums([1, 2, 3, 5], " dk")],
      initial: 3,
      hint: (v) => (v.dayMinutes ? "Süre bitince verilen oylar sayılır; oy vermeyen çekimser kalır." : "Gün, herkes oy verince biter."),
    },
    {
      key: "reveal",
      label: "Ölenin rolü açıklansın",
      toggle: true,
      choices: ON_OFF,
      initial: 1,
      hint: (v) => (v.reveal ? "Ölen ya da asılan herkesin rolü köye duyurulur." : "Roller oyun sonuna kadar gizli kalır; tartışma zorlaşır."),
    },
  ],
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
    ESLI,
    TURN_TIME,
  ],
  okey101: [{ key: "rounds", label: "El sayısı", choices: nums([1, 2, 3, 4, 5]), initial: 3 }, ESLI, TURN_TIME],
  chess: [
    {
      key: "minutes",
      label: "Süre (kişi başı)",
      choices: [{ value: 0, label: "Süresiz" }, ...nums([3, 5, 10, 15], " dk")],
      initial: 10,
      hint: (v) => (v.minutes ? "Süresi biten kaybeder. Saat beyazın ilk hamlesinden sonra işlemeye başlar." : "Herkes istediği kadar düşünebilir."),
    },
    { key: "increment", label: "Hamle başı ek süre", choices: nums([0, 2, 5, 10], " sn"), initial: 0, when: (v) => v.minutes > 0 },
    {
      key: "botLevel",
      label: "Bot seviyesi",
      choices: [
        { value: 1, label: "Kolay" },
        { value: 2, label: "Orta" },
        { value: 3, label: "Zor" },
      ],
      initial: 2,
      hint: "Masaya bot eklediysen ya da bir oyuncunun yerine bot geçerse bu seviyede oynar.",
    },
  ],
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
  batak: [
    {
      key: "mode",
      label: "Oyun türü",
      choices: [
        { value: 0, label: "İhaleli" },
        { value: 1, label: "Koz maça" },
      ],
      initial: 0,
      hint: (v) =>
        v.mode
          ? "Koz hep maçadır. Herkes kaç el alacağını söyler; tutturan aldığı el kadar, tutturamayan sözü kadar eksi yazar."
          : "En yüksek ihaleyi veren kozu seçer ve ilk kartı atar. İhaleyi çıkaramazsa ihalesi kadar eksi yazar.",
    },
    {
      key: "teams",
      label: "Eşli",
      toggle: true,
      choices: ON_OFF,
      initial: 0,
      hint: (v) =>
        v.teams
          ? "Karşılıklı oturanlar eş olur: listede 1. ile 3., 2. ile 4. sıradakiler. Eşlerin aldığı eller birlikte sayılır, ihale en az 7."
          : "Herkes kendi adına oynar, ihale en az 4.",
    },
    { key: "rounds", label: "El sayısı", choices: nums([5, 10, 15, 20]), initial: 10 },
    TURN_TIME,
  ],
  casus: [
    {
      key: "category",
      label: "Kategori",
      choices: CASUS_CATEGORIES.map((label, value) => ({ value, label })),
      initial: 0,
      hint: (v) => (v.category ? "Kelimeler sadece bu kategoriden gelir; kategori casusa da söylenir." : "Her tur kelime rastgele bir kategoriden gelir."),
    },
    {
      key: "spies",
      label: "Casus sayısı",
      choices: nums([1, 2, 3]),
      initial: 1,
      hint: "Casuslar birbirini bilmez. Casuslar hep azınlıkta kalır: 2 casus için en az 5, 3 casus için en az 7 kişi gerekir.",
    },
    {
      key: "talkMinutes",
      label: "Soru süresi",
      choices: [{ value: 0, label: "Süresiz" }, ...nums([3, 5, 8], " dk")],
      initial: 5,
      hint: (v) =>
        v.talkMinutes
          ? "Süre bitince oylama başlar. Masanın yarısından fazlası isterse daha erken de geçilir."
          : "Masanın yarısından fazlası isteyince oylamaya geçilir.",
    },
    { key: "rounds", label: "Tur sayısı", choices: nums([1, 3, 5, 7]), initial: 3 },
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

  // Seats this game wants filled, so empty ones can be shown and given a bot.
  const seatsWanted = selected.playerCounts
    ? (selected.playerCounts.find((n) => n >= room.players.length) ?? Math.max(...selected.playerCounts))
    : selected.minPlayers === selected.maxPlayers
      ? selected.maxPlayers
      : Math.max(selected.minPlayers, room.players.length);
  const emptySeats = Math.max(0, seatsWanted - room.players.length);
  const canStart = connected >= selected.minPlayers && connected <= selected.maxPlayers && !badCount;

  return (
    <div className="lobby">
      <section className="lobby-seats">
        <div className="invite">
          <span className="invite-label">Oda kodu</span>
          <span className="code-display" data-room-code>
            {room.code}
          </span>
          <button onClick={share}>Davet linkini paylaş</button>
        </div>

        <h2 className="lobby-h">
          Masadakiler <span className="muted">{room.players.length}</span>
        </h2>
        <ul className="seat-list">
          {room.players.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <Avatar id={p.id} name={p.name} size={36} />
              <span className="grow seat-who">
                <span>
                  {p.name}
                  {p.id === room.you && <span className="muted"> (sen)</span>}
                </span>
                <span className="small muted">
                  {[p.id === room.hostId && "oda sahibi", p.bot && "bot", !p.connected && "bağlantı koptu"].filter(Boolean).join(" · ") || "hazır"}
                </span>
              </span>
              {isHost && p.id !== room.you && (
                <button
                  className="ghost small"
                  onClick={() => (p.bot || confirm(`${p.name} odadan çıkarılsın mı?`)) && act(request("room:kick", { playerId: p.id }))}
                >
                  Kaldır
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: emptySeats }, (_, i) => (
            <li key={`empty-${i}`} className="empty-seat">
              <span className="seat-hole" aria-hidden />
              <span className="grow muted">Boş koltuk</span>
              {isHost && selected.bots && (
                <button className="small" onClick={() => act(request("room:addBot"))}>
                  Bot oturt
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && selected.bots && emptySeats === 0 && connected < selected.maxPlayers && (
          <button className="ghost small bot-more" onClick={() => act(request("room:addBot"))}>
            Bir bot daha ekle
          </button>
        )}
        {!selected.bots && <p className="small muted seat-note">{selected.name} botla oynanmaz; arkadaşlarını çağır.</p>}
      </section>

      <section className="lobby-game">
        <h2 className="lobby-h">
          Ne oynuyoruz?
          <a className="text-link lobby-guide" href={guideHref(selected.id)}>
            {selected.name} nasıl oynanır
          </a>
        </h2>
        <ul className="game-choices">
          {GAMES.map((g) => (
            <li key={g.id}>
              <button
                className={`game-choice ${g.id === room.selectedGame ? "selected" : ""}`}
                disabled={!isHost && g.id !== room.selectedGame}
                aria-pressed={g.id === room.selectedGame}
                data-game={g.id}
                onClick={() => isHost && act(request("room:selectGame", { gameId: g.id }))}
              >
                <GameEmblem game={g.id} size={44} />
                <span className="choice-text">
                  <strong>{g.name}</strong>
                  <span className="desc">{g.description}</span>
                </span>
                <span className="choice-count">{playerCountLabel(g)}</span>
              </button>
            </li>
          ))}
        </ul>

        {isHost && options.length > 0 && (
          <div className="options">
            <h3 className="options-h">Masa ayarları</h3>
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
                  <div key={o.key} className="setting" role="radiogroup" aria-label={o.label}>
                    <span className="setting-label">{o.label}</span>
                    <div className="segmented">
                      {o.choices.map((c) => (
                        <label key={c.value}>
                          <input type="radio" name={o.key} checked={values[o.key] === c.value} onChange={() => setValue(o.key, c.value)} />
                          {c.label}
                        </label>
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
            <h3 className="options-h">Senin ekranın</h3>
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

        <div className="start-bar">
          {isHost ? (
            <>
              <span className="start-note">
                {connected < selected.minPlayers
                  ? `${selected.minPlayers - connected} oyuncu daha gerekli`
                  : connected > selected.maxPlayers
                    ? `En fazla ${selected.maxPlayers} kişi oynar`
                    : badCount
                      ? `${playerCountLabel(selected)} gerekli`
                      : `${connected} kişi hazır`}
              </span>
              <button className="primary big" data-start onClick={start} disabled={!canStart}>
                {selected.name} başlasın
              </button>
            </>
          ) : (
            <span className="start-note">Oyunu oda sahibi seçip başlatacak.</span>
          )}
        </div>
      </section>
    </div>
  );
}

function playerCountLabel(g: GameInfo) {
  if (g.playerCounts) return `${g.playerCounts.join(" ya da ")} kişi`;
  return g.minPlayers === g.maxPlayers ? `${g.minPlayers} kişi` : `${g.minPlayers}–${g.maxPlayers} kişi`;
}
