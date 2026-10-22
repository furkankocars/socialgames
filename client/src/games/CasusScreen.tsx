import { useEffect, useMemo, useState } from "react";
import "./casus.css";
import type { RoomView } from "../../../shared/protocol";
import type { CasusAction, CasusView } from "../../../shared/games/casus";
import { request } from "../socket";
import { useAct } from "../toast";
import { nameOf, useCountdown } from "../hooks";
import { GameLayout } from "../GameLayout";
import { Avatar } from "../Avatar";
import { buzz, chime, success } from "../sound";

/** The spy: a brimmed hat over a turned-up collar, drawn in line. */
export function SpyMark({ size = 56 }: { size?: number }) {
  return (
    <svg className="spy-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M15 17.5c.6-4.6 1.6-8.5 3.6-9.2 1.6-.6 3.4 1.2 5.4 1.2s3.8-1.8 5.4-1.2c2 .7 3 4.6 3.6 9.2" />
      <path d="M7 19c4.5 2 10.5 3 17 3s12.5-1 17-3" />
      <path d="M16.5 22.5c0 6.5 3.4 11 7.5 11s7.5-4.5 7.5-11" />
      <path d="M17 31 10.5 37v6h27v-6L31 31M17 31l7 9 7-9" />
    </svg>
  );
}

const OUTCOME_TEXT: Record<NonNullable<CasusView["outcome"]>, string> = {
  caught: "Casus yakalandı ve kelimeyi bilemedi.",
  escaped: "Masa yanlış kişiyi seçti, casus sıyrıldı.",
  guessed: "Casus kelimeyi bildi.",
  missed: "Casus erken tahmin etti ve yanıldı.",
};

export function CasusScreen({ room }: { room: RoomView }) {
  const g = room.game as CasusView;
  const act = useAct();
  const send = (action: CasusAction) => act(request("game:action", action));
  const isHost = room.hostId === room.you;
  const over = g.phase === "result" || g.phase === "finished";
  const [open, setOpen] = useState(false);
  const [guessing, setGuessing] = useState(false);
  // Words this player has ruled out, kept per round on this screen only.
  const [struck, setStruck] = useState<Set<string>>(new Set());
  const talkEndsAt = useMemo(() => (g.talkMsLeft === null ? null : Date.now() + g.talkMsLeft), [g]);
  const left = useCountdown(talkEndsAt);
  const clock = talkEndsAt ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : null;
  const many = g.spyCount > 1;
  const count = Object.keys(g.scores).length;

  useEffect(() => {
    setOpen(false);
    setGuessing(false);
    setStruck(new Set());
  }, [g.round]);

  useEffect(() => {
    if (g.phase === "vote") chime();
    if (over) (g.winner === "spies") === g.isSpy ? success() : buzz();
  }, [g.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const strike = (word: string) =>
    setStruck((s) => {
      const next = new Set(s);
      if (!next.delete(word)) next.add(word);
      return next;
    });

  const card = (
    <button className={`dossier ${open ? "open" : ""} ${g.isSpy ? "is-spy" : ""}`} onClick={() => setOpen(!open)} aria-pressed={open}>
      <span className="dossier-face dossier-back">
        <span className="stamp">Gizli</span>
        <strong>Kartını görmek için dokun</strong>
        <span className="small">Ekranına kimsenin bakmadığından emin ol. Tekrar dokununca kapanır.</span>
      </span>
      <span className="dossier-face dossier-front">
        {g.isSpy ? (
          <>
            <SpyMark size={64} />
            <span className="dossier-text">
              <span className="dossier-kicker">{many ? `${g.spyCount} casustan birisin` : "Sen"}</span>
              <span className="dossier-word">Casussun</span>
              <span className="dossier-help">Kelimeyi bilmiyorsun. Soruları dinle, belli etme, kelimeyi yakalamaya çalış.</span>
            </span>
          </>
        ) : (
          <span className="dossier-text">
            <span className="dossier-kicker">Gizli kelime · {g.wordCategory}</span>
            <span className="dossier-word">{g.word}</span>
            <span className="dossier-help">Casus{many ? "lar" : ""} bu kelimeyi bilmiyor. Soru sorarken de cevap verirken de kelimeyi ele verme.</span>
          </span>
        )}
      </span>
    </button>
  );

  const tokens = (onPick: ((id: string) => void) | null, selected: string | null) => (
    <ul className="agents">
      {room.players
        .filter((p) => g.scores[p.id] !== undefined)
        .map((p) => {
          const name = nameOf(room, p.id);
          const me = p.id === room.you;
          // Even a spy's own token stays plain, so a glance at the screen gives nothing away.
          const spy = over && g.spies.includes(p.id);
          const votesFor = g.votes ? Object.values(g.votes).filter((v) => v === p.id).length : 0;
          let note = "";
          if (g.phase === "reveal") note = g.ready.includes(p.id) ? "hazır" : "bakıyor";
          else if (g.phase === "talk") note = g.wantVote.includes(p.id) ? "oylama istiyor" : p.id === g.firstAsker ? "ilk soran" : "";
          else if (g.phase === "vote") note = g.voted.includes(p.id) ? "oy verdi" : "düşünüyor";
          else if (g.phase === "guess") note = p.id === g.guesserId ? "tahmin ediyor" : "";
          return (
            <li key={p.id}>
              <button
                className={`agent ${selected === p.id ? "selected" : ""} ${spy ? "spy" : ""} ${me ? "me" : ""}`}
                disabled={!onPick || me}
                onClick={() => onPick?.(p.id)}
              >
                <span className="agent-avatar">
                  <Avatar id={p.id} name={name} size={44} />
                  {spy && (
                    <span className="agent-hat">
                      <SpyMark size={22} />
                    </span>
                  )}
                </span>
                <span className="agent-name">
                  {name}
                  {me && " (sen)"}
                </span>
                {spy && <span className="agent-tag">casus</span>}
                {note && !spy && <span className="agent-note">{note}</span>}
                {votesFor > 0 && (
                  <span className="agent-votes" aria-label={`${votesFor} oy`}>
                    {Array.from({ length: votesFor }, (_, i) => (
                      <i key={i} />
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
    </ul>
  );

  const wordSlips = (onPick: (w: string) => void) => (
    <div className="slips">
      {g.candidates.map((w) => (
        <button key={w} className={`slip ${struck.has(w) ? "struck" : ""}`} onClick={() => onPick(w)}>
          {w}
        </button>
      ))}
    </div>
  );

  let kicker = `${g.round}. tur / ${g.rounds} · ${g.category}`;
  let title: string;
  let hint: React.ReactNode;
  let body: React.ReactNode;

  if (g.phase === "reveal") {
    const iAmReady = g.ready.includes(room.you);
    title = "Kartlar dağıtıldı";
    hint = `Kartına gizlice bak, sonra hazır de. ${g.ready.length} / ${count} kişi hazır.`;
    body = (
      <>
        {tokens(null, null)}
        <button className="chunky success wide" disabled={iAmReady} onClick={() => send({ type: "ready" })}>
          {iAmReady ? "Diğerleri bekleniyor" : "Kartımı gördüm, hazırım"}
        </button>
      </>
    );
  } else if (g.phase === "talk") {
    const want = g.wantVote.includes(room.you);
    const need = Math.floor(count / 2) + 1;
    title = g.firstAsker === room.you ? "İlk soruyu sen sor" : `İlk soruyu ${nameOf(room, g.firstAsker)} soruyor`;
    hint = "Sırayla birbirinize kelimeyle ilgili sorular sorun. Cevabını alan, sıradaki soruyu sorar. Casusu ele veren cevabı arayın.";
    if (guessing && g.isSpy) {
      title = "Kelime hangisi?";
      hint = "Doğru bilirsen kazanırsın, yanılırsan masa kazanır. Tahmin edince casus olduğun açığa çıkar.";
      body = (
        <>
          {wordSlips((w) => confirm(`"${w}" diye tahmin edilsin mi?`) && send({ type: "guess", word: w }))}
          <button className="chunky plain wide" onClick={() => setGuessing(false)}>
            Vazgeç, sorulara dön
          </button>
        </>
      );
    } else {
      body = (
        <>
          {tokens(null, null)}
          <div className="casus-actions">
            <button className={`chunky ${want ? "plain" : "success"}`} onClick={() => send({ type: "wantVote", on: !want })}>
              {want ? "Oylama isteğini geri al" : "Oylamaya geçelim"}
            </button>
            {g.isSpy && (
              <button className="chunky primary" onClick={() => setGuessing(true)}>
                Kelimeyi tahmin et
              </button>
            )}
          </div>
          <p className="casus-foot">
            Oylama için {need} kişi gerekli, {g.wantVote.length} kişi istiyor.
          </p>
        </>
      );
    }
  } else if (g.phase === "vote") {
    title = `Casus${many ? "lardan biri" : ""} kim?`;
    hint = `Şüphelendiğin kişiye dokun. Oylar herkes oy verince açılır; en çok oyu alan suçlanır, eşitlikte kimse suçlanmaz. ${g.voted.length} / ${count} oy verildi.`;
    body = tokens((id) => send({ type: "vote", targetId: id }), g.myVote);
  } else if (g.phase === "guess") {
    const mine = g.guesserId === room.you;
    title = mine ? "Yakalandın. Son şans" : `${nameOf(room, g.guesserId)} yakalandı`;
    hint = mine ? "Kelimeyi bilirsen yine de kazanırsın." : "Casus şimdi kelimeyi tahmin ediyor. Bilirse casus kazanır.";
    body = mine ? wordSlips((w) => confirm(`"${w}" diye tahmin edilsin mi?`) && send({ type: "guess", word: w })) : tokens(null, null);
  } else {
    const spiesWon = g.winner === "spies";
    kicker = g.phase === "finished" ? "Oyun bitti" : `${g.round}. tur bitti`;
    title = spiesWon ? `Casus${many ? "lar" : ""} kazandı` : "Masa kazandı";
    hint = (
      <>
        {OUTCOME_TEXT[g.outcome!]}
        {g.guess && g.outcome !== "escaped" && ` Tahmini: ${g.guess}.`}
      </>
    );
    body = (
      <>
        <div className="reveal-slip">
          <span className="reveal-label">Kelime</span>
          <span className="reveal-word">{g.word}</span>
          <span className="reveal-cat">{g.wordCategory}</span>
        </div>
        {tokens(null, null)}
        {g.phase === "result" &&
          (isHost ? (
            <button className="chunky success wide" onClick={() => send({ type: "next" })}>
              {g.round + 1}. turu dağıt
            </button>
          ) : (
            <p className="casus-foot">Sonraki turu oda sahibi başlatacak.</p>
          ))}
        {g.phase === "finished" && <p className="casus-foot">{standings(g, room)}</p>}
      </>
    );
  }

  const stage = (
    <div className="casus">
      {!over && card}
      <div className={`casus-table phase-${g.phase}`}>
        <header className="casus-head">
          <div>
            <span className="casus-kicker">{kicker}</span>
            <h2>{title}</h2>
            <p>{hint}</p>
          </div>
          {clock && <span className={`casus-clock ${left <= 30 ? "low" : ""}`}>{clock}</span>}
        </header>
        <div className="casus-body">{body}</div>
      </div>
    </div>
  );

  const words = (
    <div className="casus-words">
      <p className="small muted">
        Casus{many ? "lar" : ""} kelimeyi bu listeden tahmin eder. Elediğin kelimelerin üstünü çizmek için dokun; bunu sadece sen görürsün.
      </p>
      <ul>
        {g.candidates.map((w) => (
          <li key={w}>
            <button className={`word-line ${struck.has(w) ? "struck" : ""} ${over && w === g.word ? "hit" : ""}`} onClick={() => strike(w)}>
              {w}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const ranked = room.players.filter((p) => g.scores[p.id] !== undefined).sort((a, b) => g.scores[b.id] - g.scores[a.id]);
  const scores = (
    <div className="casus-scores">
      <table className="score-table">
        <tbody>
          {ranked.map((p) => (
            <tr key={p.id} className={p.id === room.you ? "me" : ""}>
              <td>{nameOf(room, p.id)}</td>
              <td className="num">{g.scores[p.id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Masa kazanırsa casus olmayan herkes 1, casus sıyrılırsa 2, kelimeyi bilirse 3 puan alır.</p>
      <ol className="casus-log">
        {g.log
          .slice()
          .reverse()
          .map((e, i) => (
            <li key={g.log.length - i}>{e}</li>
          ))}
      </ol>
    </div>
  );

  return (
    <GameLayout
      room={room}
      stage={stage}
      panels={[
        { id: "words", label: "Kelimeler", content: words },
        { id: "scores", label: "Puanlar", content: scores },
      ]}
    />
  );
}

function standings(g: CasusView, room: RoomView): string {
  const best = Math.max(...Object.values(g.scores));
  const leaders = Object.keys(g.scores).filter((id) => g.scores[id] === best);
  return `${leaders.map((id) => nameOf(room, id)).join(", ")} ${best} puanla ${leaders.length > 1 ? "birinci oldular" : "birinci oldu"}.`;
}
