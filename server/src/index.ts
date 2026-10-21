import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import { Server } from "socket.io";
import type { Ack, ClientToServer, ServerToClient } from "../../shared/protocol.js";
import { RoomManager } from "./rooms.js";
import { GameError } from "./games/types.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(httpServer, {
  cors: process.env.NODE_ENV === "production" ? undefined : { origin: true },
});

// A browser keeps a random token in localStorage; the token maps to a stable
// player id so a refresh or a dropped connection rejoins the same seat.
const playerByToken = new Map<string, string>();
const socketsByPlayer = new Map<string, Set<string>>();

const rooms = new RoomManager((playerId, view) => {
  for (const socketId of socketsByPlayer.get(playerId) ?? []) io.to(socketId).emit("room:state", view);
});

function run(ack: ((res: Ack) => void) | undefined, fn: () => void) {
  try {
    fn();
    ack?.({ ok: true });
  } catch (err) {
    if (!(err instanceof GameError)) console.error(err);
    ack?.({ ok: false, error: err instanceof GameError ? err.message : "Beklenmeyen bir hata oluştu." });
  }
}

io.on("connection", (socket) => {
  let playerId: string | null = null;

  const requirePlayer = () => {
    if (!playerId) throw new GameError("Bağlantı hazır değil, sayfayı yenile.");
    return playerId;
  };

  socket.on("hello", ({ token }, ack) => {
    if (typeof token !== "string" || token.length < 8 || token.length > 100) {
      ack({ ok: false, error: "Geçersiz oturum." });
      return;
    }
    let id = playerByToken.get(token);
    if (!id) {
      id = randomUUID();
      playerByToken.set(token, id);
    }
    playerId = id;
    const sockets = socketsByPlayer.get(id) ?? new Set();
    sockets.add(socket.id);
    socketsByPlayer.set(id, sockets);
    ack({ ok: true, playerId: id });
    rooms.setConnected(id, true);
    rooms.resend(id);
  });

  socket.on("room:create", ({ name }, ack) => {
    try {
      const code = rooms.createRoom(requirePlayer(), name);
      ack({ ok: true, code });
    } catch (err) {
      ack({ ok: false, error: err instanceof GameError ? err.message : "Oda oluşturulamadı." });
    }
  });

  socket.on("room:join", ({ code, name }, ack) => {
    try {
      const joined = rooms.joinRoom(requirePlayer(), String(code ?? ""), name);
      ack({ ok: true, code: joined });
    } catch (err) {
      ack({ ok: false, error: err instanceof GameError ? err.message : "Odaya katılınamadı." });
    }
  });

  socket.on("room:leave", (ack) => run(ack, () => rooms.leaveRoom(requirePlayer())));
  socket.on("room:selectGame", ({ gameId }, ack) => run(ack, () => rooms.selectGame(requirePlayer(), gameId)));
  socket.on("room:start", ({ options }, ack) => run(ack, () => rooms.startGame(requirePlayer(), options ?? {})));
  socket.on("room:backToLobby", (ack) => run(ack, () => rooms.backToLobby(requirePlayer())));
  socket.on("room:addBot", (ack) => run(ack, () => rooms.addBot(requirePlayer())));
  socket.on("room:kick", ({ playerId: target }, ack) => run(ack, () => rooms.kick(requirePlayer(), target)));
  socket.on("room:chat", (data, ack) => run(ack, () => rooms.chat(requirePlayer(), data ?? {})));
  socket.on("game:action", (action, ack) =>
    run(ack, () => {
      if (!action || typeof action.type !== "string") throw new GameError("Geçersiz hamle.");
      rooms.gameAction(requirePlayer(), action);
    }),
  );

  socket.on("disconnect", () => {
    if (!playerId) return;
    const sockets = socketsByPlayer.get(playerId);
    sockets?.delete(socket.id);
    if (!sockets?.size) {
      socketsByPlayer.delete(playerId);
      rooms.setConnected(playerId, false);
    }
  });
});

// In production the server also serves the built client.
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: clientDist }));
}

httpServer.listen(PORT, () => {
  console.log(`socialgames sunucusu http://localhost:${PORT} adresinde`);
});
