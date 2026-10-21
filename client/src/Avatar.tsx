const TONES = ["#b4432a", "#275d8c", "#2d6e47", "#a2711b", "#3f6f73", "#8a5a32", "#5b5246"];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.replace(/\(bot\)/, "").trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? "");
  return (first + second).toLocaleUpperCase("tr");
}

/** A round name token: initials on a colour picked from the player id. */
export function Avatar({ id, name, size = 44, className = "" }: { id: string; name: string; size?: number; className?: string }) {
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.38, background: TONES[hash(id) % TONES.length] }} aria-hidden>
      {initials(name)}
    </span>
  );
}
