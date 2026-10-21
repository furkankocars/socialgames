import type { ReactElement } from "react";
import { colorOf, typeOf, type PieceType } from "../../../shared/games/chess";

// Drawn pieces, turned from boxwood and ebony, so the set looks the same on
// every phone instead of depending on font glyphs or emoji.

const BASE = "M11.5 38.5c0-3 3.5-4.5 11-4.5s11 1.5 11 4.5Z";

const SHAPES: Record<PieceType, ReactElement> = {
  p: (
    <>
      <path className="body" d="M16 34c1-6 3.5-10 4.5-13.5h4c1 3.5 3.5 7.5 4.5 13.5Z" />
      <ellipse className="body" cx="22.5" cy="20.5" rx="5" ry="1.7" />
      <circle className="body" cx="22.5" cy="14" r="5.5" />
      <path className="body" d={BASE} />
    </>
  ),
  r: (
    <>
      <path className="body" d="M15.5 33.5 16.7 18h11.6l1.2 15.5Z" />
      <path className="body" d="M13 18v-8h4v2.6h3.4V10h4.2v2.6H28V10h4v8Z" />
      <path className="line" d="M17 22h11M16.4 29.5h12.2" />
      <path className="body" d={BASE} />
    </>
  ),
  n: (
    <>
      <path
        className="body"
        d="M24 10c6.5.5 10.5 7 9.8 15.5L33 34H15.5c-.5-4 1.5-6.5 5-8.5 1.5-.9 2-2.4 1.6-3.6-1.5 1.4-3.6 2-5.6 3-2 1-4 1.4-5 0-1-1.6-.4-3 .6-4 2.5-2.5 5-5 6.9-8.1L18.5 8.5l3 2 1.5-3Z"
      />
      <path className="line" d="M26.5 12.5c3.5 4 4.6 10 3.6 21" />
      <circle className="eye" cx="19.6" cy="15.6" r="1.1" />
      <circle className="eye" cx="12.6" cy="22.6" r=".6" />
      <path className="body" d={BASE} />
    </>
  ),
  b: (
    <>
      <path className="body" d="M17.5 34c1-3 1.5-4.5 1.5-6h7c0 1.5.5 3 1.5 6Z" />
      <ellipse className="body" cx="22.5" cy="28" rx="5.6" ry="1.7" />
      <path className="body" d="M22.5 9.5c-6 4-7.5 9.5-6 14 1 2.5 3.5 3.5 6 3.5s5-1 6-3.5c1.5-4.5 0-10-6-14Z" />
      <path className="line" d="M24.8 14.5 21 20.5" />
      <circle className="body" cx="22.5" cy="7.6" r="2.2" />
      <path className="body" d={BASE} />
    </>
  ),
  q: (
    <>
      <path className="body" d="M14.5 34 12 15l5 10 .5-12.5 3 12 2-13 2 13 3-12 .5 12.5 5-10L30.5 34Z" />
      <path className="line" d="M15 30c5-1.6 10-1.6 15 0" />
      {[
        [12, 14],
        [17.5, 11.6],
        [22.5, 10.6],
        [27.5, 11.6],
        [33, 14],
      ].map(([cx, cy]) => (
        <circle key={cx} className="body" cx={cx} cy={cy} r="1.9" />
      ))}
      <path className="body" d={BASE} />
    </>
  ),
  k: (
    <>
      <path className="cross" d="M22.5 5.5v10M19 9h7" />
      <path
        className="body"
        d="M14 34c-1-5.5-3.5-8.5-3-12 .5-3.5 4.5-5 8-3 1.5.8 2.8 2 3.5 3.5.7-1.5 2-2.7 3.5-3.5 3.5-2 7.5-.5 8 3 .5 3.5-2 6.5-3 12Z"
      />
      <path className="line" d="M22.5 22.5v10M14.6 30c5.3-1.6 10.5-1.6 15.8 0" />
      <path className="body" d={BASE} />
    </>
  ),
};

export function ChessPiece({ piece, className = "" }: { piece: string; className?: string }) {
  return (
    <svg className={`piece ${colorOf(piece) === "w" ? "white" : "black"} ${className}`} viewBox="0 0 45 45" aria-hidden>
      {SHAPES[typeOf(piece)]}
    </svg>
  );
}
