import { io, type Socket } from "socket.io-client";
import { useEffect, useState } from "react";
import type { Ack, ClientToServer, RoomView, ServerToClient } from "../../shared/protocol";

const TOKEN_KEY = "socialgames.token";
const NAME_KEY = "socialgames.name";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the session just won't survive a refresh.
  }
}

function sessionToken(): string {
  let token = readStorage(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    writeStorage(TOKEN_KEY, token);
  }
  return token;
}

export const savedName = () => readStorage(NAME_KEY) ?? "";
export const saveName = (name: string) => writeStorage(NAME_KEY, name);

export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: false });

let lastRoom: RoomView | null = null;
let ready = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

socket.on("connect", () => {
  socket.emit("hello", { token: sessionToken() }, (res) => {
    ready = res.ok;
    notify();
  });
});
socket.on("disconnect", () => {
  ready = false;
  notify();
});
socket.on("room:state", (room) => {
  lastRoom = room;
  notify();
});
socket.connect();

export function useConnection() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { room: lastRoom, ready };
}

type Events = ClientToServer;
type Payload<E extends keyof Events> = Parameters<Events[E]> extends [infer D, unknown] ? D : never;
type Result<E extends keyof Events> = Parameters<Events[E]> extends [...unknown[], (res: infer R) => void] ? R : never;

/** Emits an event and resolves with the server's acknowledgement. */
export function request<E extends keyof Events>(event: E, ...args: Payload<E> extends never ? [] : [Payload<E>]): Promise<Result<E>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: "Sunucu yanıt vermedi." } as Result<E>), 8000);
    const done = (res: Result<E>) => {
      clearTimeout(timer);
      resolve(res);
    };
    (socket.emit as (...a: unknown[]) => void)(event, ...args, done);
  });
}

export type { Ack };
