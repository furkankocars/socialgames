import { useEffect, useState } from "react";

// Short table sounds made with WebAudio, so there are no audio files to load.

const KEY = "socialgames.sound";
let enabled = readEnabled();
let ctx: AudioContext | null = null;
const listeners = new Set<(on: boolean) => void>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function audio(): AudioContext | null {
  if (!enabled || typeof AudioContext === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A tile set down on wood: a short filtered noise burst. */
export function clack(strength = 1) {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * 0.05);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800 + Math.random() * 600;
  filter.Q.value = 1.4;
  const gain = a.createGain();
  gain.gain.value = 0.55 * strength;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

function tone(freq: number, at: number, duration: number, volume: number, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + at;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** Two soft notes: it's your turn. */
export function chime() {
  tone(660, 0, 0.35, 0.12);
  tone(990, 0.12, 0.45, 0.1);
}

export function tick() {
  tone(1200, 0, 0.06, 0.06, "square");
}

export function buzz() {
  tone(140, 0, 0.35, 0.12, "sawtooth");
}

export function success() {
  tone(523, 0, 0.2, 0.1);
  tone(784, 0.09, 0.3, 0.1);
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Setting lasts until the page closes.
  }
  listeners.forEach((l) => l(on));
}

export function useSoundEnabled(): boolean {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    return () => void listeners.delete(setOn);
  }, []);
  return on;
}

/** A low bell for nightfall. */
export function dusk() {
  tone(196, 0, 1.1, 0.12);
  tone(147, 0.05, 1.3, 0.08);
}

/** A spoon tapped on a tea glass: someone sent a drink. */
export function clink() {
  tone(2350, 0, 0.25, 0.07, "triangle");
  tone(2350, 0.14, 0.3, 0.05, "triangle");
}
