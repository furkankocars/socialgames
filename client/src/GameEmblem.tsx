import type { GameId } from "../../shared/protocol";

/**
 * Small drawn pictures of each game's own pieces, used in the game menu and
 * the lobby picker. Drawn with the same materials as the tables.
 */
export function GameEmblem({ game, size = 56 }: { game: GameId; size?: number }) {
  return (
    <svg className={`emblem emblem-${game}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {game === "okey" && (
        <>
          <g transform="rotate(-10 22 34)">
            <rect x="8" y="14" width="26" height="36" rx="4" className="e-tile" />
            <text x="21" y="38" className="e-num e-blue">
              8
            </text>
          </g>
          <g transform="rotate(8 42 32)">
            <rect x="29" y="12" width="26" height="36" rx="4" className="e-tile" />
            <text x="42" y="36" className="e-num e-red">
              7
            </text>
            <circle cx="42" cy="42" r="2" className="e-dot-red" />
          </g>
        </>
      )}
      {game === "okey101" && (
        <>
          <rect x="6" y="40" width="52" height="10" rx="2" className="e-wood" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={8 + i * 17} y="12" width="15" height="28" rx="3" className="e-tile" />
              <text x={15.5 + i * 17} y="31" className="e-num e-small e-black">
                {10 + i}
              </text>
            </g>
          ))}
        </>
      )}
      {game === "tabu" && (
        <>
          <rect x="12" y="6" width="40" height="52" rx="5" className="e-card" />
          <rect x="12" y="6" width="40" height="14" rx="5" className="e-band" />
          <rect x="12" y="15" width="40" height="5" className="e-band" />
          {[28, 36, 44].map((y) => (
            <g key={y}>
              <path d={`M19 ${y}h26`} className="e-line" />
              <path d={`M18 ${y + 2.5}l28 -5`} className="e-strike" />
            </g>
          ))}
        </>
      )}
      {game === "vampir" && (
        <>
          <circle cx="44" cy="18" r="10" className="e-moon" />
          <circle cx="49" cy="15" r="9" className="e-moon-cut" />
          <path d="M4 58V40l8-6 8 6v-4h6V28l10-8 10 8v10h6v-6l6-4 6 4v26Z" className="e-roof" />
          <rect x="31" y="34" width="4" height="5" className="e-window" />
        </>
      )}
      {game === "chess" && (
        <>
          <path
            d="M22 54h24v-4H22Zm2-6h20c-1-7-3-11-3-17 3 1 6 1 7-2-2-6-8-12-15-13l-2-4-2 5c-6 3-9 9-9 15h7c1 0 3-1 4-3 1 2 1 5-2 8-3 3-5 6-5 11Z"
            className="e-knight"
          />
          <circle cx="33" cy="22" r="1.6" className="e-eye" />
        </>
      )}
      {game === "pisti" && (
        <>
          <g transform="rotate(-14 26 36)">
            <rect x="10" y="12" width="28" height="40" rx="3.5" className="e-card" />
            <text x="16" y="24" className="e-corner e-red">
              7
            </text>
            <path d="M24 30c-3-4-8-1-6 3l6 7 6-7c2-4-3-7-6-3Z" className="e-heart" />
          </g>
          <g transform="rotate(10 40 34)">
            <rect x="26" y="10" width="28" height="40" rx="3.5" className="e-card" />
            <text x="32" y="22" className="e-corner e-black">
              J
            </text>
            <text x="40" y="40" className="e-num e-black">
              J
            </text>
          </g>
        </>
      )}
      {game === "casus" && (
        <>
          <path d="M10 14h16l4 5h24v37H10Z" className="e-folder" />
          <path d="M20 26c.6-3.6 1.4-6.4 3-7 1.3-.5 2.7 1 4.5 1s3.2-1.5 4.5-1c1.6.6 2.4 3.4 3 7" className="e-hat" />
          <path d="M14 27.5c4 1.8 8.6 2.6 13.5 2.6S37 29.3 41 27.5" className="e-spy" />
          <path d="M21.5 31c0 5 2.7 8.5 6 8.5s6-3.5 6-8.5M22 37.5l-5 4.5v6h21v-6l-5-4.5" className="e-spy" />
          <rect x="40" y="38" width="12" height="9" rx="1" transform="rotate(-10 46 42)" className="e-stamp" />
        </>
      )}
    </svg>
  );
}
