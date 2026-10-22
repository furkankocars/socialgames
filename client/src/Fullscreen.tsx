import { useEffect, useState } from "react";

// Screen Orientation lock is missing from some TypeScript DOM typings.
type LockableOrientation = ScreenOrientation & { lock?: (o: "landscape") => Promise<void> };

const supported = typeof document !== "undefined" && document.fullscreenEnabled && matchMedia("(pointer: coarse)").matches;

/**
 * Full screen on a phone, as the game apps open: hides the browser bars and,
 * for the card and tile tables, turns the screen sideways where the browser
 * allows it (Android Chrome does; iPhone Safari has no full screen at all, so
 * the button stays hidden there and "Ana ekrana ekle" does the job).
 */
export function FullscreenButton({ landscape }: { landscape: boolean }) {
  const [on, setOn] = useState(() => supported && document.fullscreenElement !== null);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  if (!supported) return null;

  const toggle = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      if (landscape) await (screen.orientation as LockableOrientation).lock?.("landscape");
    } catch {
      // The browser said no; the page still works as it is.
    }
  };

  return (
    <button className="bar-btn" aria-pressed={on} onClick={toggle} title={on ? "Tam ekrandan çık" : "Tam ekran"}>
      <svg width="18" height="18" viewBox="0 0 24 24" className="bar-icon outline" aria-hidden>
        {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
      <span className="bar-text">{on ? "Küçült" : "Tam ekran"}</span>
    </button>
  );
}
