/** The site's mark: an okey tile on a tea saucer, drawn in the table's colours. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <ellipse cx="16" cy="27" rx="14" ry="3.2" className="bm-saucer" />
      <rect x="8" y="3" width="16" height="22" rx="3" className="bm-tile" />
      <text x="16" y="18.5" textAnchor="middle" className="bm-num">
        7
      </text>
      <circle cx="16" cy="21.5" r="1.3" className="bm-dot" />
    </svg>
  );
}
