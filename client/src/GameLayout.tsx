import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RoomView } from "../../shared/protocol";
import { TableChat } from "./games/TableChat";
import { Rules } from "./Rules";

export interface Panel {
  id: string;
  label: string;
  content: ReactNode;
}

const WIDE = "(min-width: 1080px)";

function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * The play screen of every game, laid out like the big online tables: the
 * table itself, and beside it (below it on a phone) the game's own panels,
 * the table chat and the rules. On a wide screen chat always stays open under
 * the tabs; on a phone it is one more tab, with a count of unread lines.
 */
export function GameLayout({ room, stage, panels = [], className = "" }: { room: RoomView; stage: ReactNode; panels?: Panel[]; className?: string }) {
  const wide = useWide();
  const chat: Panel = { id: "chat", label: "Sohbet", content: <TableChat room={room} /> };
  const rules: Panel = { id: "rules", label: "Kurallar", content: <Rules game={room.selectedGame} /> };
  const tabs = wide ? [...panels, rules] : [...panels, chat, rules];
  const [picked, setPicked] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === picked) ?? tabs[0];

  // Unread chat lines from others while the chat tab is closed.
  const others = room.chat.filter((c) => c.from !== room.you).length;
  const seen = useRef(others);
  const chatOpen = wide || current.id === "chat";
  if (chatOpen) seen.current = others;
  const unread = chatOpen ? 0 : others - seen.current;

  return (
    <div className={`play ${className}`}>
      <div className="play-stage">{stage}</div>
      <aside className="play-side">
        <div className="side-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === current.id} className="side-tab" onClick={() => setPicked(t.id)}>
              {t.label}
              {t.id === "chat" && unread > 0 && <span className="unread">{unread}</span>}
            </button>
          ))}
        </div>
        <div className="side-panel" role="tabpanel">
          {current.content}
        </div>
        {wide && <div className="side-chat">{chat.content}</div>}
      </aside>
    </div>
  );
}
