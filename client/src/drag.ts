import type { PointerEvent as ReactPointerEvent } from "react";

// Drag and drop with pointer events, so it works with a finger as well as a
// mouse. A press turns into a drag after a few pixels of movement; a press
// that doesn't move stays a normal click.

const THRESHOLD = 6;

export function pointerDrag(
  e: ReactPointerEvent<HTMLElement>,
  /** Selector for the elements that accept this drag. */
  targets: string,
  onDrop: (target: HTMLElement) => void,
  ghostSource: HTMLElement = e.currentTarget,
) {
  if (e.button !== 0) return;
  const id = e.pointerId;
  const startX = e.clientX;
  const startY = e.clientY;
  const layer = ghostSource.closest<HTMLElement>("[data-drag-layer]") ?? document.body;
  let ghost: HTMLElement | null = null;
  let over: HTMLElement | null = null;
  let offX = 0;
  let offY = 0;

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
      const r = ghostSource.getBoundingClientRect();
      offX = startX - r.left;
      offY = startY - r.top;
      ghost = ghostSource.cloneNode(true) as HTMLElement;
      ghost.classList.add("drag-ghost");
      ghost.style.width = `${r.width}px`;
      ghost.style.height = `${r.height}px`;
      layer.appendChild(ghost);
      ghostSource.classList.add("drag-source");
    }
    ghost.style.transform = `translate(${ev.clientX - offX}px, ${ev.clientY - offY}px)`;
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(targets) ?? null;
    if (hit !== over) {
      over?.classList.remove("drop-over");
      hit?.classList.add("drop-over");
      over = hit;
    }
  };

  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    if (!ghost) return;
    ghost.remove();
    ghostSource.classList.remove("drag-source");
    over?.classList.remove("drop-over");
    // The click that follows a drag must not also select or press anything.
    const swallow = (c: Event) => {
      c.stopPropagation();
      c.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    if (ev.type === "pointerup" && over) onDrop(over);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}
