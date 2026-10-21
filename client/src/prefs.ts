import { useEffect, useState } from "react";

// Per-device display preferences, kept in localStorage.

const COLORBLIND_KEY = "socialgames.colorblind";
const listeners = new Set<(on: boolean) => void>();

function read(): boolean {
  try {
    return localStorage.getItem(COLORBLIND_KEY) === "on";
  } catch {
    return false;
  }
}

let colorblind = read();
apply();

function apply() {
  if (colorblind) document.documentElement.dataset.colorblind = "";
  else delete document.documentElement.dataset.colorblind;
}

/** Colour-blind mode: every tile colour also gets its own shape. */
export function setColorblind(on: boolean) {
  colorblind = on;
  apply();
  try {
    localStorage.setItem(COLORBLIND_KEY, on ? "on" : "off");
  } catch {
    // Lasts until the page closes.
  }
  listeners.forEach((l) => l(on));
}

export function useColorblind(): boolean {
  const [on, setOn] = useState(colorblind);
  useEffect(() => {
    listeners.add(setOn);
    return () => void listeners.delete(setOn);
  }, []);
  return on;
}
